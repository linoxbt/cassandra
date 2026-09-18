const GEN = 10n ** 18n;

export function gen(atto: string | bigint | number | undefined, places = 3): string {
  if (atto === undefined || atto === null || atto === "") return "0";
  const value = typeof atto === "bigint" ? atto : BigInt(String(atto).split(".")[0] || 0);
  const whole = value / GEN;
  const fraction = ((value % GEN) * 10n ** BigInt(places)) / GEN;
  const padded = fraction.toString().padStart(places, "0").replace(/0+$/, "");
  return padded ? `${whole}.${padded}` : whole.toString();
}

export function genLabel(atto: string | bigint | undefined, places = 3): string {
  return `${gen(atto, places)} GEN`;
}

export function toAtto(input: string): bigint {
  const [whole = "0", fraction = ""] = input.trim().split(".");
  const padded = (fraction + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || 0) * GEN + BigInt(padded || 0);
}

export function shortAddress(address: string | undefined): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Odds implied by the pools: the share of the total that each side holds. A
 *  pool-share market has no order book, so this is the only price there is. */
export function impliedOdds(yesPool: string, noPool: string): { yes: number; no: number } {
  const yes = Number(BigInt(yesPool || "0") / 10n ** 12n);
  const no = Number(BigInt(noPool || "0") / 10n ** 12n);
  const total = yes + no;
  if (total <= 0) return { yes: 0.5, no: 0.5 };
  return { yes: yes / total, no: no / total };
}

export function pct(value: number, places = 0): string {
  return `${(value * 100).toFixed(places)}%`;
}

export function timeUntil(unixSeconds: string | number): string {
  const target = Number(unixSeconds) * 1000;
  const delta = target - Date.now();
  const past = delta < 0;
  const abs = Math.abs(delta);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const body =
    minutes < 60 ? `${minutes}m` : hours < 48 ? `${hours}h` : `${days}d`;
  return past ? `${body} ago` : `in ${body}`;
}

export function stamp(unixSeconds: string | number): string {
  return new Date(Number(unixSeconds) * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
