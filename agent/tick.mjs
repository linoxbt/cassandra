// One cycle of the agent's work, safe to run by hand or on a timer.
//
//   CASSANDRA_PW=... npm run tick -- [--no-open] [--limit 1]
//
// The order matters: settle what is owed before opening anything new, so a
// stalled market can never be buried under fresh ones.
//
//   1. resolve   markets whose trading window has closed
//   2. arbitrate disputes whose window has passed
//   3. void      anything stuck past its deadline, so no pool is held forever
//   4. finalize  the jury on settled markets
//   5. open      new markets, if there is room
//
// Every write is journalled before it is submitted, so a crash between submit
// and receipt never causes a blind resubmit. Studio's limits are respected by
// doing a bounded amount of work per tick rather than draining the board.
import { openMarkets } from "./predictor.mjs";
import {
  clientFor, deployment, fmtGen, journal, keystoreAccount, loadEnv, nowSeconds, read, sleep, write,
} from "./lib.mjs";

loadEnv();

const MAX_WRITES_PER_TICK = Number(process.env.MAX_WRITES_PER_TICK ?? 6);

function parse(argv) {
  const args = { open: true, limit: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--no-open") args.open = false;
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
  }
  return args;
}

export async function tick(options = {}) {
  const args = { ...parse([]), ...options };
  const { market } = deployment();
  const agent = await keystoreAccount(process.env.AGENT_KS ?? "cassandra-agent");
  const client = clientFor(agent);
  const now = nowSeconds();
  const markets = await read(client, market, "list_markets", [0, 50]);
  const done = { resolved: [], arbitrated: [], voided: [], juries: [], opened: [] };
  let budget = MAX_WRITES_PER_TICK;

  const config = await read(client, market, "get_config");
  const disputeWindow = Number(config.dispute_window_seconds);
  const arbitrationWindow = Number(config.arbitration_window_seconds);

  console.log(`tick at ${new Date(now * 1000).toISOString()} - ${markets.length} markets`);

  for (const m of markets) {
    if (budget <= 0) break;
    const id = Number(m.id);

    // 1. resolve
    if (m.status === "CLOSED" && now >= Number(m.closes_at) && now <= Number(m.resolve_deadline)) {
      try {
        journal({ action: "resolve", market: id });
        const { tx } = await write(client, market, "resolve", [id], { label: `resolve #${id}` });
        const verdict = await read(client, market, "get_verdict", [id]);
        console.log(`  #${id} -> ${verdict.outcome} (${verdict.confidence_band})`);
        done.resolved.push({ id, outcome: verdict.outcome });
      } catch (err) {
        // A transient source failure is expected and simply retried next tick;
        // the market only voids once its own deadline passes.
        console.log(`  #${id} resolve deferred: ${String(err?.message ?? err).slice(0, 140)}`);
      }
      budget -= 1;
      continue;
    }

    // 2. arbitrate
    if (m.status === "DISPUTED") {
      const filed = Number((await read(client, market, "get_dispute", [id])).filed_at ?? 0);
      if (filed && now < filed + arbitrationWindow) {
        try {
          journal({ action: "arbitrate", market: id });
          await write(client, market, "arbitrate", [id], { label: `arbitrate #${id}` });
          const verdict = await read(client, market, "get_verdict", [id]);
          console.log(`  #${id} arbitrated -> ${verdict.outcome}`);
          done.arbitrated.push({ id, outcome: verdict.outcome });
        } catch (err) {
          console.log(`  #${id} arbitrate deferred: ${String(err?.message ?? err).slice(0, 140)}`);
        }
        budget -= 1;
        continue;
      }
    }

    // 3. void anything stuck past its deadline
    const stuckClosed = m.status === "CLOSED" && now > Number(m.resolve_deadline);
    if (stuckClosed || m.status === "DISPUTED") {
      try {
        journal({ action: "void", market: id });
        await write(client, market, "void_market", [id], { label: `void #${id}` });
        console.log(`  #${id} voided - refunds are open`);
        done.voided.push(id);
        budget -= 1;
      } catch {
        // Not voidable yet; nothing to do and nothing to report.
      }
      continue;
    }

    // 4. jury
    if (m.status === "FINAL" || m.status === "VOID") {
      const jury = await read(client, market, "get_jury", [id]);
      if (jury.length > 0 && jury.every((j) => j.payout === "0" && !j.settled)) {
        try {
          journal({ action: "finalize_jury", market: id });
          await write(client, market, "finalize_jury", [id], { label: `jury #${id}` });
          console.log(`  #${id} jury finalized (${jury.length} jurors)`);
          done.juries.push(id);
          budget -= 1;
        } catch {
          // Already finalized, which is the common case on a repeat tick.
        }
      }
    }
  }

  // 5. open, only with budget left over
  if (args.open && budget > 0) {
    const openCount = markets.filter((m) => m.status === "OPEN").length;
    if (openCount < Number(process.env.MAX_OPEN_MARKETS ?? 6)) {
      done.opened = await openMarkets({ limit: Math.min(args.limit, budget) });
    } else {
      console.log(`  ${openCount} markets already open - not adding more`);
    }
  }

  const stats = await read(client, market, "stats");
  const solvency = await read(client, market, "solvency");
  console.log(
    `  board: ${stats.markets} markets, ${stats.open} open, ${stats.settled} settled, ` +
      `${fmtGen(stats.volume)} staked, ${fmtGen(solvency.market_escrow)} in escrow`,
  );
  return done;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const result = await tick(parse(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}
