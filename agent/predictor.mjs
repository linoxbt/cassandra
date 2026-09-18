// The predictor agent: invents markets from live data and opens them on chain.
//
//   CASSANDRA_PW=... npm run propose -- [--dry] [--limit 2] [--categories crypto,weather]
//
// Two rules keep the agent honest about its own proposals:
//
//  1. Every question is built around the exact URL the CONTRACT will derive at
//     resolution. The agent never gets to choose the evidence afterwards.
//  2. Nothing is opened unless that URL answers right now. A market the agent
//     could not settle itself is a market it has no business asking.
//
// The questions are composed from live numbers and typed templates, so the agent
// needs no model and no API key to run. OPENROUTER_API_KEY, if set, only
// rewrites the phrasing; it never touches a threshold, a source or a criterion.
import { CATEGORIES, propose, settleable } from "./sources.mjs";
import { GEN, clientFor, deployment, journal, keystoreAccount, loadEnv, nowSeconds, read, write } from "./lib.mjs";

loadEnv();

export function parseArgs(argv) {
  const args = { dry: false, limit: 2, categories: CATEGORIES, seed: 2n * 10n ** 16n, closesIn: 2 * 3600 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--dry") args.dry = true;
    else if (flag === "--limit") args.limit = Number(argv[++i]);
    else if (flag === "--seed") args.seed = BigInt(argv[++i]);
    else if (flag === "--closes-in") args.closesIn = Number(argv[++i]);
    else if (flag === "--categories") args.categories = String(argv[++i]).split(",").map((c) => c.trim());
  }
  return args;
}

// Prefers variety over any one source dominating the board.
//
// Sorting by category load alone is not enough: within a single batch every
// candidate sees the same counts, so the comparator falls through to a tiebreak
// and the whole batch comes from whichever category wins it. CoinGecko alone
// offers four coins, so a board opened that way is all crypto.
//
// Instead the candidates are bucketed by category and drawn round-robin, with
// the categories that are already least represented on the board drawn first.
export function rank(candidates, existingCategories = []) {
  const load = new Map();
  for (const category of existingCategories) load.set(category, (load.get(category) ?? 0) + 1);

  const buckets = new Map();
  for (const candidate of candidates) {
    if (!buckets.has(candidate.category)) buckets.set(candidate.category, []);
    buckets.get(candidate.category).push(candidate);
  }

  const order = [...buckets.keys()].sort((a, b) => {
    const difference = (load.get(a) ?? 0) - (load.get(b) ?? 0);
    return difference !== 0 ? difference : a.localeCompare(b);
  });

  const ranked = [];
  for (let round = 0; ranked.length < candidates.length; round += 1) {
    for (const category of order) {
      const bucket = buckets.get(category);
      if (round < bucket.length) ranked.push(bucket[round]);
    }
  }
  return ranked;
}

export async function openMarkets(options = {}) {
  const args = { ...parseArgs([]), ...options };
  const closesAt = nowSeconds() + args.closesIn;
  console.log(`proposing from ${args.categories.join(", ")}`);
  const candidates = await propose(args.categories, closesAt);
  console.log(`  ${candidates.length} candidates from live feeds`);
  if (candidates.length === 0) return [];

  // A dry run is for checking the agent before anything is deployed, so it never
  // needs a deployment, a keystore or a chain read.
  let market = null;
  let client = null;
  let live = [];
  if (!args.dry) {
    market = deployment().market;
    const agent = await keystoreAccount(process.env.AGENT_KS ?? "cassandra-agent");
    client = clientFor(agent);
    const open = await read(client, market, "list_markets", [0, 50]);
    live = open.filter((m) => m.status === "OPEN");
    console.log(`  ${live.length} markets already open`);
  }
  const existing = new Set(live.map((m) => `${m.category}:${m.source_query}`));

  const ordered = rank(
    candidates.filter((c) => !existing.has(`${c.category}:${c.source_query}`)),
    live.map((m) => m.category),
  );

  const opened = [];
  for (const candidate of ordered) {
    if (opened.length >= args.limit) break;
    if (!(await settleable(candidate))) {
      console.log(`  skipped (evidence does not answer): ${candidate.question.slice(0, 60)}`);
      continue;
    }
    console.log(`\n  ${candidate.question}`);
    console.log(`  why: ${candidate.rationale}`);
    console.log(`  evidence: ${candidate.evidence_url}`);
    if (args.dry) {
      opened.push({ ...candidate, dry: true });
      continue;
    }
    journal({ action: "open_market", category: candidate.category, query: candidate.source_query });
    const { hash } = await write(
      client,
      market,
      "open_market",
      [
        candidate.question,
        candidate.category,
        candidate.source_query,
        candidate.criteria,
        candidate.closes_at,
        candidate.rationale,
      ],
      { value: BigInt(args.seed), label: `open ${candidate.category}` },
    );
    opened.push({ ...candidate, hash });
  }
  return opened;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const opened = await openMarkets(args);
  console.log(`\n${args.dry ? "would open" : "opened"} ${opened.length} market(s)`);
}
