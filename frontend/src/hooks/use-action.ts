import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/wallet";
import { describeError } from "@/lib/tx";
import type { WriteContext } from "@/lib/contract";
import type { TxOutcome } from "@/lib/tx";

export type ActionState = "idle" | "signing" | "waiting" | "done" | "failed";

/**
 * One write, as a small state machine.
 *
 * `waiting` is the honest long part: a resolution runs an LLM round across every
 * validator, and a payout only executes at finality. The note is shown to the
 * user so a two-minute wait reads as expected rather than broken.
 */
export function useAction() {
  const { address, provider } = useWallet();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ActionState>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  async function run(
    action: (ctx: WriteContext) => Promise<{ hash: string; outcome: TxOutcome }>,
    options: { note?: string } = {},
  ) {
    if (!address || !provider) {
      setError("Connect a wallet first.");
      setState("failed");
      return null;
    }
    setError(null);
    setHash(null);
    setNote(options.note ?? null);
    setState("signing");
    try {
      // `signing` has to survive until the wallet actually hands something back,
      // otherwise the UI reads "waiting" while the signature prompt is still up
      // and the label describes the wrong thing entirely.
      const { hash: txHash, outcome } = await action({
        account: address,
        provider,
        onSubmitted: () => setState("waiting"),
      });
      setHash(txHash);
      if (outcome.state === "confirmed") {
        setState("done");
        // Only what a write can have changed. Invalidating everything sends a
        // burst of reads at an RPC whose daily budget this app already lives
        // inside, and the marketing figures do not need to be re-read.
        await Promise.all(
          ["markets", "market", "verdict", "dispute", "jury", "position", "portfolio", "stats", "solvency"].map(
            (key) => queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
        return outcome;
      }
      setState("failed");
      setError(
        outcome.state === "reverted"
          ? outcome.message
          : outcome.state === "no_verdict"
            ? `The validators did not reach a verdict (${outcome.status}). Nothing was changed; you can try again.`
            : `Still undecided after ten minutes (${outcome.status}). It may yet finalize — check the explorer.`,
      );
      return outcome;
    } catch (caught) {
      setState("failed");
      setError(describeError(caught));
      return null;
    }
  }

  function reset() {
    setState("idle");
    setError(null);
    setHash(null);
    setNote(null);
  }

  return { state, error, hash, note, run, reset, connected: Boolean(address && provider) };
}
