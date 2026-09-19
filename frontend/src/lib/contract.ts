/**
 * Every read and write against the two Cassandra contracts.
 *
 * The contracts return plain dicts with wei as decimal strings, because the
 * schema introspector cannot recurse into a dataclass carrying `u256`. Those
 * strings are kept as strings all the way to the formatter: a pool of
 * 12000000000000000000 does not survive a round trip through a JS number.
 */
import { CalldataAddress } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";
import type { EIP1193Provider } from "viem";
import { createWriteClient, getReadClient } from "./genlayer-client";
import { getMarketAddress, getPositionsAddress } from "./network";
import { waitForTx, type TxOutcome } from "./tx";

export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED" | "DISPUTED" | "FINAL" | "VOID";
export type Side = "YES" | "NO";
export type Category = "crypto" | "news" | "weather" | "sports" | "pageviews";

export interface Market {
  id: string;
  question: string;
  category: Category;
  source_query: string;
  criteria: string;
  rationale: string;
  creator: string;
  by_agent: boolean;
  created_at: string;
  closes_at: string;
  resolve_deadline: string;
  status: MarketStatus;
  yes_pool: string;
  no_pool: string;
  seed: string;
  bet_count: string;
  paid: string;
  refunded: string;
  void_reason: string;
  evidence_url: string;
}

export interface Verdict {
  market_id: string;
  outcome: Side | "UNRESOLVED";
  original_outcome: Side | "UNRESOLVED";
  decile: string;
  confidence_band: string;
  evidence_url: string;
  evidence_digest: string;
  evidence_excerpt: string;
  reasoning: string;
  resolved_at: string;
  dispute_deadline: string;
  arbitrated: boolean;
}

export interface Dispute {
  market_id: string;
  disputer: string;
  bond: string;
  evidence_url: string;
  argument: string;
  filed_at: string;
  disposed: boolean;
  overturned: boolean;
}

export interface Juror {
  juror: string;
  side: Side;
  bond: string;
  staked_at: string;
  settled: boolean;
  payout: string;
}

export interface Stats {
  markets: string;
  /** Markets that have not reached a terminal state. Deliberately NOT "still
   *  trading": a market closes by the clock alone, so counting that on chain
   *  would mean a full scan. Derive trading-now from `list_markets`. */
  live: string;
  settled: string;
  agent_opened: string;
  volume: string;
}

/** Calldata dicts come back as Maps and integers as bigints. */
function plain(value: unknown): any {
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([k, v]) => [k, plain(v)]));
  }
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

/** An `Address` parameter must be sent as CalldataAddress. A bare hex string
 *  encodes as `str`, and the call then fails in decode while still reporting
 *  ACCEPTED - a silent failure that looks exactly like success. */
export function addr(hex: string): CalldataAddress {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new CalldataAddress(Uint8Array.from(clean.match(/../g)!.map((b) => parseInt(b, 16))));
}

const market = getMarketAddress;
const positions = getPositionsAddress;

async function read<T>(address: `0x${string}`, functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  const client = getReadClient();
  return plain(await client.readContract({ address, functionName, args })) as T;
}

/** Optional reads: a market with no verdict yet is normal, not an error. */
async function readOptional<T>(
  address: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[] = [],
): Promise<T | null> {
  try {
    const result = await read<T>(address, functionName, args);
    if (!result || (typeof result === "object" && Object.keys(result).length === 0)) return null;
    return result;
  } catch {
    return null;
  }
}

// -- reads -----------------------------------------------------------------

export const listMarkets = (offset = 0, limit = 60) =>
  read<Market[]>(market(), "list_markets", [offset, limit]);

export const getMarket = (id: string | number) => read<Market>(market(), "get_market", [Number(id)]);
export const getVerdict = (id: string | number) => readOptional<Verdict>(market(), "get_verdict", [Number(id)]);
export const getDispute = (id: string | number) => readOptional<Dispute>(market(), "get_dispute", [Number(id)]);
export const getJury = (id: string | number) => read<Juror[]>(market(), "get_jury", [Number(id)]);
export const getStats = () => read<Stats>(market(), "stats");
export const getConfig = () => read<Record<string, string>>(market(), "get_config");
export const getSolvency = () => read<Record<string, string>>(market(), "solvency");
export const getClaimed = (id: string | number, holder: string) =>
  read<string>(market(), "get_claim", [Number(id), addr(holder)]);

export const getPosition = (id: string | number, holder: string) =>
  read<{ market_id: string; yes: string; no: string }>(positions(), "position_of", [Number(id), addr(holder)]);

export const getBalance = (id: string | number, side: Side, holder: string) =>
  read<string>(positions(), "balance_of", [Number(id), side, addr(holder)]);

// -- writes ----------------------------------------------------------------

export interface WriteContext {
  account: `0x${string}`;
  provider: EIP1193Provider;
  /** Called once the wallet has signed and the hash exists, so the UI can stop
   *  saying "signing" while it waits for consensus. */
  onSubmitted?: (hash: string) => void;
}

async function send(
  ctx: WriteContext,
  address: `0x${string}`,
  functionName: string,
  args: CalldataEncodable[],
  value = 0n,
): Promise<{ hash: string; outcome: TxOutcome }> {
  const client = createWriteClient(ctx.account, ctx.provider);
  const hash = (await client.writeContract({ address, functionName, args, value })) as string;
  ctx.onSubmitted?.(hash);
  const outcome = await waitForTx(hash);
  return { hash, outcome };
}

export const placeBet = (ctx: WriteContext, id: string | number, side: Side, value: bigint) =>
  send(ctx, market(), "bet", [Number(id), side], value);

export const openMarket = (
  ctx: WriteContext,
  fields: { question: string; category: Category; source_query: string; criteria: string; closes_at: number; rationale: string },
  value: bigint,
) =>
  send(
    ctx, market(), "open_market",
    [fields.question, fields.category, fields.source_query, fields.criteria, fields.closes_at, fields.rationale],
    value,
  );

export const resolveMarket = (ctx: WriteContext, id: string | number) =>
  send(ctx, market(), "resolve", [Number(id)]);

export const fileDispute = (ctx: WriteContext, id: string | number, url: string, argument: string, bond: bigint) =>
  send(ctx, market(), "dispute", [Number(id), url, argument], bond);

export const arbitrateMarket = (ctx: WriteContext, id: string | number) =>
  send(ctx, market(), "arbitrate", [Number(id)]);

export const claimPayout = (ctx: WriteContext, id: string | number) =>
  send(ctx, market(), "claim", [Number(id)]);

export const voidMarket = (ctx: WriteContext, id: string | number) =>
  send(ctx, market(), "void_market", [Number(id)]);

export const stakeJuror = (ctx: WriteContext, id: string | number, side: Side, bond: bigint) =>
  send(ctx, market(), "stake_juror", [Number(id), side], bond);

export const finalizeJury = (ctx: WriteContext, id: string | number) =>
  send(ctx, market(), "finalize_jury", [Number(id)]);

export const claimJury = (ctx: WriteContext, id: string | number) =>
  send(ctx, market(), "claim_jury", [Number(id)]);

export const transferPosition = (ctx: WriteContext, id: string | number, side: Side, to: string, amount: bigint) =>
  send(ctx, positions(), "transfer", [Number(id), side, addr(to), amount]);
