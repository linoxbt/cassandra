import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, Empty, Label, Spinner, StatusBadge } from "@/components/ui";
import { useMarkets } from "@/lib/queries";
import { getPosition } from "@/lib/contract";
import { useQueries } from "@tanstack/react-query";
import { gen, genLabel, impliedOdds } from "@/lib/format";
import { isDeployed, useNetwork } from "@/lib/network";
import { useWallet } from "@/lib/wallet";
import { NotDeployed } from "./Markets";

/**
 * A portfolio is the position ledger, filtered to you. There is no index of
 * "markets this address touched", so a balance has to be read per market.
 *
 * That is one request each, against an RPC with a shared daily budget, so the
 * reads are cached for five minutes and a write invalidates them - which is the
 * only moment a balance can actually have changed.
 */
export function Portfolio() {
  const network = useNetwork();
  const { address } = useWallet();
  const { data: markets, isLoading } = useMarkets();

  const positions = useQueries({
    queries: (markets ?? []).map((market) => ({
      queryKey: ["portfolio", network, market.id, address],
      queryFn: () => getPosition(market.id, address!),
      enabled: Boolean(address) && isDeployed(),
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    })),
  });

  const rows = useMemo(() => {
    if (!markets) return [];
    return markets
      .map((market, index) => ({ market, position: positions[index]?.data }))
      .filter((row) => row.position && BigInt(row.position.yes) + BigInt(row.position.no) > 0n);
  }, [markets, positions]);

  if (!isDeployed()) return <NotDeployed />;

  if (!address) {
    return (
      <Empty title="Connect a wallet">
        Your positions are tokens in a contract; the app needs to know which address to read.
      </Empty>
    );
  }

  const staked = rows.reduce(
    (total, row) => total + BigInt(row.position!.yes) + BigInt(row.position!.no),
    0n,
  );

  return (
    <>
      <header className="border-b-2 border-ink pb-5">
        <Label>Your book</Label>
        <h1 className="mt-2 font-display text-display-sm text-ink">Portfolio</h1>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
        <Card className="p-5">
          <Label>Open positions</Label>
          <div className="mt-1 font-display text-2xl text-ink tabular-nums">{rows.length}</div>
        </Card>
        <Card className="p-5">
          <Label>Staked</Label>
          <div className="mt-1 font-display text-2xl text-ink tabular-nums">{gen(staked.toString(), 3)}</div>
        </Card>
        <Card className="p-5">
          <Label>Network</Label>
          <div className="mt-1 font-display text-2xl text-ink">{network === "studionet" ? "Studio" : "Asimov"}</div>
        </Card>
      </div>

      {isLoading ? <Spinner /> : null}

      {!isLoading && rows.length === 0 ? (
        <div className="mt-8">
          <Empty title="No positions yet">
            Back a side on <Link to="/markets" className="text-oxblood underline">the board</Link> and
            your stake becomes a token you can hold, sell, or settle.
          </Empty>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col divide-y divide-line">
        {rows.map(({ market, position }) => {
          const odds = impliedOdds(market.yes_pool, market.no_pool);
          const yes = BigInt(position!.yes);
          const no = BigInt(position!.no);
          return (
            <Link key={market.id} to={`/market/${market.id}`} className="group flex flex-wrap items-center gap-4 py-5">
              <div className="min-w-[14rem] flex-1">
                <div className="flex items-center gap-2">
                  <Label>#{String(market.id).padStart(4, "0")}</Label>
                  <StatusBadge status={market.status} />
                </div>
                <h2 className="mt-1.5 font-display text-[1.05rem] leading-snug text-ink group-hover:text-oxblood">
                  {market.question}
                </h2>
              </div>
              <div className="flex gap-6 font-mono text-[0.76rem] uppercase tracking-[0.1em]">
                {yes > 0n ? <span className="text-yes">Yes {gen(yes.toString(), 3)}</span> : null}
                {no > 0n ? <span className="text-no">No {gen(no.toString(), 3)}</span> : null}
              </div>
              <div className="w-24 text-right font-mono text-[0.74rem] text-muted">
                {Math.round(odds.yes * 100)}% yes
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-10 max-w-2xl text-[0.86rem] leading-relaxed text-muted">
        Positions are tokens in their own contract. While a market is trading you can transfer them
        to anyone; once it closes they freeze, and whoever holds them at settlement is who the escrow
        pays. Total staked here is {genLabel(staked.toString(), 3)}.
      </p>
    </>
  );
}
