import { useQuery } from "@tanstack/react-query";
import {
  getConfig, getDispute, getJury, getMarket, getPosition, getSolvency, getStats, getVerdict, listMarkets,
} from "./contract";
import { isDeployed, useNetwork } from "./network";

/**
 * Every number in this app is a live contract read. There is no indexer and no
 * cache server; `staleTime` is what keeps that affordable, because Studio's RPC
 * quota is shared across every app pointed at it.
 *
 * Reads are also gated on the contract actually being deployed on the selected
 * network, so an undeployed network renders an explanation rather than throwing.
 */
const LIVE = { staleTime: 15_000, refetchInterval: 30_000 } as const;
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
    ...LIVE,
  });
}

export function useVerdict(id: string | undefined) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["verdict", network, id],
    queryFn: () => getVerdict(id!),
    enabled: Boolean(id) && isDeployed(),
    ...LIVE,
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
