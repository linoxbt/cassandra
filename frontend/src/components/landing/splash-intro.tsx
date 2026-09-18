import { useEffect, useState } from "react";
import { LogoMark } from "../logo-mark";

/**
 * The mark draws itself once per session, then gets out of the way.
 *
 * Session-gated rather than visit-gated: a first impression is worth two and a
 * half seconds, a fourth one is an obstacle. Skipped outright under reduced
 * motion, and every timer is cleared on unmount so a fast navigation cannot
 * leave the backdrop stranded over the page.
 */
const SESSION_KEY = "cassandra:splash-seen";

export function SplashIntro() {
  const [visible, setVisible] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Blocked storage means it plays again; that is the harmless direction.
    }
    const timers = [
      window.setTimeout(() => setVisible(true), 0),
      window.setTimeout(() => setDrawing(true), 60),
      window.setTimeout(() => setLeaving(true), 2050),
      window.setTimeout(() => setVisible(false), 2750),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-paper transition-opacity duration-700 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center">
        <LogoMark
          variant="draw"
          className={`h-24 w-24 text-oxblood ${drawing ? "draw-on" : ""}`}
        />
        <span
          className="mt-7 font-mono text-[0.68rem] uppercase tracking-[0.42em] text-muted"
          style={{ animation: "cass-rise 700ms cubic-bezier(0.16,1,0.3,1) 1150ms both" }}
        >
          Cassandra
        </span>
      </div>
    </div>
  );
}
