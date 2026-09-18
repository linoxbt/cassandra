import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Card, Empty, Label, Notice, Spinner, StatusBadge, cn } from "@/components/ui";
import { OddsCurve } from "@/components/landing/odds-curve";
import { VerdictSeal } from "@/components/landing/verdict-seal";
import { EscrowFlow, type FlowState } from "@/components/landing/escrow-flow";
import { TxStatus } from "@/components/tx-status";
import { useAction } from "@/hooks/use-action";
import { useDispute, useJury, useMarket, usePosition, useVerdict } from "@/lib/queries";
import {
  arbitrateMarket, claimPayout, fileDispute, placeBet, resolveMarket, stakeJuror, voidMarket,
} from "@/lib/contract";
import type { Side } from "@/lib/contract";
import { gen, genLabel, impliedOdds, shortAddress, stamp, timeUntil, toAtto } from "@/lib/format";
import { categoryOf } from "@/lib/categories";
import { explorerAddress, isDeployed, useNetwork } from "@/lib/network";
import { useWallet } from "@/lib/wallet";
import { NotDeployed } from "./Markets";

export function MarketDetail() {
  const { id } = useParams();
  const network = useNetwork();
  const { address } = useWallet();
  const { data: market, isLoading } = useMarket(id);
  const { data: verdict } = useVerdict(id);
  const { data: dispute } = useDispute(id);
  const { data: jury } = useJury(id);
  const { data: position } = usePosition(id, address);

  if (!isDeployed()) return <NotDeployed />;
  if (isLoading) return <Spinner />;
  if (!market) return <Empty title="No such market">Nothing on this network has that id.</Empty>;

  const odds = impliedOdds(market.yes_pool, market.no_pool);
  const category = categoryOf(market.category);
  const pool = (BigInt(market.yes_pool) + BigInt(market.no_pool)).toString();
  const held = position ? BigInt(position.yes) + BigInt(position.no) : 0n;

  return (
    <>
      <Link to="/markets" className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted hover:text-ink">
        ← the board
      </Link>

      <header className="mt-5 border-b-2 border-ink pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Label>#{String(market.id).padStart(4, "0")} · {category.label} · {category.source}</Label>
          <StatusBadge status={market.status} />
          {market.by_agent ? <Label>opened by the agent</Label> : null}
        </div>
        <h1 className="mt-4 max-w-3xl font-display text-display-sm leading-tight text-ink">{market.question}</h1>
        <p className="mt-4 max-w-3xl text-[0.94rem] leading-relaxed text-ink-soft">{market.criteria}</p>
        {market.rationale ? (
          <p className="mt-3 max-w-3xl border-l-2 border-line pl-4 text-[0.9rem] italic leading-relaxed text-muted">
            {market.rationale}
          </p>
        ) : null}
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <Card className="p-6">
            <OddsCurve yes={odds.yes} />
            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4">
              <Figure label="Pool" value={genLabel(pool, 3)} />
              <Figure label="On yes" value={genLabel(market.yes_pool, 3)} />
              <Figure label="On no" value={genLabel(market.no_pool, 3)} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[0.8rem] text-muted">
              <span>{market.bet_count} stakes taken</span>
              <span>
                {market.status === "OPEN" ? "Closes " : "Closed "}
                {stamp(market.closes_at)} · {timeUntil(market.closes_at)}
              </span>
            </div>
          </Card>

          {verdict ? <VerdictPanel verdict={verdict} market={market} /> : null}
          {dispute ? <DisputePanel dispute={dispute} /> : null}
          <EvidencePanel market={market} />
          {jury && jury.length > 0 ? <JuryPanel jury={jury} /> : null}
        </div>

        <aside className="flex flex-col gap-6">
          <YourPosition market={market} held={held} position={position} />
          <ActionPanel market={market} verdict={verdict} held={held} />
          <Card className="p-5">
            <Label>Contract</Label>
            <a
              href={explorerAddress(market.creator, network)}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 block font-mono text-[0.78rem] text-oxblood underline"
            >
              creator {shortAddress(market.creator)}
            </a>
            <p className="mt-3 text-[0.82rem] leading-relaxed text-muted">
              Every figure on this page is a live read. There is no indexer between you and the
              contract.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 font-display text-lg text-ink tabular-nums">{value}</div>
    </div>
  );
}

function VerdictPanel({
  verdict,
  market,
}: {
  verdict: NonNullable<ReturnType<typeof useVerdict>["data"]>;
  market: NonNullable<ReturnType<typeof useMarket>["data"]>;
}) {
  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-start gap-7">
        <VerdictSeal outcome={verdict.outcome} band={verdict.confidence_band} size={132} />
        <div className="min-w-[16rem] flex-1">
          <Label>Verdict</Label>
          <h2 className="mt-2 font-display text-2xl text-ink">
            {verdict.outcome === "UNRESOLVED" ? "The evidence did not settle it" : verdict.outcome}
          </h2>
          <p className="mt-3 text-[0.94rem] leading-relaxed text-ink-soft">{verdict.reasoning}</p>
          {verdict.arbitrated ? (
            <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
              arbitrated · originally {verdict.original_outcome}
            </p>
          ) : null}
          <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
            confidence {verdict.confidence_band} · read {stamp(verdict.resolved_at)}
          </p>
          {market.status === "RESOLVED" ? (
            <p className="mt-3 text-[0.84rem] text-muted">
              Open to challenge until {stamp(verdict.dispute_deadline)}.
            </p>
          ) : null}
        </div>
      </div>
      {market.void_reason ? (
        <div className="mt-5">
          <Notice>Voided: {market.void_reason}. Every position is refundable in full.</Notice>
        </div>
      ) : null}
    </Card>
  );
}

function EvidencePanel({ market }: { market: NonNullable<ReturnType<typeof useMarket>["data"]> }) {
  const { data: verdict } = useVerdict(market.id);
  return (
    <Card className="mt-6 p-6">
      <Label>Evidence</Label>
      <a
        href={market.evidence_url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 block break-all font-mono text-[0.76rem] text-oxblood underline"
      >
        {market.evidence_url}
      </a>
      <p className="mt-3 text-[0.86rem] leading-relaxed text-muted">
        Derived by the contract from the category and source named when this market opened — not
        supplied at settlement. Nobody can point it somewhere else after seeing which way the money
        went.
      </p>
      {verdict?.evidence_excerpt ? (
        <>
          <div className="mt-5 border-t border-line pt-4">
            <Label>What the leader read</Label>
          </div>
          <pre className="mt-2 max-h-56 overflow-auto rounded-sm border border-line bg-paper-2 p-3 text-[0.72rem] leading-relaxed text-ink-soft">
            {verdict.evidence_excerpt}
          </pre>
          <p className="mt-2 text-[0.78rem] text-muted">
            sha256 <span className="font-mono">{verdict.evidence_digest.slice(0, 24)}…</span> — this is
            the leader's copy. Validators re-fetched and had to agree on the decision, but raw bytes
            cannot be compared across callers.{" "}
            <Link to="/docs/limits" className="text-oxblood underline">Why</Link>.
          </p>
        </>
      ) : null}
    </Card>
  );
}

function DisputePanel({ dispute }: { dispute: NonNullable<ReturnType<typeof useDispute>["data"]> }) {
  return (
    <Card className="mt-6 p-6">
      <Label>Challenge</Label>
      <p className="mt-2 text-[0.94rem] leading-relaxed text-ink-soft">{dispute.argument}</p>
      <a
        href={dispute.evidence_url}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 block break-all font-mono text-[0.74rem] text-oxblood underline"
      >
        {dispute.evidence_url}
      </a>
      <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
        {shortAddress(dispute.disputer)} bonded {genLabel(dispute.bond, 2)} ·{" "}
        {dispute.disposed ? (dispute.overturned ? "overturned, bond refunded" : "upheld, bond forfeited to the jury") : "awaiting arbitration"}
      </p>
    </Card>
  );
}

function JuryPanel({ jury }: { jury: NonNullable<ReturnType<typeof useJury>["data"]> }) {
  return (
    <Card className="mt-6 p-6">
      <Label>The jury</Label>
      <ul className="mt-3 flex flex-col divide-y divide-line">
        {jury.map((juror) => (
          <li key={juror.juror} className="flex items-center justify-between gap-3 py-2.5 text-[0.86rem]">
            <span className="font-mono text-muted">{shortAddress(juror.juror)}</span>
            <span className={cn("font-mono text-[0.72rem] uppercase tracking-[0.12em]", juror.side === "YES" ? "text-yes" : "text-no")}>
              {juror.side}
            </span>
            <span className="tabular-nums text-ink-soft">{genLabel(juror.bond, 2)}</span>
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted">
              {juror.settled ? `settled ${gen(juror.payout, 2)}` : "bonded"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.82rem] leading-relaxed text-muted">
        Jurors are paid from slashed bonds, never from the pool.{" "}
        <Link to="/docs/the-jury" className="text-oxblood underline">How the jury works</Link>.
      </p>
    </Card>
  );
}

function YourPosition({
  market,
  held,
  position,
}: {
  market: NonNullable<ReturnType<typeof useMarket>["data"]>;
  held: bigint;
  position: ReturnType<typeof usePosition>["data"];
}) {
  const { address } = useWallet();
  if (!address) {
    return (
      <Card className="p-5">
        <Label>Your position</Label>
        <p className="mt-2 text-[0.88rem] text-muted">Connect a wallet to take a side.</p>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <Label>Your position</Label>
      {held === 0n ? (
        <p className="mt-2 text-[0.88rem] text-muted">Nothing on this market yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-yes">Yes</span>
            <div className="font-display text-lg text-ink tabular-nums">{gen(position?.yes ?? "0", 3)}</div>
          </div>
          <div>
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-no">No</span>
            <div className="font-display text-lg text-ink tabular-nums">{gen(position?.no ?? "0", 3)}</div>
          </div>
        </div>
      )}
      {market.status === "OPEN" && held > 0n ? (
        <p className="mt-3 text-[0.8rem] leading-relaxed text-muted">
          These are tokens. You can sell them to someone else while the market is still trading —
          after that they freeze, so whoever holds them at settlement is who gets paid.
        </p>
      ) : null}
    </Card>
  );
}

function ActionPanel({
  market,
  verdict,
  held,
}: {
  market: NonNullable<ReturnType<typeof useMarket>["data"]>;
  verdict: ReturnType<typeof useVerdict>["data"];
  held: bigint;
}) {
  const action = useAction();
  const [amount, setAmount] = useState("0.05");
  const [side, setSide] = useState<Side>("YES");
  const [argument, setArgument] = useState("");
  const [url, setUrl] = useState("");
  const [flow, setFlow] = useState<FlowState>("idle");

  useEffect(() => {
    // The escrow animation is driven by finality, never by submission: at submit
    // the money has not moved and the call can still revert.
    if (action.state === "done") setFlow("paid");
    else if (action.state === "waiting") setFlow("waiting");
    else if (action.state === "signing") setFlow("signing");
    else if (action.state === "failed") setFlow("failed");
    else setFlow("idle");
  }, [action.state]);

  const value = useMemo(() => {
    try {
      return toAtto(amount);
    } catch {
      return 0n;
    }
  }, [amount]);

  const disabled = !action.connected || action.state === "signing" || action.state === "waiting";

  return (
    <Card className="p-5">
      <Label>
        {market.status === "OPEN" ? "Take a side" : market.status === "CLOSED" ? "Settle it" : "Act"}
      </Label>

      {market.status === "OPEN" ? (
        <>
          <div className="mt-3 flex gap-1">
            {(["YES", "NO"] as Side[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSide(option)}
                className={cn(
                  "flex-1 rounded-sm border px-3 py-2 font-mono text-[0.72rem] uppercase tracking-[0.14em] transition-colors",
                  side === option
                    ? option === "YES"
                      ? "border-yes bg-yes/10 text-yes"
                      : "border-no bg-no/10 text-no"
                    : "border-line text-muted hover:text-ink",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">Amount (GEN)</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[0.9rem] text-ink outline-none focus:border-line-strong"
            />
          </label>
          <Button
            tone={side === "YES" ? "yes" : "no"}
            className="mt-3 w-full"
            disabled={disabled || value <= 0n}
            onClick={() =>
              action.run((ctx) => placeBet(ctx, market.id, side, value), {
                note: "Your stake mints position tokens one-for-one with the wei behind it.",
              })
            }
          >
            Stake {side}
          </Button>
          <div className="mt-5 border-t border-line pt-4">
            <Label>Or bond a reading</Label>
            <p className="mt-1.5 text-[0.8rem] leading-relaxed text-muted">
              Say how you think it resolves. If you are right you take a share of what the wrong
              jurors are slashed; if you are wrong, you lose half your bond.
            </p>
            <Button
              tone="ghost"
              className="mt-3 w-full"
              disabled={disabled || value <= 0n}
              onClick={() => action.run((ctx) => stakeJuror(ctx, market.id, side, value), { note: "Bonding a reading as a juror." })}
            >
              Bond {side} as juror
            </Button>
          </div>
        </>
      ) : null}

      {market.status === "CLOSED" ? (
        <>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-muted">
            Trading has closed. Anyone can trigger settlement — the contract fetches the evidence
            itself and every validator reads it independently.
          </p>
          <Button
            tone="primary"
            className="mt-3 w-full"
            disabled={disabled}
            onClick={() =>
              action.run((ctx) => resolveMarket(ctx, market.id), {
                note: "This runs a model across every validator. Minutes, not seconds.",
              })
            }
          >
            Resolve
          </Button>
          {Number(market.resolve_deadline) * 1000 < Date.now() ? (
            <Button
              tone="ghost"
              className="mt-2 w-full"
              disabled={disabled}
              onClick={() => action.run((ctx) => voidMarket(ctx, market.id), { note: "Unwinding a market past its deadline." })}
            >
              Void and refund
            </Button>
          ) : null}
        </>
      ) : null}

      {market.status === "RESOLVED" ? (
        <>
          <p className="mt-2 text-[0.86rem] leading-relaxed text-muted">
            Think this reading is wrong? Post a bond and your own evidence, and a second consensus
            round will weigh both.
          </p>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://… your evidence"
            className="mt-3 w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[0.78rem] text-ink outline-none focus:border-line-strong"
          />
          <textarea
            value={argument}
            onChange={(event) => setArgument(event.target.value)}
            rows={3}
            placeholder="Why the verdict is wrong"
            className="mt-2 w-full rounded-sm border border-line bg-surface px-3 py-2 text-[0.86rem] text-ink outline-none focus:border-line-strong"
          />
          <label className="mt-2 block">
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">Bond (GEN)</span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[0.9rem] text-ink outline-none focus:border-line-strong"
            />
          </label>
          <Button
            tone="ghost"
            className="mt-3 w-full"
            disabled={disabled || !url.startsWith("https://") || argument.trim().length < 8 || value <= 0n}
            onClick={() =>
              action.run((ctx) => fileDispute(ctx, market.id, url.trim(), argument.trim(), value), {
                note: "A failed challenge forfeits its bond to the jury.",
              })
            }
          >
            Challenge the verdict
          </Button>
        </>
      ) : null}

      {market.status === "DISPUTED" ? (
        <Button
          tone="primary"
          className="mt-3 w-full"
          disabled={disabled}
          onClick={() => action.run((ctx) => arbitrateMarket(ctx, market.id), { note: "A second consensus round. Binding either way." })}
        >
          Run arbitration
        </Button>
      ) : null}

      {(market.status === "FINAL" || market.status === "VOID" || market.status === "RESOLVED") && held > 0n ? (
        <div className="mt-5 border-t border-line pt-4">
          <Label>{market.status === "VOID" ? "Refund" : "Settlement"}</Label>
          <EscrowFlow state={flow} className="mt-2" />
          <Button
            tone="primary"
            className="mt-2 w-full"
            disabled={disabled}
            onClick={() =>
              action.run((ctx) => claimPayout(ctx, market.id), {
                note: "Payouts to a person execute at finality, never sooner. This waits for it.",
              })
            }
          >
            {market.status === "VOID" ? "Claim refund" : "Claim payout"}
          </Button>
        </div>
      ) : null}

      {verdict?.outcome === "UNRESOLVED" && held === 0n ? (
        <p className="mt-3 text-[0.82rem] text-muted">
          This market voided — the evidence did not settle the question, so every stake is refundable.
        </p>
      ) : null}

      <TxStatus state={action.state} error={action.error} hash={action.hash} note={action.note} />
    </Card>
  );
}
