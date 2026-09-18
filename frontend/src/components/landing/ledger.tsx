import { AnimatedCounter } from "./animated-counter";
import { Label } from "../ui";
import { useReveal } from "@/hooks/use-reveal";
import { useStats } from "@/lib/queries";
import { gen } from "@/lib/format";
import { isDeployed } from "@/lib/network";

/** The masthead figures, read live from the contract. Lazily loaded by the
 *  landing page: this module is what pulls in the chain client. */
export function Ledger() {
  const { data: stats } = useStats();
  const reveal = useReveal();
  const deployed = isDeployed();

  const figures = [
    { label: "Markets opened", value: Number(stats?.markets ?? 0), format: (n: number) => Math.round(n).toString() },
    { label: "By the agent", value: Number(stats?.agent_opened ?? 0), format: (n: number) => Math.round(n).toString() },
    { label: "Settled", value: Number(stats?.settled ?? 0), format: (n: number) => Math.round(n).toString() },
    { label: "GEN staked", value: Number(gen(stats?.volume ?? "0", 2)), format: (n: number) => n.toFixed(2) },
  ];

  return (
    <section ref={reveal.ref} className={`border-b border-line ${reveal.className}`}>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-4">
          {figures.map((figure) => (
            <div key={figure.label} className="border-t border-ink pt-3">
              <Label>{figure.label}</Label>
              <div className="mt-1.5 font-display text-display-sm leading-none text-ink tabular-nums">
                {deployed ? <AnimatedCounter value={figure.value} format={figure.format} /> : "—"}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
          {deployed
            ? "Read live from the contract on every page load"
            : "Awaiting deployment — these figures come straight from the contract"}
        </p>
      </div>
    </section>
  );
}
