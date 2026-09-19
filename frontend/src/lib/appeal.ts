/**
 * GenLayer's own appeal, which is a different thing from this app's dispute.
 *
 * A dispute is application-level: a bond held by `cassandra.py`, and a second
 * consensus round the contract runs itself. An appeal is protocol-level: it
 * forces the network to re-run the transaction under real validator economics,
 * and the contract has no part in it.
 *
 * Not every network can do it. Studio Network answers "Appeal bond calculation
 * not supported on this chain (missing feeManagerContract/roundsStorageContract)"
 * because it simulates consensus rather than running the staking contracts. So
 * the capability is probed rather than assumed, and the control is hidden where
 * it cannot work instead of being shown as a button that fails.
 */
import { decodeInputData } from "genlayer-js";
import type { TransactionHash } from "genlayer-js/types";
import { createWriteClient, getReadClient } from "./genlayer-client";
import { getMarketAddress, getNetwork, type NetworkKey } from "./network";
import type { WriteContext } from "./contract";

export type AppealSupport =
  | { supported: true }
  | { supported: false; reason: string };

/** A transaction can only be appealed before it finalizes, and only once. */
export interface AppealTarget {
  txId: `0x${string}`;
  method: string;
  status: string;
  minBond: bigint;
}

const probes = new Map<NetworkKey, Promise<AppealSupport>>();

/**
 * Asks the SDK, on this network, whether an appeal bond can even be priced. The
 * answer is a property of the chain, not of any one transaction, so it is
 * probed once per network and reused.
 */
export function probeAppealSupport(network: NetworkKey = getNetwork()): Promise<AppealSupport> {
  const cached = probes.get(network);
  if (cached) return cached;

  const probe = (async (): Promise<AppealSupport> => {
    const client = getReadClient();
    // Any well-formed hash will do: an unsupported chain fails on the missing
    // consensus contracts before it ever looks the transaction up.
    const probeTx = `0x${"0".repeat(64)}` as TransactionHash;
    try {
      await client.getMinAppealBond({ txId: probeTx });
      return { supported: true };
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      if (/not supported on this chain|feeManagerContract|roundsStorageContract/i.test(message)) {
        return {
          supported: false,
          reason:
            "This network simulates consensus rather than running the staking contracts, so an appeal bond cannot be priced here.",
        };
      }
      // A chain that priced the bond and merely disliked the zero hash does
      // support appeals - the failure is about the transaction, not the chain.
      if (/transaction|not found|unknown|invalid tx/i.test(message)) return { supported: true };
      return { supported: false, reason: message.split("\n")[0].slice(0, 160) };
    }
  })();

  probes.set(network, probe);
  return probe;
}

function decodeMethod(
  calldata: unknown,
  recipient: `0x${string}`,
): { method: string; args: unknown[] } | null {
  if (typeof calldata !== "string" || !calldata) return null;
  try {
    // The RPC hands calldata back base64-encoded; the decoder wants hex.
    const binary = atob(calldata);
    const hex = `0x${Array.from(binary, (char) =>
      char.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("")}` as `0x${string}`;
    const decoded = decodeInputData(hex, recipient) as { method?: string; args?: unknown[] } | null;
    if (!decoded?.method) return null;
    return { method: decoded.method, args: decoded.args ?? [] };
  } catch {
    return null;
  }
}

/**
 * Finds the settlement transaction for a market that is still open to appeal.
 *
 * Only a transaction that has been decided but not yet finalized can be
 * appealed, and only if it has not been appealed already.
 */
export async function findAppealableTx(marketId: string): Promise<AppealTarget | null> {
  const support = await probeAppealSupport();
  if (!support.supported) return null;

  const client = getReadClient();
  const address = getMarketAddress();
  let rows: any[];
  try {
    rows = (await client.request({
      method: "sim_getTransactionsForAddress",
      params: [address],
    } as never)) as any[];
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;

  // Newest first: a market can be settled more than once (resolve, then
  // arbitrate), and only the latest one is still in play.
  for (const row of [...rows].reverse()) {
    if (row?.appealed || row?.appeal_failed) continue;
    const status = String(row?.status ?? "");
    if (status === "FINALIZED" || status === "CANCELED") continue;
    const decoded = decodeMethod(row?.data?.calldata, address);
    if (!decoded) continue;
    if (decoded.method !== "resolve" && decoded.method !== "arbitrate") continue;
    if (String(decoded.args?.[0] ?? "") !== String(marketId)) continue;
    const txId = String(row.hash ?? "") as `0x${string}`;
    if (!txId.startsWith("0x")) continue;
    try {
      const minBond = await client.getMinAppealBond({ txId: txId as TransactionHash });
      return { txId, method: decoded.method, status, minBond: BigInt(minBond ?? 0) };
    } catch {
      return null;
    }
  }
  return null;
}

export async function submitAppeal(ctx: WriteContext, target: AppealTarget) {
  const client = createWriteClient(ctx.account, ctx.provider);
  const hash = (await client.appealTransaction({
    txId: target.txId as TransactionHash,
    value: target.minBond,
  })) as string;
  ctx.onSubmitted?.(hash);
  // An appeal re-runs the original transaction under a fresh round; the app
  // shows it as submitted and lets the market's own polling reflect the result,
  // because the appeal transaction is not the one that carries the verdict.
  return { hash, outcome: { state: "confirmed" as const, hash } };
}
