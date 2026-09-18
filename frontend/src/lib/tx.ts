/**
 * Transaction status, normalised.
 *
 * Three traps this exists for, all measured against Studio:
 *
 *  1. `getTransaction` returns `status` as a NUMERIC ordinal and can leave the
 *     name undefined, while other RPC paths return the name as a string. A
 *     comparison against the string list therefore never matches, and a
 *     transaction that finalized in seconds looks like it hung forever.
 *  2. ACCEPTED is not success. It only means the transaction landed in a block;
 *     the call inside it can still have reverted. Success is
 *     `consensus_data.leader_receipt[0].execution_result === "SUCCESS"`.
 *     `txExecutionResultName` is empty on Studio, so checking only that waves
 *     reverted-but-finalized transactions through as wins.
 *  3. UNDETERMINED, CANCELED and the two timeouts are decided states that are
 *     not verdicts. A waiter that stops at "any decided state" reports a
 *     validator round that timed out as a success.
 *
 * Payouts are external messages that execute at FINALIZED, not ACCEPTED, so the
 * app waits for finality before it tells anyone their money moved.
 */
import type { TransactionHash } from "genlayer-js/types";
import { getReadClient } from "./genlayer-client";

export const STATUS_NAMES = [
  "UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED",
  "UNDETERMINED", "FINALIZED", "CANCELED", "APPEAL_REVEALING", "APPEAL_COMMITTING",
  "READY_TO_FINALIZE", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
] as const;

const TERMINAL = new Set([
  "FINALIZED", "UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT",
]);

export type TxOutcome =
  | { state: "confirmed"; hash: string; validators?: number }
  | { state: "reverted"; hash: string; message: string }
  | { state: "no_verdict"; hash: string; status: string }
  | { state: "unresolved"; hash: string; status: string };

export function statusName(tx: any): string {
  const raw = tx?.statusName ?? tx?.status_name ?? tx?.status;
  if (raw === undefined || raw === null) return "UNKNOWN";
  const asNumber =
    typeof raw === "number" || typeof raw === "bigint"
      ? Number(raw)
      : /^\d+$/.test(String(raw))
        ? Number(raw)
        : NaN;
  if (!Number.isNaN(asNumber)) return STATUS_NAMES[asNumber] ?? `STATUS_${asNumber}`;
  return String(raw).toUpperCase();
}

function leaderReceipt(tx: any) {
  const data = tx?.consensusData ?? tx?.consensus_data;
  const receipt = data?.leaderReceipt ?? data?.leader_receipt;
  return Array.isArray(receipt) ? receipt[0] : receipt;
}

/** GenVM tags a revert with its classification; users should see the sentence,
 *  not the tag. */
export function revertMessage(tx: any): string {
  const receipt = leaderReceipt(tx);
  const candidates = [
    receipt?.result?.payload?.readable,
    receipt?.result?.payload,
    receipt?.genvm_result?.stderr,
    receipt?.error,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    const tagged = candidate.match(/\[(?:EXPECTED|LLM_ERROR|EXTERNAL|TRANSIENT)\]\s*([^"\\]+)/);
    if (tagged) return tagged[1].trim();
    return candidate.slice(0, 240);
  }
  return "The contract rejected this call.";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls on a backoff to a terminal state. A flat 4-second poll over a ten-minute
 * budget is ~150 requests per write, which exhausts Studio's shared daily quota
 * in two or three end-to-end runs.
 */
export async function waitForTx(hash: string, budgetMs = 10 * 60 * 1000): Promise<TxOutcome> {
  const client = getReadClient();
  const deadline = Date.now() + budgetMs;
  let wait = 4000;
  let last: any = null;
  let status = "PENDING";

  while (Date.now() < deadline) {
    await sleep(wait);
    wait = Math.min(wait * 1.5, 20_000);
    try {
      last = await client.getTransaction({ hash: hash as TransactionHash });
    } catch {
      continue; // a read error is not a verdict; keep polling within the budget
    }
    status = statusName(last);
    if (!TERMINAL.has(status)) continue;
    if (status !== "FINALIZED") return { state: "no_verdict", hash, status };
    const receipt = leaderReceipt(last);
    const result = String(receipt?.executionResult ?? receipt?.execution_result ?? "");
    if (result && result !== "SUCCESS") {
      return { state: "reverted", hash, message: revertMessage(last) };
    }
    const validators = last?.lastRound?.roundValidators?.length ?? last?.last_round?.round_validators?.length;
    return { state: "confirmed", hash, validators };
  }
  return { state: "unresolved", hash, status };
}

/** Reads lag finality, so a read taken straight after a write can still show the
 *  old value. A few linear retries is enough. */
export async function retryRead<T>(read: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      await sleep(1500 * attempt);
    }
  }
  throw lastError;
}

export function describeError(error: unknown): string {
  const message = String((error as Error)?.message ?? error);
  if (/user rejected|denied transaction|rejected the request/i.test(message)) {
    return "You dismissed the signature request.";
  }
  if (/insufficient funds|insufficient balance/i.test(message)) {
    return "That account does not hold enough GEN for this.";
  }
  if (/rate limit|429|requests per/i.test(message)) {
    return "The network is rate limiting this app right now. Give it a minute and try again.";
  }
  const tagged = message.match(/\[(?:EXPECTED|LLM_ERROR|EXTERNAL|TRANSIENT)\]\s*([^"\\]+)/);
  if (tagged) return tagged[1].trim();
  return message.slice(0, 200);
}
