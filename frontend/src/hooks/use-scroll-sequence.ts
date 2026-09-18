import { useEffect, type RefObject } from "react";

/**
 * Drives a set of stacked panels from scroll position.
 *
 * The wrapper supplies the scroll distance (one viewport per panel) and a sticky
 * child pins one viewport of it. Opacity and transform are written straight onto
 * the nodes from a rAF callback rather than through React state - a re-render per
 * scroll event is what makes this kind of section stutter.
 */
const EDGE = 0.22;

export function useScrollSequence(
  wrapperRef: RefObject<HTMLElement | null>,
  panelRefs: RefObject<(HTMLElement | null)[]>,
  count: number,
) {
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || count === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // No sequence: show every panel, stacked and readable. The wrapper's
      // inline height is one viewport per panel, which would otherwise leave a
      // screen of dead space under the stack.
      wrapper.style.height = "auto";
      panelRefs.current?.forEach((panel) => {
        if (!panel) return;
        panel.style.opacity = "1";
        panel.style.transform = "none";
        panel.style.position = "relative";
      });
      return;
    }

    let frame = 0;

    const draw = () => {
      frame = 0;
      const rect = wrapper.getBoundingClientRect();
      const viewport = window.innerHeight;
      const total = rect.height - viewport;
      if (total <= 0) return;
      // 0 when the wrapper's top hits the viewport top, 1 when its bottom does.
      const progress = Math.min(1, Math.max(0, -rect.top / total));
      const segment = 1 / count;

      panelRefs.current?.forEach((panel, index) => {
        if (!panel) return;
        const local = (progress - index * segment) / segment;
        let opacity = 0;
        if (local >= 0 && local <= 1) {
          if (local < EDGE) opacity = local / EDGE;
          else if (local > 1 - EDGE) opacity = (1 - local) / EDGE;
          else opacity = 1;
        }
        panel.style.opacity = String(opacity);
        panel.style.transform = `translateY(${26 * (1 - opacity)}px) scale(${0.94 + 0.06 * opacity})`;
        panel.style.pointerEvents = opacity > 0.5 ? "auto" : "none";
      });
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [wrapperRef, panelRefs, count]);
}
