// Tops up the deployer and the agent from Studio's built-in faucet.
//
//   CASSANDRA_PW=... npm run fund [amount]
//
// Studio being gasless does not mean free: there is no gas fee, but seeding a
// market and placing a bet both send real value, so both accounts still need a
// balance. The faucet the Studio UI exposes behind the droplet is reachable over
// RPC as `sim_fundAccount`, which is what this calls.
//
// It is a no-op on any other network - Asimov and Bradbury are funded from
// https://testnet-faucet.genlayer.foundation, which is behind a browser
// challenge and cannot be automated.
import { NETWORK, chain, keystoreAccount, loadEnv, fmtGen } from "./lib.mjs";

loadEnv();

if (NETWORK !== "studionet" && NETWORK !== "studioNext") {
  console.log(`${NETWORK} has no RPC faucet - fund the deployer at https://testnet-faucet.genlayer.foundation`);
  process.exit(0);
}

// sim_fundAccount takes WEI, not GEN. Passing 1000 quietly credits 1000 wei -
// a balance that reads as 0.0000 GEN and fails the first payable call for a
// reason that looks nothing like "you have no money".
const gen = Number(process.argv[2] ?? 500);
const amount = BigInt(gen) * 10n ** 18n;
const rpc = chain().rpcUrls.default.http[0];

async function call(method, params) {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const balance = async (address) => BigInt(await call("eth_getBalance", [address, "latest"]));

for (const name of [process.env.DEPLOYER_KS ?? "cassandra-deployer", process.env.AGENT_KS ?? "cassandra-agent"]) {
  const account = await keystoreAccount(name);
  const before = await balance(account.address);
  if (before >= amount / 2n) {
    console.log(`${name.padEnd(20)} ${account.address}  already holds ${fmtGen(before)}`);
    continue;
  }
  await call("sim_fundAccount", [account.address, Number(amount)]);
  const after = await balance(account.address);
  console.log(`${name.padEnd(20)} ${account.address}  ${fmtGen(before)} -> ${fmtGen(after)}`);
}
