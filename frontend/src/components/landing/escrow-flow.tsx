import { useEffect, useState } from "react";

/**
 * Money moving, at the moment it actually moves.
 *
 * A payout to a person is an external message that executes on FINALIZATION, not
 * when the transaction is accepted, so this animation is driven by the finalized
 * transition and nothing earlier. Showing coins flying on submit would be a
 * pleasant lie: at that point the money has not gone anywhere, and the call can
 * still revert.
 */
export type FlowState = "idle" | "signing" | "waiting" | "paid" | "failed";

const STAGE_COPY: Record<FlowState, string> = {
  idle: "Escrow holds the pool",
  signing: "Waiting for your signature",
  waiting: "Validators are reaching finality",
  paid: "Paid out",
  failed: "Nothing moved",
};

export function EscrowFlow({
  state,
  amount,
  className,
}: {
  state: FlowState;
  amount?: string;
  className?: string;
}) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (state !== "paid") return;
    setPulse((n) => n + 1);
  }, [state]);

  const active = state === "waiting" || state === "paid";

  return (
    <div className={className}>
      <svg viewBox="0 0 320 96" className="w-full" role="img" aria-label={STAGE_COPY[state]}>
        <defs>
          <path id="cass-route" d="M52 48 C120 48 200 48 268 48" />
        </defs>

        {/* the escrow */}
        <rect x="18" y="30" width="36" height="36" rx="2" fill="none" stroke="var(--color-ink)" strokeWidth="1.2" />
        <text x="36" y="80" textAnchor="middle" fontSize="7" fill="var(--color-muted)" fontFamily="var(--font-mono)">
          POOL
        </text>

        {/* the route */}
        <use
          href="#cass-route"
          fill="none"
          stroke="var(--color-line-strong)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />

        {/* the claimant */}
        <circle cx="286" cy="48" r="17" fill="none" stroke={state === "paid" ? "var(--color-yes)" : "var(--color-ink)"} strokeWidth="1.2" />
        <text x="286" y="80" textAnchor="middle" fontSize="7" fill="var(--color-muted)" fontFamily="var(--font-mono)">
          YOU
        </text>

        {/* the value in transit - only once finality is the thing being waited on */}
        {active
          ? [0, 1, 2].map((index) => (
              <circle
                key={`${pulse}-${index}`}
                r="3.4"
                fill="var(--color-gold)"
                style={{
                  offsetPath: "path('M52 48 C120 48 200 48 268 48')",
                  animation: `cass-travel ${state === "paid" ? 900 : 2100}ms cubic-bezier(0.4,0,0.2,1) ${index * 240}ms ${
                    state === "paid" ? "1" : "infinite"
                  } both`,
                }}
              />
            ))
          : null}
      </svg>

      <div className="mt-1 flex items-baseline justify-between">
        <span className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
          {STAGE_COPY[state]}
        </span>
        {amount && state === "paid" ? (
          <span className="font-display text-lg text-yes tabular-nums">+{amount}</span>
        ) : null}
      </div>
    </div>
  );
}
