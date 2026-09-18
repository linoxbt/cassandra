import { useEffect, useRef, useState } from "react";

/** Counts up once, when it first comes into view. rAF with an ease-out, so it
 *  settles rather than stopping dead. */
export function AnimatedCounter({
  value,
  duration = 1100,
  format = (n: number) => n.toLocaleString("en-US"),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || started.current) return;
      started.current = true;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(value * eased);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {format(shown)}
    </span>
  );
}
