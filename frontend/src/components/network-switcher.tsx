import { NETWORKS, NETWORK_KEYS, setCurrentNetwork, useNetwork } from "@/lib/network";
import { cn } from "./ui";

/** Switching network re-keys every query, so the whole app re-reads from the
 *  chain the user just chose. */
export function NetworkSwitcher({ className }: { className?: string }) {
  const current = useNetwork();
  return (
    <div className={cn("inline-flex rounded-sm border border-line", className)}>
      {NETWORK_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setCurrentNetwork(key)}
          aria-pressed={key === current}
          className={cn(
            "px-2.5 py-1 font-mono text-[0.64rem] uppercase tracking-[0.14em] transition-colors",
            key === current ? "bg-ink text-paper" : "text-muted hover:text-ink",
          )}
        >
          {NETWORKS[key].short}
        </button>
      ))}
    </div>
  );
}
