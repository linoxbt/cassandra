// Chain access for the Cassandra agent and operator scripts.
//
// Keystores are decrypted in memory only; set CASSANDRA_PW. The raw private key
// is never written to disk in the clear, logged, or passed on a command line.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetAsimov } from "genlayer-js/chains";
import { CalldataAddress } from "genlayer-js/types";
import { Wallet } from "ethers";
import { backoffMs, classify, errorText, statusName } from "./txstatus.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const STATE_DIR = path.join(HERE, "state");
export const KEYSTORE_DIR = process.env.KEYSTORE_DIR ?? "/root/.genlayer/keystores";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const CHAINS = { studionet, testnetAsimov };
export const NETWORK = process.env.GL_CHAIN ?? "studionet";

export function chain() {
  const picked = CHAINS[NETWORK];
  if (!picked) throw new Error(`unknown GL_CHAIN ${NETWORK}; use ${Object.keys(CHAINS).join(" or ")}`);
  return picked;
}

export function loadEnv() {
  for (const file of [path.join(HERE, ".env"), path.join(ROOT, ".env")]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function password() {
  const pw = process.env.CASSANDRA_PW;
  if (!pw) throw new Error("set CASSANDRA_PW to decrypt the keystores");
  return pw;
}

export async function keystoreAccount(name) {
  const file = path.join(KEYSTORE_DIR, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`no keystore ${file} - run: npm run setup`);
  const wallet = await Wallet.fromEncryptedJson(fs.readFileSync(file, "utf8"), password());
  return createAccount(wallet.privateKey);
}

export async function makeKeystore(name) {
  fs.mkdirSync(KEYSTORE_DIR, { recursive: true });
  const file = path.join(KEYSTORE_DIR, `${name}.json`);
  if (fs.existsSync(file)) {
    const wallet = await Wallet.fromEncryptedJson(fs.readFileSync(file, "utf8"), password());
    return { address: wallet.address, created: false };
  }
  const wallet = Wallet.createRandom();
  fs.writeFileSync(file, await wallet.encrypt(password()), { mode: 0o600 });
  return { address: wallet.address, created: true };
}

export function clientFor(account) {
  return createClient({ chain: chain(), account });
}

export function readOnlyClient() {
  return createClient({ chain: chain() });
}

// An `Address` parameter must be sent as CalldataAddress. A bare hex string
// encodes as `str`, and the call then fails in decode while still reporting
// ACCEPTED - a silent failure that looks exactly like success.
export function addr(hex) {
  const clean = String(hex).startsWith("0x") ? String(hex).slice(2) : String(hex);
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) throw new Error(`not an address: ${hex}`);
  return new CalldataAddress(Uint8Array.from(Buffer.from(clean, "hex")));
}

// Calldata dicts can come back as Maps and integers as bigints.
export function plain(v) {
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, x]) => [k, plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v === "object" && !(v instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
}

export async function read(client, address, functionName, args = []) {
  return plain(await client.readContract({ address, functionName, args }));
}

// Waits for FINALIZED with a SUCCESS leader receipt. Anything else throws:
// ACCEPTED only means the transaction landed, and an LLM round that timed out
// reports a decided state that is not a success.
export async function waitFinal(client, hash, label, maxMs = 15 * 60_000) {
  const start = Date.now();
  let attempt = 0;
  let lastStatus = "";
  while (Date.now() - start < maxMs) {
    let tx = null;
    try {
      tx = await client.getTransaction({ hash });
    } catch (err) {
      const msg = String(err?.message ?? err);
      if (/rate limit|429|requests per/i.test(msg)) console.log(`  ${label}: rate limited, backing off`);
      else console.log(`  ${label}: read error ${msg.slice(0, 120)}`);
    }
    if (tx) {
      const k = classify(tx);
      if (k.status !== lastStatus) {
        console.log(`  ${label}: ${k.status}`);
        lastStatus = k.status;
      }
      if (k.done) {
        if (!k.ok) throw new Error(`${label} failed: ${k.status}/${k.exec || "-"} ${errorText(tx)}`);
        return tx;
      }
    }
    await sleep(backoffMs(attempt++));
  }
  throw new Error(`${label}: gave up after ${Math.round(maxMs / 1000)}s at ${lastStatus || "unknown"}`);
}

export async function write(client, address, functionName, args = [], { value = 0n, label } = {}) {
  const hash = await client.writeContract({ address, functionName, args, value: BigInt(value) });
  console.log(`  ${label ?? functionName}: tx ${hash}`);
  const tx = await waitFinal(client, hash, label ?? functionName);
  return { hash, tx };
}

export function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function saveJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export function deployment() {
  const file = path.join(STATE_DIR, `deployment.${NETWORK}.json`);
  const d = loadJSON(file, null);
  const market = process.env.MARKET ?? d?.market;
  const positions = process.env.POSITIONS ?? d?.positions;
  if (!market || !positions) {
    throw new Error(`no deployment for ${NETWORK} - run: CASSANDRA_PW=... npm run deploy`);
  }
  return { ...d, market, positions, network: NETWORK };
}

export const GEN = 10n ** 18n;
export const fmtGen = (atto) => `${(Number(BigInt(atto)) / 1e18).toFixed(4)} GEN`;
export const nowSeconds = () => Math.floor(Date.now() / 1000);

// A journal entry is written before a transaction is submitted, so a crash
// between submit and receipt never causes a blind resubmit.
export function journal(entry) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(
    path.join(STATE_DIR, "journal.log"),
    JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n",
  );
}

export { statusName, classify, errorText, backoffMs };
