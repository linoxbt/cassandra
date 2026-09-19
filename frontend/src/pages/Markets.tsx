import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ButtonLink, Empty, GridFiller, Label, Spinner, StatusBadge, cn } from "@/components/ui";
import { OddsCurve } from "@/components/landing/odds-curve";
import { useMarkets, useStats } from "@/lib/queries";
import { genLabel, impliedOdds, timeUntil } from "@/lib/format";
import { categoryOf } from "@/lib/categories";
import { isDeployed, NETWORKS, useNetwork } from "@/lib/network";
import type { Market } from "@/lib/contract";

type Filter = "all" | "open" | "settling" | "settled";

const FILTERS: { key: Filter; label: string; match: (m: Market) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Trading", match: (m) => m.status === "OPEN" },
  { key: "settling", label: "Settling", match: (m) => ["CLOSED", "RESOLVED", "DISPUTED"].includes(m.status) },
  { key: "settled", label: "Settled", match: (m) => ["FINAL", "VOID"].includes(m.status) },
];

export function Markets() {
  const network = useNetwork();
  const { data: markets, isLoading, error } = useMarkets();
  const { data: stats } = useStats();
  const [filter, setFilter] = useState<Filter>("all");

  // `stats.live` counts markets that are not terminal yet, which includes ones
  // whose clock has run out. "Trading now" is a client-side count off the rows.
  const trading = useMemo(() => (markets ?? []).filter((m) => m.status === "OPEN").length, [markets]);

  const shown = useMemo(() => {
    if (!markets) return [];
    const match = FILTERS.find((f) => f.key === filter)!.match;
    return markets.filter(match);
  }, [markets, filter]);

  if (!isDeployed()) return <NotDeployed />;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-5">
        <div>
          <Label>The board</Label>
          <h1 className="mt-2 font-display text-display-sm text-ink">Markets</h1>
        </div>
        <div className="flex items-center gap-4">
          {stats ? (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
              {trading} trading · {stats.settled} settled · {genLabel(stats.volume, 2)} staked
            </span>
          ) : null}
          <ButtonLink to="/create" tone="ghost">Open a market</ButtonLink>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap gap-1">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setFilter(entry.key)}
            className={cn(
              "rounded-sm px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] transition-colors",
              filter === entry.key ? "bg-ink text-paper" : "text-muted hover:text-ink",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner /> : null}

      {error ? (
        <Empty title="Could not read the board">
          {String((error as Error).message).slice(0, 200)}
        </Empty>
      ) : null}

      {!isLoading && !error && shown.length === 0 ? (
        <Empty title="Nothing here yet">
          The agent opens markets on a timer. On {NETWORKS[network].label} it has not opened one in
          this category yet — or you can open the first one yourself.
        </Empty>
      ) : null}

      <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-2">
        {shown.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
        <GridFiller count={shown.length} />
      </div>
    </>
  );
}

export function MarketCard({ market }: { market: Market }) {
  const odds = impliedOdds(market.yes_pool, market.no_pool);
  const category = categoryOf(market.category);
  const pool = BigInt(market.yes_pool) + BigInt(market.no_pool);

  return (
    <Link to={`/market/${market.id}`} className="group bg-surface p-6 transition-colors hover:bg-paper-2">
      <div className="flex items-center justify-between gap-3">
        <Label>
          #{String(market.id).padStart(4, "0")} · {category.label}
        </Label>
        <StatusBadge status={market.status} />
      </div>

      <h2 className="mt-3 font-display text-[1.18rem] leading-snug text-ink group-hover:text-oxblood">
        {market.question}
      </h2>

      <OddsCurve yes={odds.yes} className="mt-4" label={false} />

      <div className="mt-4 flex items-center justify-between font-mono text-[0.7rem] uppercase tracking-[0.12em]">
        <span className="text-yes">Yes {Math.round(odds.yes * 100)}%</span>
        <span className="text-muted">{genLabel(pool.toString(), 2)}</span>
        <span className="text-no">No {Math.round(odds.no * 100)}%</span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[0.78rem] text-muted">
        <span>{market.by_agent ? "Opened by the agent" : "Opened by a person"}</span>
        <span>
          {market.status === "OPEN" ? `closes ${timeUntil(market.closes_at)}` : `closed ${timeUntil(market.closes_at)}`}
        </span>
      </div>
    </Link>
  );
}

export function NotDeployed() {
  const network = useNetwork();
  return (
    <Empty title={`Not deployed on ${NETWORKS[network].label}`}>
      Cassandra has no contract address on this network yet. Switch networks in the header, or deploy
      your own — the whole thing is two Python files and a deploy script.
      <div className="mt-5 flex justify-center gap-3">
        <ButtonLink to="/docs/running-it" tone="ghost">Running it yourself</ButtonLink>
      </div>
    </Empty>
  );
}
