// A live end-to-end run against a deployed Cassandra, one step per invocation.
//
//   CASSANDRA_PW=... npm run smoke -- <step>
//
// Steps: open · bet · transfer · resolve · dispute · arbitrate · claim · jury · state
//
// It is resumable on purpose. Studio's shared quota fits only a handful of
// writes in a window, and an LLM round takes minutes, so a single script that
// tries to do the whole lifecycle in one go will lose its place halfway and
// leave you guessing what already happened. State is kept in
// agent/state/smoke.<network>.json.
import path from "node:path";
import {
  GEN, NETWORK, STATE_DIR, addr, clientFor, deployment, fmtGen, keystoreAccount,
  loadEnv, loadJSON, nowSeconds, read, saveJSON, write,
} from "./lib.mjs";

loadEnv();

const step = (process.argv[2] ?? "state").toLowerCase();
const { market, positions } = deployment();
const FILE = path.join(STATE_DIR, `smoke.${NETWORK}.json`);
const state = loadJSON(FILE, {});

const deployer = await keystoreAccount(process.env.DEPLOYER_KS ?? "cassandra-deployer");
const agent = await keystoreAccount(process.env.AGENT_KS ?? "cassandra-agent");
const asDeployer = clientFor(deployer);
const asAgent = clientFor(agent);

const save = (patch) => saveJSON(FILE, Object.assign(state, patch));

async function show() {
  if (!state.market_id) return console.log("no market yet - run: npm run smoke -- open");
  const m = await read(asDeployer, market, "get_market", [Number(state.market_id)]);
  const v = await read(asDeployer, market, "get_verdict", [Number(state.market_id)]);
  console.log(`market #${m.id}  ${m.status}`);
  console.log(`  ${m.question}`);
  console.log(`  pools  YES ${fmtGen(m.yes_pool)} / NO ${fmtGen(m.no_pool)}   bets ${m.bet_count}`);
  console.log(`  closes ${new Date(Number(m.closes_at) * 1000).toISOString()}`);
  if (v && v.outcome) {
    console.log(`  verdict ${v.outcome} at ${v.confidence_band} confidence${v.arbitrated ? " (arbitrated)" : ""}`);
    console.log(`  reasoning: ${v.reasoning}`);
    console.log(`  evidence  ${v.evidence_url}`);
    console.log(`  digest    ${v.evidence_digest}`);
  }
  const jury = await read(asDeployer, market, "get_jury", [Number(state.market_id)]);
  if (jury.length) console.log(`  jury ${jury.map((j) => `${j.side} ${fmtGen(j.bond)}${j.settled ? " settled" : ""}`).join(", ")}`);
  console.log(`  solvency ${JSON.stringify(await read(asDeployer, market, "solvency"))}`);
}

switch (step) {
  case "open": {
    // A market whose settlement date has already passed. The answer is therefore
    // already determined, which makes the live run deterministic: it resolves in
    // one consensus round, and the expected outcome is known in advance, so the
    // run checks itself instead of just reporting whatever came back.
    const day = new Date(Date.now() - 86400_000);
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${pad(day.getUTCDate())}-${pad(day.getUTCMonth() + 1)}-${day.getUTCFullYear()}`;
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/history?date=${date}&localization=false`;
    const snapshot = await (await fetch(url, { headers: { "user-agent": "cassandra-smoke/0.1" } })).json();
    const settled = Number(snapshot?.market_data?.current_price?.usd);
    if (!Number.isFinite(settled)) throw new Error(`no settled price for ${date}; try again shortly`);
    // Put the line well below the settled price, so the honest answer is YES.
    const threshold = Math.floor(settled * 0.9);
    const closes = nowSeconds() + Number(process.env.SMOKE_LIFETIME ?? 360);
    console.log(`bitcoin settled at $${settled.toFixed(2)} on ${date}; line at $${threshold} -> expect YES`);
    const { tx } = await write(
      asAgent, market, "open_market",
      [
        `Was Bitcoin's daily price on ${date} above $${threshold.toLocaleString("en-US")}?`,
        "crypto", `bitcoin,${date}`,
        `Resolves YES if market_data.current_price.usd in the CoinGecko daily snapshot for ` +
        `"bitcoin" on ${date} is strictly above ${threshold}. Resolves NO otherwise. ` +
        `UNRESOLVED if the snapshot carries no USD price for that date.`,
        closes,
        "Smoke run: settles on a date that has already passed, so the expected answer is known.",
      ],
      { value: 2n * 10n ** 16n, label: "open_market" },
    );
    const markets = await read(asAgent, market, "list_markets", [0, 5]);
    const id = markets[0]?.id;
    save({ market_id: id, closes_at: closes, expect: "YES", settled, threshold, open_tx: tx?.hash ?? null });
    console.log(`opened market #${id}, closes ${new Date(closes * 1000).toISOString()}`);
    break;
  }
  case "bet": {
    await write(asDeployer, market, "bet", [Number(state.market_id), "YES"], {
      value: 3n * 10n ** 16n, label: "bet YES",
    });
    const held = await read(asDeployer, positions, "balance_of", [Number(state.market_id), "YES", addr(deployer.address)]);
    console.log(`position: ${fmtGen(held)} YES`);
    save({ bet: true });
    break;
  }
  case "transfer": {
    const amount = 10n ** 16n;
    await write(asDeployer, positions, "transfer", [Number(state.market_id), "YES", addr(agent.address), amount.toString()], {
      label: "transfer position",
    });
    const mine = await read(asDeployer, positions, "balance_of", [Number(state.market_id), "YES", addr(deployer.address)]);
    const theirs = await read(asDeployer, positions, "balance_of", [Number(state.market_id), "YES", addr(agent.address)]);
    console.log(`after transfer: deployer ${fmtGen(mine)} / agent ${fmtGen(theirs)}`);
    save({ transferred: true });
    break;
  }
  case "jury-stake": {
    await write(asDeployer, market, "stake_juror", [Number(state.market_id), "YES"], {
      value: 10n ** 17n, label: "stake_juror",
    });
    save({ juror: true });
    break;
  }
  case "resolve": {
    const left = Number(state.closes_at ?? 0) - nowSeconds();
    if (left > 0) {
      console.log(`market still trading for ${left}s - wait, then re-run`);
      break;
    }
    await write(asDeployer, market, "resolve", [Number(state.market_id)], { label: "resolve" });
    save({ resolved: true });
    await show();
    const verdict = await read(asDeployer, market, "get_verdict", [Number(state.market_id)]);
    if (state.expect && verdict.outcome !== state.expect) {
      throw new Error(
        `consensus answered ${verdict.outcome}, expected ${state.expect} ` +
        `(settled $${state.settled}, line $${state.threshold}) - this is the run failing, not passing`,
      );
    }
    console.log(`\nverdict ${verdict.outcome} matches the settled data. The contract read the evidence correctly.`);
    break;
  }
  case "dispute": {
    await write(
      asAgent, market, "dispute",
      [Number(state.market_id), "https://api.coingecko.com/api/v3/coins/bitcoin/history?date=01-01-2026&localization=false", "The snapshot I read gives a different price."],
      { value: 10n ** 17n, label: "dispute" },
    );
    save({ disputed: true });
    break;
  }
  case "arbitrate": {
    await write(asDeployer, market, "arbitrate", [Number(state.market_id)], { label: "arbitrate" });
    save({ arbitrated: true });
    await show();
    break;
  }
  case "claim": {
    const result = await write(asDeployer, market, "claim", [Number(state.market_id)], { label: "claim" });
    console.log(`claimed (tx ${result.hash})`);
    save({ claimed: true });
    break;
  }
  case "jury": {
    await write(asDeployer, market, "finalize_jury", [Number(state.market_id)], { label: "finalize_jury" });
    await write(asDeployer, market, "claim_jury", [Number(state.market_id)], { label: "claim_jury" });
    save({ jury_settled: true });
    break;
  }
  case "state":
    await show();
    break;
  default:
    console.log("steps: open bet transfer jury-stake resolve dispute arbitrate claim jury state");
}
