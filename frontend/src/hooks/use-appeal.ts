import { useQuery } from "@tanstack/react-query";
import { findAppealableTx, probeAppealSupport } from "@/lib/appeal";
import { isDeployed, useNetwork } from "@/lib/network";

/**
 * Whether this network can do protocol-level appeals at all. Probed once per
 * network and cached for the session - it is a property of the chain, and the
 * answer does not change under us.
 */
export function useAppealSupport() {
  const network = useNetwork();
  return useQuery({
    queryKey: ["appeal-support", network],
    queryFn: () => probeAppealSupport(network),
    enabled: isDeployed(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

/** The settlement transaction for this market that is still open to appeal. */
export function useAppealTarget(marketId: string | undefined, enabled: boolean) {
  const network = useNetwork();
  return useQuery({
    queryKey: ["appeal-target", network, marketId],
    queryFn: () => findAppealableTx(marketId!),
    enabled: Boolean(marketId) && enabled && isDeployed(),
    staleTime: 30_000,
    retry: false,
  });
}
