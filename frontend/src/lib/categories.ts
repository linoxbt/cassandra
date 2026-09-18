import type { Category } from "./contract";

/**
 * The five evidence sources, as the app describes them. Each entry names the
 * feed the CONTRACT will fetch at resolution - not a feed the UI picked - so the
 * label and the settlement are always talking about the same thing.
 */
export const CATEGORIES: Record<Category, { label: string; source: string; blurb: string; accent: string }> = {
  crypto: {
    label: "Crypto",
    source: "CoinGecko",
    blurb: "A spot price, read at settlement and compared against a threshold fixed when the market opened.",
    accent: "#b08544",
  },
  weather: {
    label: "Weather",
    source: "Open-Meteo",
    blurb: "A daily maximum or a rainfall total for one place and one date. Numeric, and it settles within hours.",
    accent: "#2f6b3f",
  },
  news: {
    label: "World news",
    source: "GDELT",
    blurb: "Whether the world's news feed is still carrying a story. The one category where judgment genuinely earns its place.",
    accent: "#6b1f24",
  },
  pageviews: {
    label: "Attention",
    source: "Wikimedia",
    blurb: "Daily readership of an article. Attention is measurable days before anyone agrees on what a story means.",
    accent: "#4a403a",
  },
  sports: {
    label: "Sport",
    source: "TheSportsDB",
    blurb: "A fixture and a final score. Unambiguous, on a schedule nobody controls.",
    accent: "#8a6d2f",
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function categoryOf(value: string) {
  return CATEGORIES[value as Category] ?? CATEGORIES.crypto;
}
