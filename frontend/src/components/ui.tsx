import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** The whole primitive set. Everything is hairline rules and 2px corners: this
 *  is a printed document, not a card-based dashboard. */

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonTone = "primary" | "ghost" | "quiet" | "yes" | "no";

const TONES: Record<ButtonTone, string> = {
  primary: "bg-oxblood text-paper border-oxblood hover:bg-oxblood-soft",
  ghost: "bg-transparent text-ink border-line-strong hover:border-ink hover:bg-paper-2",
  quiet: "bg-transparent text-muted border-transparent hover:text-ink",
  yes: "bg-yes/10 text-yes border-yes/40 hover:bg-yes/20",
  no: "bg-no/10 text-no border-no/40 hover:bg-no/20",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm border px-4 py-2 text-[0.82rem] font-medium " +
  "uppercase tracking-[0.1em] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45";

export function Button({
  children, tone = "ghost", className, type = "button", ...rest
}: {
  children: ReactNode;
  tone?: ButtonTone;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cn(BASE, TONES[tone], className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children, to, href, tone = "ghost", className,
}: {
  children: ReactNode;
  to?: string;
  href?: string;
  tone?: ButtonTone;
  className?: string;
}) {
  const classes = cn(BASE, TONES[tone], className);
  if (to) return <Link to={to} className={classes}>{children}</Link>;
  return (
    <a href={href} className={classes} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-sm border border-line bg-surface", className)}>{children}</div>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted", className)}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  OPEN: "border-yes/40 text-yes",
  CLOSED: "border-pending/50 text-pending",
  RESOLVED: "border-gold/60 text-gold",
  DISPUTED: "border-no/50 text-no",
  FINAL: "border-ink/30 text-ink",
  VOID: "border-line-strong text-muted",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-[0.16em]",
        STATUS_TONE[status] ?? "border-line-strong text-muted",
        className,
      )}
    >
      {status}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="border-t border-line pt-3">
      <Label>{label}</Label>
      <div className="mt-1 font-display text-[1.65rem] leading-none text-ink tabular-nums">{value}</div>
      {sub ? <div className="mt-1.5 text-[0.78rem] text-muted">{sub}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-sm border border-dashed border-line-strong px-6 py-14 text-center">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      {children ? <div className="mx-auto mt-2 max-w-md text-[0.9rem] text-muted">{children}</div> : null}
    </div>
  );
}

export function Spinner({ label = "Reading the chain" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-oxblood animate-pulse-dot" />
      <Label>{label}</Label>
    </div>
  );
}

export function Notice({ tone = "quiet", children }: { tone?: "quiet" | "warn"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-sm border-l-2 px-4 py-3 text-[0.86rem]",
        tone === "warn"
          ? "border-l-no bg-no/5 text-ink-soft"
          : "border-l-gold bg-gold/8 text-ink-soft",
      )}
    >
      {children}
    </div>
  );
}

/**
 * A hairline grid paints its rules by showing the container's background through
 * 1px gaps. An odd number of cells leaves one empty, and an empty cell shows the
 * whole background as a solid block rather than a line. This fills it.
 */
export function GridFiller({ count, columns = 2 }: { count: number; columns?: number }) {
  const empty = (columns - (count % columns)) % columns;
  if (empty === 0) return null;
  return (
    <>
      {Array.from({ length: empty }, (_, index) => (
        <div key={`filler-${index}`} className="hidden bg-surface sm:block" aria-hidden />
      ))}
    </>
  );
}
