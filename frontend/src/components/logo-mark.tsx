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

// Proportions matter more than detail here: the first draft was tall and narrow
// and read as a dark splinter at 24px rather than as a leaf. This one is roughly
// 32 wide to 38 tall, which still reads as a laurel leaf at favicon size.
const LEFT = "M23.3 5 C11.5 14.5 8.5 28.5 23.3 43 L23.3 5 Z";
const RIGHT = "M24.7 5 C36.5 14.5 39.5 28.5 24.7 43 L24.7 5 Z";
// Kept inside the blade: the first pass ran past the leaf edge and read as
// whiskers rather than veins.
const VEINS = [
  "M23.3 16 L18.4 14.2",
  "M23.3 24 L15.6 23.4",
  "M23.3 32 L18.0 33.2",
  "M24.7 16 L29.6 14.2",
  "M24.7 24 L32.4 23.4",
  "M24.7 32 L30.0 33.2",
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
        <path d={LEFT} className={variant === "draw" ? "leaf-half" : undefined} style={{ ["--dash" as string]: 130 }} />
        <path d={RIGHT} className={variant === "draw" ? "leaf-half" : undefined} style={{ ["--dash" as string]: 130 }} />
      </g>
      {/* The midrib: the rule that makes two readings binding. */}
      <path
        d="M24 5.5 L24 46"
        stroke="currentColor"
        strokeWidth={stroked ? 1.6 : 1.4}
        strokeLinecap="round"
        className={variant === "draw" ? "leaf-rib" : undefined}
        style={{ ["--dash" as string]: 41 }}
      />
      <g stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" opacity={stroked ? 0.75 : 0.28}>
        {VEINS.map((d) => (
          <path key={d} d={d} className={variant === "draw" ? "leaf-vein" : undefined} style={{ ["--dash" as string]: 14 }} />
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
