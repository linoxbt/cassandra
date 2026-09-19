import { useQuery } from "@tanstack/react-query";
import {
  getConfig, getDispute, getJury, getMarket, getPosition, getSolvency, getStats, getVerdict, listMarkets,
} from "./contract";
import { isDeployed, useNetwork } from "./network";

/**
 * Every number in this app is a live contract read - no indexer, no cache
 * server - and reads are gated on the contract actually being deployed on the
 * selected network, so an undeployed network explains itself instead of
 * throwing.
 *
 * Studio's RPC allows 5,000 requests a day, shared by every app pointed at it,
 * and contract reads count against that same budget rather than a cheaper one.
 * A 30-second poll across the board, stats and solvency queries is roughly
 * 8,600 reads a day from a single open tab - over the whole allowance before
 * anyone has clicked anything. That is not theoretical: it is what emptied the
 * quota and left the board showing "could not read".
 *
 * So nothing polls on a timer by default. Reads refresh when a tab is focused
 * after being away, and after a write, which is when the numbers can actually
 * have moved. `WATCH` is for the few places where a value genuinely changes
 * under the viewer - a market waiting on a verdict - and is slow enough to be
 * affordable.
 */
const LIVE = {
  staleTime: 20_000,
  refetchOnWindowFocus: true,
} as const;
const WATCH = {
  staleTime: 20_000,
  refetchOnWindowFocus: true,
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
} as const;
const SLOW = { staleTime: 5 * 60_000 } as const;

export function useMarkets() {
  const network = useNetwork();
  return useQuery({
    queryKey: ["markets", network],
    queryFn: () => listMarkets(0, 60),
    enabled: isDeployed(),
    ...LIVE,
  });
}

export function useMarket(id: string | undefined) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["market", network, id],
    queryFn: () => getMarket(id!),
    enabled: Boolean(id) && isDeployed(),
    ...WATCH,
  });
}

export function useVerdict(id: string | undefined) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["verdict", network, id],
    queryFn: () => getVerdict(id!),
    enabled: Boolean(id) && isDeployed(),
    ...WATCH,
  });
}

export function useDispute(id: string | undefined) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["dispute", network, id],
    queryFn: () => getDispute(id!),
    enabled: Boolean(id) && isDeployed(),
    ...LIVE,
  });
}

export function useJury(id: string | undefined) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["jury", network, id],
    queryFn: () => getJury(id!),
    enabled: Boolean(id) && isDeployed(),
    ...LIVE,
  });
}

export function usePosition(id: string | undefined, holder: string | null) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["position", network, id, holder],
    queryFn: () => getPosition(id!, holder!),
    enabled: Boolean(id) && Boolean(holder) && isDeployed(),
    ...LIVE,
  });
}

export function useStats() {
  const network = useNetwork();
  return useQuery({
    queryKey: ["stats", network],
    queryFn: getStats,
    enabled: isDeployed(),
    ...LIVE,
  });
}

export function useSolvency() {
  const network = useNetwork();
  return useQuery({
    queryKey: ["solvency", network],
    queryFn: getSolvency,
    enabled: isDeployed(),
    ...LIVE,
  });
}

export function useConfig() {
  const network = useNetwork();
  return useQuery({
    queryKey: ["config", network],
    queryFn: getConfig,
    enabled: isDeployed(),
    ...SLOW,
  });
}
