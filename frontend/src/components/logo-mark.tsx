/**
 * The Cassandra mark: a laurel leaf split down the midrib.
 *
 * The laurel is the prophet's; the split is the point. Two halves are read
 * independently and must agree before the leaf is whole - one leaf, two
 * validators. The seam is a real gap rather than a drawn line, so at 16px the
 * eye still reads a single leaf and only notices the division up close.
 *
 * Three variants, all `currentColor`:
 *   solid    filled halves, for navigation and favicons
 *   outline  stroked, for large display use over a busy background
 *   draw     stroked and animated on, for the splash and the verdict seal
 */
type Variant = "solid" | "outline" | "draw";

const LEFT = "M23.4 3 C13.6 11.8 11 26.6 23.4 45 L23.4 3 Z";
const RIGHT = "M24.6 3 C34.4 11.8 37 26.6 24.6 45 L24.6 3 Z";
const VEINS = [
  "M23.4 14 L16.6 12.2",
  "M23.4 22 L15.2 21.4",
  "M23.4 30 L17 31.6",
  "M24.6 14 L31.4 12.2",
  "M24.6 22 L32.8 21.4",
  "M24.6 30 L31 31.6",
];

export function LogoMark({
  className = "",
  variant = "solid",
  title,
}: {
  className?: string;
  variant?: Variant;
  title?: string;
}) {
  const stroked = variant !== "solid";
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      {title ? <title>{title}</title> : null}
      <g
        stroke="currentColor"
        strokeWidth={stroked ? 1.6 : 0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={stroked ? "none" : "currentColor"}
      >
        <path d={LEFT} className={variant === "draw" ? "leaf-half" : undefined} style={{ ["--dash" as string]: 120 }} />
        <path d={RIGHT} className={variant === "draw" ? "leaf-half" : undefined} style={{ ["--dash" as string]: 120 }} />
      </g>
      {/* The midrib: the rule that makes two readings binding. */}
      <path
        d="M24 1.5 L24 46.5"
        stroke="currentColor"
        strokeWidth={stroked ? 1.6 : 1.4}
        strokeLinecap="round"
        className={variant === "draw" ? "leaf-rib" : undefined}
        style={{ ["--dash" as string]: 46 }}
      />
      <g stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" opacity={stroked ? 0.75 : 0.28}>
        {VEINS.map((d) => (
          <path key={d} d={d} className={variant === "draw" ? "leaf-vein" : undefined} style={{ ["--dash" as string]: 12 }} />
        ))}
      </g>
    </svg>
  );
}

export function Wordmark({ className = "", markClass = "h-6 w-6" }: { className?: string; markClass?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-2.5 ${className}`}>
      <LogoMark className={`${markClass} shrink-0 self-center text-oxblood`} />
      <span className="font-display text-[1.32rem] font-semibold leading-none tracking-[0.14em] text-ink">
        CASSANDRA
      </span>
    </span>
  );
}
