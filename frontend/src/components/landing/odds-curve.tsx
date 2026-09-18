import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The odds, drawn as a distribution that redistributes.
 *
 * A pool-share market has no order book, so the only price there is is the share
 * of the pool each side holds. Rather than draw that as a bar, it is drawn as the
 * mass either side of a dividing line: as money moves, the peak slides and the
 * area follows it. The same component backs the marketing hero and the live
 * market page, so what the landing page shows is the real thing.
 */
const WIDTH = 520;
const HEIGHT = 190;
const SAMPLES = 96;

function curve(centre: number, spread: number) {
  const points: [number, number][] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const x = i / SAMPLES;
    const z = (x - centre) / spread;
    const y = Math.exp(-0.5 * z * z);
    points.push([x * WIDTH, HEIGHT - y * (HEIGHT - 26) - 8]);
  }
  return points;
}

function toPath(points: [number, number][], close: boolean) {
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return close ? `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z` : line;
}

export function OddsCurve({
  yes,
  className,
  animate = false,
  label = true,
}: {
  /** Share of the pool on YES, 0..1. */
  yes: number;
  className?: string;
  /** Cycles through a few states, for the landing page. */
  animate?: boolean;
  label?: boolean;
}) {
  const [shown, setShown] = useState(yes);

  useEffect(() => {
    if (!animate) {
      setShown(yes);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const states = [0.5, 0.62, 0.41, 0.73, 0.57];
    let index = 0;
    const timer = window.setInterval(() => {
      index = (index + 1) % states.length;
      setShown(states[index]);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [yes, animate]);

  const target = animate ? shown : yes;
  const eased = useSmooth(target);
  const points = useMemo(() => curve(eased, 0.19), [eased]);
  const split = eased * WIDTH;

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label={`${Math.round(eased * 100)}% of the pool is on yes`}>
        <defs>
          <linearGradient id="cass-yes" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-yes)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-yes)" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="cass-no" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-no)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--color-no)" stopOpacity="0.03" />
          </linearGradient>
          <clipPath id="cass-clip-yes"><rect x="0" y="0" width={split} height={HEIGHT} /></clipPath>
          <clipPath id="cass-clip-no"><rect x={split} y="0" width={WIDTH - split} height={HEIGHT} /></clipPath>
        </defs>

        <path d={toPath(points, true)} fill="url(#cass-yes)" clipPath="url(#cass-clip-yes)" />
        <path d={toPath(points, true)} fill="url(#cass-no)" clipPath="url(#cass-clip-no)" />
        <path d={toPath(points, false)} fill="none" stroke="var(--color-ink)" strokeWidth="1.25" />

        {/* The dividing line is the market's own price. */}
        <line x1={split} y1="6" x2={split} y2={HEIGHT} stroke="var(--color-gold)" strokeWidth="1.25" strokeDasharray="3 3" />
        <line x1="0" y1={HEIGHT - 0.5} x2={WIDTH} y2={HEIGHT - 0.5} stroke="var(--color-line-strong)" strokeWidth="1" />
      </svg>
      {label ? (
        <figcaption className="mt-3 flex items-center justify-between font-mono text-[0.68rem] uppercase tracking-[0.16em]">
          <span className="text-yes">Yes {Math.round(eased * 100)}%</span>
          <span className="text-muted">implied by the pools</span>
          <span className="text-no">No {100 - Math.round(eased * 100)}%</span>
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Eases a changing number over ~700ms so the curve slides instead of jumping. */
function useSmooth(target: number) {
  const [value, setValue] = useState(target);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const from = value;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // `value` is deliberately not a dependency: it is the animation's start
    // point, and depending on it would restart the tween on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}
