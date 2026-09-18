/**
 * GenLayer's chains are not built into AppKit, so they are defined from the same
 * `genlayer-js/chains` objects the client uses - never retyped. `caipNetworkId`
 * and `chainNamespace` are required; without them AppKit reports the chain as
 * unconfigured and the connect button does nothing.
 *
 * The whole thing is wrapped in a try/catch because a missing or wrong project
 * id otherwise throws before React mounts, which blanks the page rather than
 * degrading to "you cannot connect right now".
 */
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain, type AppKitNetwork } from "@reown/appkit/networks";
import { createConfig, http } from "wagmi";
import { NETWORKS, type NetworkKey } from "./network";

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID ?? "";

function toAppKitNetwork(chain: (typeof NETWORKS)[keyof typeof NETWORKS]["chain"]): AppKitNetwork {
  return defineChain({
    id: chain.id,
    caipNetworkId: `eip155:${chain.id}`,
    chainNamespace: "eip155",
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: { default: { http: chain.rpcUrls.default.http as unknown as string[] } },
    blockExplorers: chain.blockExplorers,
  }) as AppKitNetwork;
}

const networks = (Object.keys(NETWORKS) as NetworkKey[]).map((key) => toAppKitNetwork(NETWORKS[key].chain)) as [
  AppKitNetwork,
  ...AppKitNetwork[],
];

function build() {
  if (!projectId) {
    // No project id is a configuration gap, not a crash. The app still reads.
    return {
      wagmiConfig: createConfig({
        chains: [networks[0] as never],
        transports: { [networks[0].id as number]: http() },
      }),
      ready: false,
    };
  }
  try {
    const adapter = new WagmiAdapter({ networks, projectId, ssr: false });
    createAppKit({
      adapters: [adapter],
      networks,
      projectId,
      metadata: {
        name: "Cassandra",
        description: "Agent-driven prediction markets, settled inside GenLayer consensus",
        url: typeof window === "undefined" ? "https://cassandra.app" : window.location.origin,
        icons: ["/icon.svg"],
      },
      themeMode: "light",
      themeVariables: { "--w3m-accent": "#6b1f24", "--w3m-border-radius-master": "1px" },
      features: { analytics: false, email: false, socials: [] },
    });
    return { wagmiConfig: adapter.wagmiConfig, ready: true };
  } catch (error) {
    console.warn("wallet connect unavailable:", error);
    return {
      wagmiConfig: createConfig({
        chains: [networks[0] as never],
        transports: { [networks[0].id as number]: http() },
      }),
      ready: false,
    };
  }
}

export const { wagmiConfig, ready: walletReady } = build();
