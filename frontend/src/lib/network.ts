import { useSyncExternalStore } from "react";
import { studionet, testnetAsimov } from "genlayer-js/chains";
import { CONTRACTS } from "./contractAddresses";

/**
 * The networks Cassandra runs on, and the one currently selected.
 *
 * Chains come from `genlayer-js/chains` and are never retyped: a hand-copied RPC
 * URL or chain id surfaces later as an unexplained wallet error rather than as a
 * typo. Localnet is deliberately absent, so a wallet is never prompted to add a
 * dev chain.
 */
export const NETWORKS = {
  studionet: {
    chain: studionet,
    label: "Studio Network",
    short: "Studio",
    explorer: "https://explorer-studio.genlayer.com",
    gasless: true,
    faucet: "",
    contracts: CONTRACTS.studionet,
  },
  testnetAsimov: {
    chain: testnetAsimov,
    label: "Asimov Testnet",
    short: "Asimov",
    explorer: "https://explorer-asimov.genlayer.com",
    gasless: false,
    faucet: "https://testnet-faucet.genlayer.foundation",
    contracts: CONTRACTS.testnetAsimov,
  },
} as const;

export type NetworkKey = keyof typeof NETWORKS;

export const NETWORK_KEYS = Object.keys(NETWORKS) as NetworkKey[];

const STORAGE_KEY = "cassandra:network";
const DEFAULT_NETWORK: NetworkKey = "studionet";

function isNetworkKey(value: string | null): value is NetworkKey {
  return value !== null && value in NETWORKS;
}

function readStored(): NetworkKey {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isNetworkKey(stored) ? stored : DEFAULT_NETWORK;
  } catch {
    // Private windows and blocked site data throw here rather than returning
    // null, and neither is a reason to fail to render.
    return DEFAULT_NETWORK;
  }
}

let current: NetworkKey = typeof window === "undefined" ? DEFAULT_NETWORK : readStored();
const listeners = new Set<() => void>();

export function getNetwork(): NetworkKey {
  return current;
}

export function getActiveChain() {
  return NETWORKS[current].chain;
}

export function contractsFor(key: NetworkKey = current) {
  return NETWORKS[key].contracts;
}

export function getMarketAddress(key: NetworkKey = current): `0x${string}` {
  const address = NETWORKS[key].contracts.market;
  if (!address) throw new Error(`Cassandra is not deployed on ${NETWORKS[key].label} yet.`);
  return address as `0x${string}`;
}

export function getPositionsAddress(key: NetworkKey = current): `0x${string}` {
  const address = NETWORKS[key].contracts.positions;
  if (!address) throw new Error(`The position ledger is not deployed on ${NETWORKS[key].label} yet.`);
  return address as `0x${string}`;
}

export function isDeployed(key: NetworkKey = current): boolean {
  const { market, positions } = NETWORKS[key].contracts;
  return Boolean(market) && Boolean(positions);
}

export function setCurrentNetwork(key: NetworkKey): void {
  if (key === current) return;
  current = key;
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // A remembered network is a convenience, not state the app depends on.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Re-renders the calling component whenever the selected network changes. */
export function useNetwork(): NetworkKey {
  return useSyncExternalStore(subscribe, getNetwork, () => DEFAULT_NETWORK);
}

export function explorerTx(hash: string, key: NetworkKey = current): string {
  return `${NETWORKS[key].explorer}/tx/${hash}`;
}

export function explorerAddress(address: string, key: NetworkKey = current): string {
  return `${NETWORKS[key].explorer}/address/${address}`;
}
