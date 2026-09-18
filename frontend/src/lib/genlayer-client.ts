import { createClient } from "genlayer-js";
import type { EIP1193Provider } from "viem";
import { NETWORKS, getActiveChain, type NetworkKey } from "./network";

/**
 * Read client: talks straight to the GenLayer RPC, no wallet involved. A fresh
 * client per call, so it always targets whichever network is selected now rather
 * than whichever was selected when this module first loaded.
 */
export function getReadClient() {
  return createClient({ chain: getActiveChain() });
}

export function getReadClientFor(key: NetworkKey) {
  return createClient({ chain: NETWORKS[key].chain });
}

/**
 * Write client: signs through the connected wallet. genlayer-js needs an
 * explicit `account` - given only a provider it has no sender and throws
 * "No account set."
 */
export function createWriteClient(account: `0x${string}`, provider: EIP1193Provider) {
  return createClient({ chain: getActiveChain(), account, provider });
}
