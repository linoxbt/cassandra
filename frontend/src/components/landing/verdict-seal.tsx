import { useEffect, useRef, useState } from "react";

/**
 * The verdict, as a seal that draws itself.
 *
 * This is the "live badge" the brief asked for. It draws once, when the verdict
 * actually exists - never on submit, and never on ACCEPTED, because ACCEPTED only
 * means the transaction landed and the call inside it can still have reverted.
 *
 * UNRESOLVED is a first-class outcome, not an error state: the contract found the
 * evidence did not settle the question, the market voids and everyone is
 * refunded. It gets its own seal rather than a red one.
 */
type Outcome = "YES" | "NO" | "UNRESOLVED" | null;

const TONE: Record<"YES" | "NO" | "UNRESOLVED", { color: string; glyph: string; word: string }> = {
  YES: { color: "var(--color-yes)", glyph: "M14 25 L21 32 L34 17", word: "Yes" },
  NO: { color: "var(--color-no)", glyph: "M16 16 L32 32 M32 16 L16 32", word: "No" },
  UNRESOLVED: { color: "var(--color-muted)", glyph: "M15 24 L33 24", word: "Unresolved" },
};

export function VerdictSeal({
  outcome,
  band,
  size = 148,
  className,
  replayKey,
}: {
  outcome: Outcome;
  band?: string;
  size?: number;
  className?: string;
  /** Change this to redraw - used by the landing page's demo cycle. */
  replayKey?: string | number;
}) {
  const [drawn, setDrawn] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDrawn(false);
    if (!outcome) return;
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setDrawn(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [outcome, replayKey]);

  if (!outcome) {
    return (
      <div ref={ref} className={className} style={{ width: size, height: size }}>
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <circle cx="24" cy="24" r="21" fill="none" stroke="var(--color-line)" strokeWidth="1" strokeDasharray="2 4" />
          <text x="24" y="27" textAnchor="middle" fontSize="5" fill="var(--color-muted)" fontFamily="var(--font-mono)">
            AWAITING
          </text>
        </svg>
      </div>
    );
  }

  const tone = TONE[outcome];
  const style = (delay: number, dash: number) =>
    drawn
      ? {
          strokeDasharray: dash,
          strokeDashoffset: dash,
          animation: `cass-draw 700ms cubic-bezier(0.4,0,0.2,1) ${delay}ms both`,
        }
      : { strokeDasharray: dash, strokeDashoffset: dash };

  return (
    <div ref={ref} className={className} style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" className="h-full w-full" role="img" aria-label={`Verdict: ${tone.word}`}>
        <circle cx="24" cy="24" r="21.5" fill="none" stroke={tone.color} strokeWidth="1" style={style(0, 136)} />
        <circle cx="24" cy="24" r="18.5" fill="none" stroke={tone.color} strokeWidth="0.5" opacity="0.5" style={style(180, 118)} />
        <path
          d={tone.glyph}
          fill="none"
          stroke={tone.color}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={style(420, 60)}
        />
        {band ? (
          <text x="24" y="42.5" textAnchor="middle" fontSize="3.4" fill={tone.color} fontFamily="var(--font-mono)" opacity={drawn ? 0.85 : 0}>
            {band}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
