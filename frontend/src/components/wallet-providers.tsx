import { Suspense, lazy, type ReactNode } from "react";

/**
 * The wallet stack is ~1.4MB of the bundle and the marketing pages do not use a
 * single byte of it. Loading it only under the application routes means the
 * landing page and the docs ship without it and paint immediately.
 */
const WalletStack = lazy(async () => {
  const [{ WagmiProvider }, { wagmiConfig }] = await Promise.all([
    import("wagmi"),
    import("@/lib/appkit"),
  ]);
  return {
    default: ({ children }: { children: ReactNode }) => (
      <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
    ),
  };
});

export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<BootScreen />}>
      <WalletStack>{children}</WalletStack>
    </Suspense>
  );
}

function BootScreen() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="flex items-center gap-3 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-oxblood animate-pulse-dot" />
        Connecting to the chain
      </span>
    </div>
  );
}
