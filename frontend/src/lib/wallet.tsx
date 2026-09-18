import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import type { EIP1193Provider } from "viem";
import { walletReady } from "./appkit";

/**
 * The wallet, as the rest of the app sees it.
 *
 * AppKit throws from its hooks when it was never initialised (no project id), so
 * every call is guarded: a missing wallet degrades the app to read-only instead
 * of blanking the page.
 */
export function useWallet() {
  const appKit = useSafeAppKit();
  const account = useSafeAccount();
  const provider = useSafeProvider();

  return {
    address: (account.isConnected ? (account.address as `0x${string}` | undefined) : undefined) ?? null,
    provider: (provider ?? null) as EIP1193Provider | null,
    available: walletReady,
    connect: () => appKit?.open(),
    manage: () => appKit?.open({ view: "Account" }),
  };
}

function useSafeAppKit() {
  try {
    return useAppKit();
  } catch {
    return null;
  }
}

function useSafeAccount() {
  try {
    return useAppKitAccount();
  } catch {
    return { address: undefined, isConnected: false } as ReturnType<typeof useAppKitAccount>;
  }
}

function useSafeProvider() {
  try {
    return useAppKitProvider<EIP1193Provider>("eip155").walletProvider;
  } catch {
    return undefined;
  }
}
