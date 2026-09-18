// Creates the two keystores Cassandra needs, if they do not exist.
//
//   CASSANDRA_PW=... npm run setup
//
// Studio Network is gasless, so neither account needs funding there. On a real
// testnet, fund the deployer from the faucet before deploying.
import { KEYSTORE_DIR, loadEnv, makeKeystore } from "./lib.mjs";

loadEnv();

const names = [process.env.DEPLOYER_KS ?? "cassandra-deployer", process.env.AGENT_KS ?? "cassandra-agent"];
console.log(`keystore directory: ${KEYSTORE_DIR}`);
for (const name of names) {
  const { address, created } = await makeKeystore(name);
  console.log(`${created ? "created" : "exists "}  ${name.padEnd(22)} ${address}`);
}
console.log("\nKeep CASSANDRA_PW somewhere safe: without it these keystores cannot be opened.");
