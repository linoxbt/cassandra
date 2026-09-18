import { useEffect, useRef, useState } from "react";

/**
 * Reveal-on-scroll, without parking content at `opacity: 0` and hoping an
 * observer fires. The element renders visible by default and is only hidden once
 * JavaScript has confirmed it can un-hide it, so the page still reads with
 * scripting off, in a screenshot, and under reduced motion.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<"idle" | "pending" | "in">("idle");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setState("pending");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setState("in");
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold]);

  return {
    ref,
    className: state === "pending" ? "reveal-pending" : state === "in" ? "reveal-in" : "",
  };
}
