import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Label, Notice } from "@/components/ui";
import { TxStatus } from "@/components/tx-status";
import { useAction } from "@/hooks/use-action";
import { openMarket } from "@/lib/contract";
import type { Category } from "@/lib/contract";
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/categories";
import { toAtto } from "@/lib/format";
import { isDeployed } from "@/lib/network";
import { NotDeployed } from "./Markets";
import { cn } from "@/components/ui";

/** Mirrors the contract's own validation, so a market the contract would refuse
 *  cannot be submitted from here in the first place. */
const QUERY_OK = /^[A-Za-z0-9_\-.,=&+ ]+$/;

const PLACEHOLDER: Record<Category, { query: string; hint: string }> = {
  crypto: { query: "bitcoin,19-09-2026", hint: "A CoinGecko coin id and a settlement date, DD-MM-YYYY." },
  weather: {
    query: "latitude=51.51&longitude=-0.13&daily=temperature_2m_max&start_date=2026-09-20&end_date=2026-09-20",
    hint: "An Open-Meteo query string. No slashes.",
  },
  news: { query: "ceasefire", hint: "A GDELT search term. Use + between words." },
  pageviews: { query: "Bitcoin,20260920,20260921", hint: "Article,YYYYMMDD,YYYYMMDD." },
  sports: { query: "2026-09-20", hint: "A fixture date, YYYY-MM-DD." },
};

export function CreateMarket() {
  const action = useAction();
  const [category, setCategory] = useState<Category>("crypto");
  const [question, setQuestion] = useState("");
  const [query, setQuery] = useState(PLACEHOLDER.crypto.query);
  const [criteria, setCriteria] = useState("");
  const [hours, setHours] = useState("6");
  const [seed, setSeed] = useState("0.02");

  const seedAtto = useMemo(() => {
    try {
      return toAtto(seed);
    } catch {
      return 0n;
    }
  }, [seed]);

  const problems = useMemo(() => {
    const list: string[] = [];
    if (question.trim().length < 12) list.push("The question needs to be a real question.");
    if (question.length > 300) list.push("The question is over 300 characters.");
    if (criteria.trim().length < 20) list.push("Say exactly what makes this resolve YES.");
    if (criteria.length > 700) list.push("The criteria are over 700 characters.");
    if (!QUERY_OK.test(query)) list.push("The source query may only contain letters, digits and _-.,=&+");
    // Everything past the character set is the contract's own check; it reverts
    // with a readable message, which the app surfaces rather than re-implements.
    if (seedAtto <= 0n) list.push("The seed must be more than nothing.");
    if (seedAtto % 2n !== 0n) list.push("The seed must be an even number of wei so both sides start level.");
    if (Number(hours) < 0.1) list.push("The market must stay open at least a few minutes.");
    return list;
  }, [question, criteria, query, seedAtto, hours]);

  if (!isDeployed()) return <NotDeployed />;

  const closesAt = Math.floor(Date.now() / 1000) + Math.round(Number(hours || 0) * 3600);

  return (
    <>
      <header className="border-b-2 border-ink pb-5">
        <Label>Ask something</Label>
        <h1 className="mt-2 font-display text-display-sm text-ink">Open a market</h1>
      </header>

      <div className="mt-6 max-w-3xl">
        <Notice>
          Whatever you write here is what the contract will be held to. The evidence source is fixed
          the moment this market opens — you will not be able to point it somewhere else once you see
          which way the money went. Your seed is split evenly across both sides and comes back to you
          as a real position you can claim like anyone else.
        </Notice>
      </div>

      <div className="mt-8 grid max-w-3xl gap-6">
        <Card className="p-6">
          <Label>Evidence source</Label>
          <div className="mt-3 flex flex-wrap gap-1">
            {CATEGORY_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setCategory(key);
                  setQuery(PLACEHOLDER[key].query);
                }}
                className={cn(
                  "rounded-sm border px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] transition-colors",
                  category === key ? "border-ink bg-ink text-paper" : "border-line text-muted hover:text-ink",
                )}
              >
                {CATEGORIES[key].label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[0.86rem] text-muted">{CATEGORIES[category].blurb}</p>
          <label className="mt-4 block">
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">
              Source query — {PLACEHOLDER[category].hint}
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[0.8rem] text-ink outline-none focus:border-line-strong"
            />
          </label>
        </Card>

        <Card className="p-6">
          <label className="block">
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">The question</span>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Will Bitcoin's daily price on 19-09-2026 be above $90,000?"
              className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-2 text-[0.95rem] text-ink outline-none focus:border-line-strong"
            />
          </label>
          <label className="mt-4 block">
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">
              Resolution criteria — what makes this YES, what makes it NO
            </span>
            <textarea
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              rows={4}
              placeholder="Resolves YES if CoinGecko's recorded daily price for bitcoin on 19-09-2026 is strictly above 90000. Resolves NO otherwise. UNRESOLVED if the feed carries no price for that date."
              className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-2 text-[0.9rem] leading-relaxed text-ink outline-none focus:border-line-strong"
            />
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">Open for (hours)</span>
              <input
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[0.9rem] text-ink outline-none focus:border-line-strong"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">Seed (GEN)</span>
              <input
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[0.9rem] text-ink outline-none focus:border-line-strong"
              />
            </label>
          </div>
        </Card>

        {problems.length > 0 && (question || criteria) ? (
          <ul className="flex flex-col gap-1.5">
            {problems.map((problem) => (
              <li key={problem} className="text-[0.85rem] text-no">
                {problem}
              </li>
            ))}
          </ul>
        ) : null}

        <div>
          <Button
            tone="primary"
            disabled={!action.connected || problems.length > 0 || action.state === "waiting"}
            onClick={() =>
              action.run(
                (ctx) =>
                  openMarket(
                    ctx,
                    {
                      question: question.trim(),
                      category,
                      source_query: query.trim(),
                      criteria: criteria.trim(),
                      closes_at: closesAt,
                      rationale: "Opened from the app.",
                    },
                    seedAtto,
                  ),
                { note: "Seeding both sides and minting you the matching positions." },
              )
            }
          >
            Open the market
          </Button>
          {!action.connected ? (
            <p className="mt-2 text-[0.84rem] text-muted">Connect a wallet to open a market.</p>
          ) : null}
          <TxStatus state={action.state} error={action.error} hash={action.hash} note={action.note} />
        </div>

        <p className="text-[0.85rem] leading-relaxed text-muted">
          Not sure what makes a good question?{" "}
          <Link to="/docs/evidence" className="text-oxblood underline">How the evidence sources work</Link>.
        </p>
      </div>
    </>
  );
}
