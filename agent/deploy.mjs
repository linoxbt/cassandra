// Deploys both Cassandra contracts, wires them to each other, and proves the
// constructors really ran before recording anything.
//
//   CASSANDRA_PW=... npm run deploy
//
// Order matters: positions is deployed first so the market can be told where it
// lives at construction time, then positions is pointed back at the market. Both
// links are one-time on each side, so a half-finished deploy is visible rather
// than silently wrong.
import fs from "node:fs";
import path from "node:path";
import {
  NETWORK, ROOT, STATE_DIR, addr, clientFor, journal, keystoreAccount, loadEnv,
  read, saveJSON, waitFinal,
} from "./lib.mjs";

loadEnv();

const CONFIG = {
  trading_min_seconds: Number(process.env.TRADING_MIN ?? 300),
  trading_max_seconds: Number(process.env.TRADING_MAX ?? 30 * 86400),
  resolve_window_seconds: Number(process.env.RESOLVE_WINDOW ?? 3 * 86400),
  dispute_window_seconds: Number(process.env.DISPUTE_WINDOW ?? 3600),
  arbitration_window_seconds: Number(process.env.ARBITRATION_WINDOW ?? 2 * 86400),
  min_bet_atto: String(process.env.MIN_BET ?? 10n ** 15n),
  min_seed_atto: String(process.env.MIN_SEED ?? 2n * 10n ** 15n),
  dispute_bond_atto: String(process.env.DISPUTE_BOND ?? 10n ** 17n),
  min_juror_bond_atto: String(process.env.MIN_JUROR_BOND ?? 10n ** 17n),
  juror_slash_bps: Number(process.env.JUROR_SLASH_BPS ?? 5000),
  protocol_fee_bps: Number(process.env.PROTOCOL_FEE_BPS ?? 0),
  allow_public_markets: true,
};

const deployer = await keystoreAccount(process.env.DEPLOYER_KS ?? "cassandra-deployer");
const agent = await keystoreAccount(process.env.AGENT_KS ?? "cassandra-agent");
const client = clientFor(deployer);
console.log(`network  ${NETWORK}`);
console.log(`deployer ${deployer.address}`);
console.log(`agent    ${agent.address}\n`);

async function deploy(file, args, label) {
  const code = fs.readFileSync(path.join(ROOT, "contracts", file), "utf8");
  journal({ action: "deploy", file, label });
  const hash = await client.deployContract({ code, args });
  console.log(`${label} deploy tx ${hash}`);
  const tx = await waitFinal(client, hash, label);
  const address =
    tx?.data?.contract_address ?? tx?.data?.contractAddress ?? tx?.contractAddress ?? tx?.recipient ?? tx?.to_address;
  if (!address) throw new Error(`no contract address in the ${label} receipt`);
  return { address, hash };
}

async function send(address, functionName, args, label) {
  journal({ action: "write", address, functionName, label });
  const hash = await client.writeContract({ address, functionName, args, value: 0n });
  console.log(`${label} tx ${hash}`);
  await waitFinal(client, hash, label);
  return hash;
}

const positions = await deploy("positions.py", [], "positions");
const market = await deploy("cassandra.py", [addr(agent.address), JSON.stringify(CONFIG)], "market");

await send(market.address, "set_positions", [addr(positions.address)], "market.set_positions");
await send(positions.address, "set_market", [addr(market.address)], "positions.set_market");

// "Deployed successfully" only means the transaction landed. Reading the state
// back is the only thing that proves the constructors ran and the wiring took.
const config = await read(client, market.address, "get_config");
const wiredMarket = await read(client, positions.address, "get_market");
if (String(config.positions).toLowerCase() !== positions.address.toLowerCase()) {
  throw new Error(`market points at ${config.positions}, expected ${positions.address}`);
}
if (String(wiredMarket).toLowerCase() !== market.address.toLowerCase()) {
  throw new Error(`positions points at ${wiredMarket}, expected ${market.address}`);
}

console.log(`\nMARKET    ${market.address}`);
console.log(`POSITIONS ${positions.address}`);
console.log(config);

const record = {
  network: NETWORK,
  market: market.address,
  positions: positions.address,
  agent: agent.address,
  deployer: deployer.address,
  market_tx: market.hash,
  positions_tx: positions.hash,
  deployed_at: new Date().toISOString(),
  config,
};
saveJSON(path.join(STATE_DIR, `deployment.${NETWORK}.json`), record);

// Written straight into the frontend rather than into a .env the build may not
// pick up: an address that only reaches a local env file never reaches the app.
const addressesFile = path.join(ROOT, "frontend", "src", "lib", "contractAddresses.ts");
if (fs.existsSync(path.dirname(addressesFile))) {
  const existing = fs.existsSync(addressesFile) ? fs.readFileSync(addressesFile, "utf8") : "";
  const next = existing.includes("CONTRACTS")
    ? existing
        .replace(new RegExp(`(${NETWORK}:\\s*\\{[^}]*market:\\s*")[^"]*`), `$1${market.address}`)
        .replace(new RegExp(`(${NETWORK}:\\s*\\{[^}]*positions:\\s*")[^"]*`), `$1${positions.address}`)
    : null;
  if (next) {
    fs.writeFileSync(addressesFile, next);
    console.log(`\nwrote addresses into ${path.relative(ROOT, addressesFile)}`);
  }
}
console.log(`\nrecorded in agent/state/deployment.${NETWORK}.json`);
