import { explorerTx, useNetwork } from "@/lib/network";
import type { ActionState } from "@/hooks/use-action";
import { Notice } from "./ui";

/**
 * What the app says while a write is in flight. Deliberately explicit about the
 * slow part: a resolution runs a model across every validator and a payout only
 * moves at finality, so silence for two minutes is normal and needs saying.
 */
export function TxStatus({
  state,
  error,
  hash,
  note,
}: {
  state: ActionState;
  error: string | null;
  hash: string | null;
  note?: string | null;
}) {
  const network = useNetwork();
  if (state === "idle") return null;

  if (state === "failed") {
    return (
      <div className="mt-4">
        <Notice tone="warn">
          {error ?? "That did not go through."}
          {hash ? <ExplorerLink hash={hash} network={network} /> : null}
        </Notice>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="mt-4">
        <Notice>
          Confirmed and finalized.
          {hash ? <ExplorerLink hash={hash} network={network} /> : null}
        </Notice>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Notice>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-oxblood animate-pulse-dot" />
          {state === "signing" ? "Waiting for your signature…" : "Waiting for finality…"}
        </span>
        <div className="mt-1 text-[0.86rem] text-muted">
          {note ??
            "A signature confirms in seconds. Everything after it waits on the validator round, which can take minutes."}
        </div>
        {hash ? <ExplorerLink hash={hash} network={network} /> : null}
      </Notice>
    </div>
  );
}

function ExplorerLink({ hash, network }: { hash: string; network: ReturnType<typeof useNetwork> }) {
  return (
    <a
      href={explorerTx(hash, network)}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-2 block font-mono text-[0.72rem] text-oxblood underline"
    >
      {hash.slice(0, 18)}… on the explorer
    </a>
  );
}
