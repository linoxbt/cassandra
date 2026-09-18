import { CATEGORIES, CATEGORY_KEYS } from "@/lib/categories";

/**
 * The evidence sources, running past. The list is rendered twice and the track
 * is translated exactly -50%, which is what makes the loop seamless; the second
 * copy is hidden from assistive tech so nothing is announced twice. Under
 * reduced motion the animation is neutered by the global rule and the row simply
 * wraps and sits still.
 */
export function SourceMarquee() {
  const items = [...CATEGORY_KEYS, ...CATEGORY_KEYS];
  return (
    <div className="group relative overflow-hidden border-y border-line bg-paper-2 py-4">
      <div
        className="flex w-max gap-12 whitespace-nowrap motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center"
        style={{ animation: "cass-marquee 38s linear infinite" }}
      >
        {items.map((key, index) => {
          const entry = CATEGORIES[key];
          return (
            <span
              key={`${key}-${index}`}
              aria-hidden={index >= CATEGORY_KEYS.length}
              className={`flex items-center gap-3 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-muted${
                index >= CATEGORY_KEYS.length ? " motion-reduce:hidden" : ""
              }`}
            >
              <span className="h-1 w-1 rounded-full" style={{ background: entry.accent }} />
              {entry.label}
              <span className="text-line-strong">·</span>
              <span className="text-ink-soft">{entry.source}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
