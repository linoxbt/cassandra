import { useWallet } from "@/lib/wallet";
import { shortAddress } from "@/lib/format";
import { Button } from "./ui";

export function WalletButton() {
  const { address, connect, manage, available } = useWallet();

  if (!available) {
    return (
      <span
        className="font-mono text-[0.64rem] uppercase tracking-[0.14em] text-muted"
        title="Set VITE_REOWN_PROJECT_ID to enable wallet connection. Reading works without it."
      >
        read-only
      </span>
    );
  }

  if (address) {
    return (
      <Button tone="ghost" onClick={() => manage()} className="font-mono normal-case tracking-normal">
        {shortAddress(address)}
      </Button>
    );
  }

  return (
    <Button tone="primary" onClick={() => connect()}>
      Connect
    </Button>
  );
}
