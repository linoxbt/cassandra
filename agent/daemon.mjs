// The predictor agent as a long-running process. Same code path as `npm run tick`.
//
//   CASSANDRA_PW=... npm run daemon
//
// Interval is jittered so a restart storm cannot line every instance up on the
// same second, and a failed tick never kills the loop - the next one re-reads
// the board from chain, which is the only state that matters.
import { loadEnv, sleep } from "./lib.mjs";
import { tick } from "./tick.mjs";

loadEnv();

const INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS ?? 15 * 60_000);
const JITTER_MS = Number(process.env.TICK_JITTER_MS ?? 90_000);

let running = true;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`\n${signal} - finishing the current tick, then stopping`);
    running = false;
  });
}

// Only when run directly. Importing this file used to start the loop, which
// means anything that so much as inspected the module began opening markets and
// spending GEN.
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (!isMain) {
  console.log("daemon.mjs imported rather than run; not starting the loop.");
} else {
await main();
}

async function main() {
console.log(`cassandra agent: every ~${Math.round(INTERVAL_MS / 60000)} minutes`);
while (running) {
  const started = Date.now();
  try {
    await tick({ limit: 1 });
  } catch (err) {
    console.error(`tick failed: ${String(err?.stack ?? err).slice(0, 600)}`);
  }
  if (!running) break;
  const wait = Math.max(5000, INTERVAL_MS - (Date.now() - started) + Math.floor(Math.random() * JITTER_MS));
  console.log(`  next tick in ${Math.round(wait / 1000)}s\n`);
  await sleep(wait);
}
console.log("stopped");
}
