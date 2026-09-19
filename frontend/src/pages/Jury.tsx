import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Button, Card, Empty, Label, Notice, Spinner, StatusBadge, cn } from "@/components/ui";
import { TxStatus } from "@/components/tx-status";
import { useAction } from "@/hooks/use-action";
import { useMarkets } from "@/lib/queries";
import { claimJury, finalizeJury, getJury } from "@/lib/contract";
import { gen, genLabel, shortAddress } from "@/lib/format";
import { isDeployed, useNetwork } from "@/lib/network";
import { useWallet } from "@/lib/wallet";
import { NotDeployed } from "./Markets";

export function Jury() {
  const network = useNetwork();
  const { address } = useWallet();
  const { data: markets, isLoading } = useMarkets();
  const action = useAction();

  const juries = useQueries({
    queries: (markets ?? []).map((market) => ({
      queryKey: ["jury-page", network, market.id],
      queryFn: () => getJury(market.id),
      enabled: isDeployed(),
      staleTime: 20_000,
    })),
  });

  const rows = useMemo(() => {
    if (!markets) return [];
    return markets
      .map((market, index) => ({ market, jury: juries[index]?.data ?? [] }))
      .filter((row) => row.jury.length > 0);
  }, [markets, juries]);

  if (!isDeployed()) return <NotDeployed />;

  const bonded = rows.reduce(
    (total, row) => total + row.jury.reduce((sum, juror) => sum + BigInt(juror.bond), 0n),
    0n,
  );

  return (
    <>
      <header className="border-b-2 border-ink pb-5">
        <Label>Skin in the game</Label>
        <h1 className="mt-2 font-display text-display-sm text-ink">The jury</h1>
      </header>

      <div className="mt-6 max-w-3xl">
        <Notice>
          This is an application-level bond pool, not GenLayer's protocol staking. Nothing here
          stakes, slashes or selects a network validator — the real validator economics happen a
          layer below, in the consensus that produces each verdict.{" "}
          <Link to="/docs/the-jury" className="text-oxblood underline">The details</Link>.
        </Notice>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3">
        <Card className="p-5">
          <Label>Markets with a jury</Label>
          <div className="mt-1 font-display text-2xl text-ink tabular-nums">{rows.length}</div>
        </Card>
        <Card className="p-5">
          <Label>Total bonded</Label>
          <div className="mt-1 font-display text-2xl text-ink tabular-nums">{gen(bonded.toString(), 3)}</div>
        </Card>
        <Card className="p-5">
          <Label>Slash on a wrong call</Label>
          <div className="mt-1 font-display text-2xl text-ink">50%</div>
        </Card>
      </div>

      {isLoading ? <Spinner /> : null}

      {!isLoading && rows.length === 0 ? (
        <div className="mt-8">
          <Empty title="Nobody has bonded a reading yet">
            Open a market from <Link to="/markets" className="text-oxblood underline">the board</Link>{" "}
            and bond a side while it is still trading.
          </Empty>
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-6">
        {rows.map(({ market, jury }) => {
          const mine = address ? jury.find((juror) => juror.juror.toLowerCase() === address.toLowerCase()) : undefined;
          const settled = market.status === "FINAL" || market.status === "VOID";
          const unsettled = jury.some((juror) => !juror.settled);
          return (
            <Card key={market.id} className="p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Label>#{String(market.id).padStart(4, "0")}</Label>
                <StatusBadge status={market.status} />
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted">
                  {jury.length} juror{jury.length === 1 ? "" : "s"}
                </span>
              </div>
              <Link to={`/market/${market.id}`} className="mt-2 block font-display text-[1.08rem] leading-snug text-ink hover:text-oxblood">
                {market.question}
              </Link>

              <ul className="mt-4 flex flex-col divide-y divide-line">
                {jury.map((juror) => (
                  <li key={juror.juror} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[0.86rem]">
                    <span className="font-mono text-muted">
                      {shortAddress(juror.juror)}
                      {address && juror.juror.toLowerCase() === address.toLowerCase() ? " (you)" : ""}
                    </span>
                    <span className={cn("font-mono text-[0.72rem] uppercase tracking-[0.12em]", juror.side === "YES" ? "text-yes" : "text-no")}>
                      {juror.side}
                    </span>
                    <span className="tabular-nums text-ink-soft">{genLabel(juror.bond, 2)}</span>
                    <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted">
                      {juror.settled ? `settled ${gen(juror.payout, 3)}` : "bonded"}
                    </span>
                  </li>
                ))}
              </ul>

              {settled && unsettled ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    tone="ghost"
                    disabled={!action.connected || action.state === "signing" || action.state === "waiting"}
                    onClick={() =>
                      action.run((ctx) => finalizeJury(ctx, market.id), {
                        note: "One bounded pass to work out who was right. Anyone can call this.",
                      })
                    }
                  >
                    Finalize the jury
                  </Button>
                  {mine && !mine.settled ? (
                    <Button
                      tone="primary"
                      disabled={!action.connected || action.state === "signing" || action.state === "waiting"}
                      onClick={() => action.run((ctx) => claimJury(ctx, market.id), { note: "Pulling your own settlement." })}
                    >
                      Claim your settlement
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <TxStatus state={action.state} error={action.error} hash={action.hash} note={action.note} />
    </>
  );
}
