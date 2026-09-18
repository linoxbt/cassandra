import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, Empty, Label, Spinner, StatusBadge } from "@/components/ui";
import { useConfig, useMarkets, useSolvency, useStats } from "@/lib/queries";
import { gen, genLabel, shortAddress, stamp, timeUntil } from "@/lib/format";
import { categoryOf } from "@/lib/categories";
import { explorerAddress, isDeployed, useNetwork } from "@/lib/network";
import { NotDeployed } from "./Markets";

/**
 * The agent has no log this app can read - it runs off-chain. So its activity is
 * reconstructed from the only record that matters: the markets it opened, in the
 * order it opened them, with the reasoning it committed at the time.
 */
export function AgentPage() {
  const network = useNetwork();
  const { data: markets, isLoading } = useMarkets();
  const { data: stats } = useStats();
  const { data: config } = useConfig();
  const { data: solvency } = useSolvency();

  const opened = useMemo(
    () => (markets ?? []).filter((market) => market.by_agent).slice(0, 25),
    [markets],
  );

  if (!isDeployed()) return <NotDeployed />;

  return (
    <>
      <header className="border-b-2 border-ink pb-5">
        <Label>Autonomous</Label>
        <h1 className="mt-2 font-display text-display-sm text-ink">The predictor</h1>
        <p className="mt-3 max-w-2xl text-[0.96rem] leading-relaxed text-ink-soft">
          A process that reads the same public feeds the contract will read, finds questions whose
          answers are genuinely open, and opens them. It proposes; it never decides. Settlement is
          callable by anyone and the evidence source is fixed when the market opens, so the agent has
          no way to influence a verdict.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Card className="p-5">
          <Label>Opened by the agent</Label>
          <div className="mt-1 font-display text-2xl text-ink tabular-nums">{stats?.agent_opened ?? "—"}</div>
        </Card>
        <Card className="p-5">
          <Label>Markets in total</Label>
          <div className="mt-1 font-display text-2xl text-ink tabular-nums">{stats?.markets ?? "—"}</div>
        </Card>
        <Card className="p-5">
          <Label>Settled</Label>
          <div className="mt-1 font-display text-2xl text-ink tabular-nums">{stats?.settled ?? "—"}</div>
        </Card>
        <Card className="p-5">
          <Label>In escrow</Label>
          <div className="mt-1 font-display text-2xl text-ink tabular-nums">
            {solvency ? gen(solvency.market_escrow, 3) : "—"}
          </div>
        </Card>
      </div>

      {config ? (
        <Card className="mt-6 p-6">
          <Label>Identity and rules</Label>
          <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Row term="Agent key">
              <a
                href={explorerAddress(config.agent, network)}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[0.8rem] text-oxblood underline"
              >
                {shortAddress(config.agent)}
              </a>
            </Row>
            <Row term="Anyone may open markets">{String(config.allow_public_markets) === "true" ? "Yes" : "No"}</Row>
            <Row term="Minimum stake">{genLabel(config.min_bet_atto, 4)}</Row>
            <Row term="Dispute bond">{genLabel(config.dispute_bond_atto, 4)}</Row>
            <Row term="Dispute window">{Math.round(Number(config.dispute_window_seconds) / 60)} minutes</Row>
            <Row term="Slash on a wrong juror">{Number(config.juror_slash_bps) / 100}%</Row>
          </dl>
        </Card>
      ) : null}

      <h2 className="mt-12 border-b border-line pb-3 font-display text-xl text-ink">
        What it opened, and why
      </h2>

      {isLoading ? <Spinner /> : null}

      {!isLoading && opened.length === 0 ? (
        <div className="mt-6">
          <Empty title="The agent has not opened anything here yet">
            It runs on a timer. Every market it opens carries the reasoning it committed at the time.
          </Empty>
        </div>
      ) : null}

      <ol className="mt-2 flex flex-col">
        {opened.map((market) => {
          const category = categoryOf(market.category);
          return (
            <li key={market.id} className="relative border-b border-line py-6 pl-6">
              <span
                aria-hidden
                className="absolute left-0 top-[1.95rem] h-1.5 w-1.5 rounded-full"
                style={{ background: category.accent }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Label>{stamp(market.created_at)}</Label>
                <Label>{category.label} · {category.source}</Label>
                <StatusBadge status={market.status} />
              </div>
              <Link
                to={`/market/${market.id}`}
                className="mt-2 block font-display text-[1.08rem] leading-snug text-ink hover:text-oxblood"
              >
                {market.question}
              </Link>
              {market.rationale ? (
                <p className="mt-2 max-w-2xl border-l-2 border-line pl-4 text-[0.9rem] italic leading-relaxed text-muted">
                  {market.rationale}
                </p>
              ) : null}
              <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted">
                seeded {genLabel(market.seed, 3)} · closes {timeUntil(market.closes_at)}
              </p>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
      <dt className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">{term}</dt>
      <dd className="text-[0.9rem] text-ink">{children}</dd>
    </div>
  );
}
