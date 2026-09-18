// Prints the board as the contracts see it. Read-only; safe to run any time.
//
//   npm run state
import { clientFor, deployment, fmtGen, keystoreAccount, loadEnv, read, readOnlyClient } from "./lib.mjs";

loadEnv();

const { market, positions, network } = deployment();
const client = process.env.CASSANDRA_PW
  ? clientFor(await keystoreAccount(process.env.AGENT_KS ?? "cassandra-agent"))
  : readOnlyClient();

console.log(`network   ${network}`);
console.log(`market    ${market}`);
console.log(`positions ${positions}\n`);

const stats = await read(client, market, "stats");
const solvency = await read(client, market, "solvency");
console.log(
  `${stats.markets} markets (${stats.open} open, ${stats.settled} settled, ${stats.agent_opened} agent-opened)`,
);
console.log(`${fmtGen(stats.volume)} staked - escrow ${fmtGen(solvency.market_escrow)}, jury ${fmtGen(solvency.jury_bonded)}, fees ${fmtGen(solvency.fees)}\n`);

for (const m of await read(client, market, "list_markets", [0, 20])) {
  const pool = BigInt(m.yes_pool) + BigInt(m.no_pool);
  const yes = pool > 0n ? Number((BigInt(m.yes_pool) * 1000n) / pool) / 10 : 50;
  console.log(`#${String(m.id).padStart(3)} [${m.status.padEnd(8)}] ${m.category.padEnd(7)} ${yes.toFixed(1)}% YES  ${fmtGen(pool).padStart(12)}  ${m.question}`);
  if (m.status !== "OPEN") {
    const verdict = await read(client, market, "get_verdict", [Number(m.id)]);
    if (verdict.outcome) console.log(`     verdict ${verdict.outcome} (${verdict.confidence_band})  ${String(verdict.reasoning).slice(0, 110)}`);
    if (m.void_reason) console.log(`     void: ${m.void_reason}`);
  }
}
