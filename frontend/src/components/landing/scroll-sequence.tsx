import { useRef } from "react";
import { useScrollSequence } from "@/hooks/use-scroll-sequence";

export interface SequencePanel {
  step: string;
  title: string;
  body: string;
}

/**
 * A set of panels advanced by scroll: the wrapper supplies one viewport of
 * distance per panel and a sticky child pins one viewport of it. Under reduced
 * motion the hook drops the pinning entirely and the panels simply stack, which
 * is why the markup has to read correctly in document order.
 */
export function ScrollSequence({ panels, id }: { panels: SequencePanel[]; id?: string }) {
  const wrapper = useRef<HTMLDivElement | null>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  useScrollSequence(wrapper, panelRefs, panels.length);

  return (
    <section id={id} ref={wrapper} style={{ height: `${panels.length * 100}vh` }} className="relative">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden motion-reduce:static motion-reduce:h-auto motion-reduce:py-16">
        <div className="mx-auto w-full max-w-3xl px-4 motion-reduce:space-y-16">
          {panels.map((panel, index) => (
            <div
              key={panel.step}
              ref={(node) => {
                panelRefs.current[index] = node;
              }}
              className="absolute inset-x-0 px-4 motion-reduce:static motion-reduce:px-0"
            >
              <span className="font-mono text-[0.72rem] uppercase tracking-[0.3em] text-oxblood">{panel.step}</span>
              <h3 className="mt-5 font-display text-display-md text-ink md:text-display-lg">{panel.title}</h3>
              <p className="mt-5 max-w-xl text-[1.02rem] leading-relaxed text-ink-soft">{panel.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
