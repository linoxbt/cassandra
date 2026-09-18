// The five evidence sources, and how the agent turns live data into a question
// the contract can settle by itself later.
//
// Two rules hold this together:
//
//  1. Every question is built around the SAME URL the contract will derive from
//     `(category, source_query)` at resolution. The agent never gets to point
//     the contract somewhere else afterwards, and a question it cannot settle is
//     a question it must not ask.
//  2. Thresholds come from live numbers, not from the model. A market is only
//     interesting if the answer is genuinely open, so a threshold is placed just
//     far enough from the current value to be a real question.
//
// All five sources are keyless. An optional OPENROUTER_API_KEY only rewrites the
// phrasing; nothing about resolution depends on it.

export const CATEGORIES = ["crypto", "news", "weather", "sports", "pageviews"];

export function evidenceUrl(category, query) {
  switch (category) {
    case "crypto":
      return `https://api.coingecko.com/api/v3/simple/price?ids=${query}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
    case "weather":
      return `https://api.open-meteo.com/v1/forecast?${query}&timezone=UTC`;
    case "news":
      return `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=25&sort=datedesc`;
    case "sports":
      return `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${query}`;
    case "pageviews": {
      // `Article,YYYYMMDD,YYYYMMDD` - assembled from parts, exactly as the
      // contract does, so the agent can never propose a URL it would reject.
      const [article, start, end] = String(query).split(",").map((part) => part.trim());
      return (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article" +
        `/en.wikipedia/all-access/user/${article}/daily/${start}/${end}`
      );
    }
    default:
      throw new Error(`unknown category ${category}`);
  }
}

// Mirrors the contract's own validation, so the agent cannot propose a market
// the contract will refuse.
const QUERY_OK = /^[A-Za-z0-9_\-.,=&+ ]+$/;
export function validQuery(query) {
  return typeof query === "string" && query.length > 0 && query.length <= 200 && QUERY_OK.test(query);
}

async function fetchJson(url, { timeoutMs = 15000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", ...headers },
    });
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const COINS = [
  ["bitcoin", "Bitcoin"],
  ["ethereum", "Ether"],
  ["solana", "Solana"],
  ["chainlink", "Chainlink"],
];

const CITIES = [
  ["London", 51.51, -0.13],
  ["Berlin", 52.52, 13.41],
  ["Lagos", 6.45, 3.4],
  ["Singapore", 1.35, 103.82],
  ["São Paulo", -23.55, -46.63],
];

// World-news topics for the GDELT feed: subjects that are genuinely open, where
// whether the story is still live is a judgement rather than a number.
const TOPICS = [
  ["ceasefire", "a ceasefire agreement"],
  ["central+bank+rate", "a central bank rate decision"],
  ["general+election", "a general election result"],
  ["semiconductor+export", "semiconductor export controls"],
];

// Wikipedia articles whose daily readership moves with the news. Attention is
// the measurable thing here: a story breaking shows up as a spike days before
// anyone agrees on what it means.
const ARTICLES = [
  ["Bitcoin", "Bitcoin"],
  ["Artificial_intelligence", "artificial intelligence"],
  ["Climate_change", "climate change"],
  ["Nuclear_fusion", "nuclear fusion"],
  ["Federal_Reserve", "the Federal Reserve"],
];

// Wikimedia asks every client to identify itself; an anonymous request can be
// refused outright.
const UA = { "user-agent": "cassandra-predictor/0.1 (https://github.com/linoxbt/cassandra)" };

const isoCompact = (offsetDays = 0) => isoDay(offsetDays).replace(/-/g, "");

const isoDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
};

// -- crypto ----------------------------------------------------------------

async function cryptoCandidates(closesAt) {
  const ids = COINS.map(([id]) => id).join(",");
  const data = await fetchJson(evidenceUrl("crypto", ids));
  const out = [];
  for (const [id, label] of COINS) {
    const row = data?.[id];
    const price = Number(row?.usd);
    if (!Number.isFinite(price) || price <= 0) continue;
    const change = Number(row?.usd_24h_change ?? 0);
    // A threshold roughly one day's move away: far enough that the answer is not
    // already known, close enough that it can actually be reached.
    const move = Math.max(Math.abs(change) / 100, 0.01);
    const up = change >= 0;
    const threshold = roundNicely(price * (1 + (up ? move : -move)));
    out.push({
      category: "crypto",
      source_query: id,
      question: `Will ${label} trade ${up ? "above" : "below"} $${threshold.toLocaleString("en-US")} by ${stamp(closesAt)}?`,
      criteria:
        `Resolves YES if the CoinGecko USD price for "${id}" is strictly ` +
        `${up ? "above" : "below"} ${threshold} at settlement, read from the evidence feed. ` +
        `Resolves NO otherwise. UNRESOLVED if the feed does not carry a usable price for "${id}".`,
      rationale:
        `${label} is at $${price.toLocaleString("en-US")} with a ${change.toFixed(2)}% move over 24h; ` +
        `the threshold sits about one day's move ${up ? "above" : "below"} spot.`,
      observed: { price, change_24h: change, threshold },
    });
  }
  return out;
}

function roundNicely(value) {
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 2);
  return Math.round(value / magnitude) * magnitude;
}

// -- weather ---------------------------------------------------------------

async function weatherCandidates(closesAt) {
  const day = isoDay(1);
  const out = [];
  for (const [city, lat, lon] of CITIES) {
    const query =
      `latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum&start_date=${day}&end_date=${day}`;
    if (!validQuery(query)) continue;
    let data;
    try {
      data = await fetchJson(evidenceUrl("weather", query));
    } catch {
      continue;
    }
    const high = Number(data?.daily?.temperature_2m_max?.[0]);
    if (!Number.isFinite(high)) continue;
    const threshold = Math.round(high);
    out.push({
      category: "weather",
      source_query: query,
      question: `Will the daily maximum temperature in ${city} reach ${threshold}°C on ${day}?`,
      criteria:
        `Resolves YES if daily.temperature_2m_max[0] in the Open-Meteo evidence feed is ` +
        `at least ${threshold} for ${day}. Resolves NO if it is lower. UNRESOLVED if the ` +
        `feed carries no maximum for that date.`,
      rationale: `The current forecast maximum for ${city} on ${day} is ${high.toFixed(1)}°C, right on the line.`,
      observed: { forecast_high: high, threshold, day },
    });
  }
  return out;
}

// -- news (GDELT) ----------------------------------------------------------

// GDELT allows one request every 5 seconds per caller and answers 429 with a
// plain-text scolding otherwise; it can also take 20s to reply. The agent probes
// one topic per tick rather than walking the list. At resolution each validator
// fetches once, from its own host.
async function newsCandidates(closesAt) {
  const out = [];
  const offset = Math.floor(Date.now() / 60000) % TOPICS.length;
  for (const [query, label] of [TOPICS[offset]]) {
    let data;
    try {
      data = await fetchJson(evidenceUrl("news", query), { timeoutMs: 30000 });
    } catch {
      // One retry past the 5-second window before giving up on the category.
      await new Promise((r) => setTimeout(r, 6000));
      try {
        data = await fetchJson(evidenceUrl("news", query), { timeoutMs: 30000 });
      } catch (err) {
        console.log(`  news: ${String(err?.message ?? err).slice(0, 80)}`);
        continue;
      }
    }
    const articles = Array.isArray(data?.articles) ? data.articles : [];
    if (articles.length === 0) continue;
    out.push({
      category: "news",
      source_query: query,
      question: `Will the world news feed still be carrying ${label} by ${stamp(closesAt)}?`,
      criteria:
        `Resolves YES if the GDELT article list in the evidence feed contains at least one ` +
        `article about ${label} dated within 24 hours of settlement. Resolves NO if the feed ` +
        `carries no such recent article. UNRESOLVED if the feed returns no article list at all.`,
      rationale:
        `GDELT currently lists ${articles.length} articles for "${query}", led by ` +
        `"${String(articles[0]?.title ?? "").slice(0, 80)}".`,
      observed: { article_count: articles.length },
    });
  }
  return out;
}

// -- Wikipedia pageviews ---------------------------------------------------

// Attention as a fact rather than an interpretation: one article, one daily
// number, read off the same feed by the agent and by every validator.
// A day's pageviews are only published the day after, so a market that closes
// sooner than this can only ever read an empty feed. The close is pushed out
// here rather than in `propose`, so the question quotes the time the market
// actually closes instead of the one that was asked for.
const PAGEVIEWS_MIN_CLOSE = 40 * 3600;

async function pageviewsCandidates(closesAt) {
  // Pageviews lag by a day or so, so the baseline window ends yesterday.
  const end = isoCompact(-1);
  const start = isoCompact(-8);
  const settles = Math.max(closesAt, Math.floor(Date.now() / 1000) + PAGEVIEWS_MIN_CLOSE);
  const out = [];
  for (const [article, label] of ARTICLES) {
    const query = `${article},${start},${end}`;
    if (!validQuery(query)) continue;
    let data;
    try {
      data = await fetchJson(evidenceUrl("pageviews", query), { headers: UA });
    } catch {
      continue;
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    const views = items.map((i) => Number(i?.views)).filter(Number.isFinite);
    if (views.length < 3) continue;
    const peak = Math.max(...views);
    const median = [...views].sort((a, b) => a - b)[Math.floor(views.length / 2)];
    // A threshold above the peak of the baseline week: reaching it means
    // attention genuinely rose, not that a normal day happened.
    const threshold = roundNicely(peak * 1.15);
    out.push({
      category: "pageviews",
      source_query: `${article},${isoCompact(0)},${isoCompact(1)}`,
      question: `Will interest in ${label} spike past ${threshold.toLocaleString("en-US")} daily readers by ${stamp(settles)}?`,
      criteria:
        `Resolves YES if any daily "views" figure in the Wikimedia pageviews evidence feed for ` +
        `the article "${article}" is at least ${threshold}. Resolves NO if every day in the feed ` +
        `is below it. UNRESOLVED if the feed carries no daily figures for that range.`,
      rationale:
        `Over the previous week "${article}" ran at a median of ${median.toLocaleString("en-US")} ` +
        `readers a day, peaking at ${peak.toLocaleString("en-US")}; the threshold is 15% above that peak.`,
      observed: { median, peak, threshold, baseline: `${start}-${end}` },
      // The window this market settles on has not happened yet, so the live
      // check has to prove the endpoint answers for THIS ARTICLE rather than
      // that the answer already exists - which for a prediction it never does.
      probe_url: evidenceUrl("pageviews", query),
      min_close_seconds: PAGEVIEWS_MIN_CLOSE,
    });
  }
  return out;
}

// -- sports ----------------------------------------------------------------

async function sportsCandidates(closesAt) {
  const day = isoDay(1);
  let data;
  try {
    data = await fetchJson(evidenceUrl("sports", day));
  } catch {
    return [];
  }
  const events = Array.isArray(data?.events) ? data.events : [];
  const pick = events.find((e) => e?.strHomeTeam && e?.strAwayTeam);
  if (!pick) return [];
  return [
    {
      category: "sports",
      source_query: day,
      question: `Will ${pick.strHomeTeam} beat ${pick.strAwayTeam} on ${day}?`,
      criteria:
        `Resolves YES if the evidence feed shows ${pick.strHomeTeam} with a higher final score than ` +
        `${pick.strAwayTeam} for their fixture on ${day}. Resolves NO on a draw or an away win. ` +
        `UNRESOLVED if the fixture is missing from the feed or has no final score.`,
      rationale: `${events.length} fixtures are scheduled for ${day}; this one has both sides named and a clean scoreline to read.`,
      observed: { fixtures: events.length, event: pick.strEvent ?? "" },
    },
  ];
}

function stamp(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

const BUILDERS = {
  crypto: cryptoCandidates,
  pageviews: pageviewsCandidates,
  weather: weatherCandidates,
  news: newsCandidates,
  sports: sportsCandidates,
};

// Returns proposals the contract would accept, each already checked against the
// live feed it will be settled from.
export async function propose(categories, closesAt) {
  const out = [];
  for (const category of categories) {
    const builder = BUILDERS[category];
    if (!builder) continue;
    try {
      const candidates = await builder(closesAt);
      for (const candidate of candidates) {
        if (!validQuery(candidate.source_query)) continue;
        if (candidate.question.length > 300 || candidate.criteria.length > 700) continue;
        const closes = Math.max(closesAt, Math.floor(Date.now() / 1000) + (candidate.min_close_seconds ?? 0));
        const evidence_url = evidenceUrl(candidate.category, candidate.source_query);
        out.push({
          ...candidate,
          closes_at: closes,
          evidence_url,
          probe_url: candidate.probe_url ?? evidence_url,
        });
      }
    } catch (err) {
      console.log(`  ${category}: source unavailable (${String(err?.message ?? err).slice(0, 80)})`);
    }
  }
  return out;
}

// A last check before any money is committed: the source the contract will read
// has to be answering right now. A market the agent could not settle is a market
// it has no business opening.
//
// It probes `probe_url`, which for most categories is the settlement URL itself.
// Where a market settles on a window that has not happened yet - a pageviews day
// is only published the day after - the probe is the same endpoint over a window
// that has. That proves the source works for this subject, which is the most
// that can honestly be checked about a prediction in advance. Requiring the
// settlement URL itself to answer would silently exclude every forward-looking
// market, which is all of them.
export async function settleable(candidate) {
  try {
    const url = candidate.probe_url ?? candidate.evidence_url;
    const res = await fetch(url, { headers: { accept: "application/json", ...UA } });
    if (!res.ok) return false;
    const text = await res.text();
    return text.length > 2;
  } catch {
    return false;
  }
}
