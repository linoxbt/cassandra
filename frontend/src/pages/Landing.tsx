import { Link } from "react-router-dom";
import { LogoMark } from "@/components/logo-mark";
import { ButtonLink, Label } from "@/components/ui";
import { SplashIntro } from "@/components/landing/splash-intro";
import { SourceMarquee } from "@/components/landing/marquee";
import { ScrollSequence } from "@/components/landing/scroll-sequence";
import { OddsCurve } from "@/components/landing/odds-curve";
import { VerdictSeal } from "@/components/landing/verdict-seal";
import { EscrowFlow } from "@/components/landing/escrow-flow";
import { useReveal } from "@/hooks/use-reveal";

// The only part of the landing page that reads the chain. Split out so the hero
// paints without waiting for the RPC client and everything underneath it.
const Ledger = lazy(() => import("@/components/landing/ledger").then((m) => ({ default: m.Ledger })));
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/categories";
import { Suspense, lazy, useEffect, useState } from "react";

const LIFECYCLE = [
  {
    step: "01 — Proposed",
    title: "An agent finds a question worth asking.",
    body:
      "It reads the live feeds, places a threshold about one day's move away from where things stand, and writes the resolution criteria before anyone can take a side. The evidence source is fixed at that moment, in the market itself.",
  },
  {
    step: "02 — Taken",
    title: "Money goes in, and a token comes out.",
    body:
      "Every stake mints position tokens one-for-one with the wei behind it, in a contract of their own. They are yours to sell while the market is still trading — and whoever holds them at the end is who gets paid.",
  },
  {
    step: "03 — Read",
    title: "The contract fetches its own evidence.",
    body:
      "When trading closes, anyone can call resolve. The contract goes and reads the feed named when the market opened, and asks what it says. There is no oracle account and no resolver key, because there is nobody to trust.",
  },
  {
    step: "04 — Agreed",
    title: "Every validator reads it independently.",
    body:
      "They each repeat the fetch and the reading, and compare two things: the outcome, and how sure they were, rounded to a decile. The prose is never compared, because two honest readings never write the same sentence.",
  },
  {
    step: "05 — Paid",
    title: "The escrow settles against the verdict.",
    body:
      "Winners claim a pro-rata share of the whole pool. A losing challenge forfeits its bond to the jury. And if the evidence simply did not answer the question, the market voids and everyone is refunded — an honest nothing, rather than a coin flip.",
  },
];

export function Landing() {
  return (
    <>
      <SplashIntro />
      <Hero />
      <SourceMarquee />
      <Suspense fallback={<div className="h-[196px] border-b border-line" />}>
        <Ledger />
      </Suspense>
      <ScrollSequence id="how" panels={LIFECYCLE} />
      <Verdict />
      <Jury />
      <Sources />
      <Closing />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* The mark, oversized and turning slowly behind the type. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden items-center justify-end overflow-hidden md:flex">
        <LogoMark className="mr-[-6%] h-[115%] w-auto text-oxblood/[0.04] animate-slow-spin" />
      </div>

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 md:grid-cols-[1.15fr_0.85fr] md:py-28">
        <div>
          <span
            className="inline-flex items-center gap-2 rounded-sm border border-line px-2.5 py-1 font-mono text-[0.64rem] uppercase tracking-[0.2em] text-muted"
            style={{ animation: "cass-rise 600ms cubic-bezier(0.16,1,0.3,1) both" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-oxblood animate-pulse-dot" />
            Live on GenLayer
          </span>

          <h1
            className="mt-7 font-display text-display-lg text-ink md:text-display-xl"
            style={{ animation: "cass-reveal 1000ms cubic-bezier(0.16,1,0.3,1) 120ms both" }}
          >
            Prophecy,
            <br />
            <span className="text-oxblood">made binding.</span>
          </h1>

          <p
            className="mt-8 max-w-xl text-[1.06rem] leading-relaxed text-ink-soft"
            style={{ animation: "cass-reveal 1000ms cubic-bezier(0.16,1,0.3,1) 280ms both" }}
          >
            Cassandra was cursed to speak the truth and be disbelieved. Here belief is not optional:
            markets are opened by an autonomous agent, and settled by the contract that holds the
            money — which fetches the evidence itself and is only believed once every validator has
            read it and agreed.
          </p>

          <div
            className="mt-10 flex flex-wrap items-center gap-3"
            style={{ animation: "cass-rise 700ms cubic-bezier(0.16,1,0.3,1) 440ms both" }}
          >
            <ButtonLink to="/markets" tone="primary">
              See the board
            </ButtonLink>
            <ButtonLink to="/docs/how-it-settles" tone="ghost">
              How it settles
            </ButtonLink>
          </div>

          <p className="mt-6 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
            No oracle · no resolver key · no backend
          </p>
        </div>

        <div className="flex flex-col justify-center" style={{ animation: "cass-reveal 1100ms cubic-bezier(0.16,1,0.3,1) 380ms both" }}>
          <div className="rounded-sm border border-line bg-surface p-6">
            <div className="flex items-baseline justify-between">
              <Label>Market 0041</Label>
              <Label>crypto · CoinGecko</Label>
            </div>
            {/* Phrased the way the contract actually settles: a recorded daily
                price for a named date, never a spot price read at settlement. */}
            <p className="mt-3 font-display text-lg leading-snug text-ink">
              Will Bitcoin's daily price on 19-09-2026 be above $85,900?
            </p>
            <OddsCurve yes={0.57} animate className="mt-5" />
          </div>
          <p className="mt-4 text-center text-[0.78rem] text-muted">
            The curve is the market's only price: the share of the pool on each side.
          </p>
        </div>
      </div>
    </section>
  );
}

function Verdict() {
  const reveal = useReveal();
  const [index, setIndex] = useState(0);
  const cycle = ["YES", "NO", "UNRESOLVED"] as const;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((n) => (n + 1) % cycle.length), 3400);
    return () => window.clearInterval(timer);
  }, []);

  const outcome = cycle[index];

  return (
    <section ref={reveal.ref} className={`border-y border-line bg-paper-2 ${reveal.className}`}>
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 md:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col items-center">
          <VerdictSeal outcome={outcome} band="90-100%" replayKey={index} size={190} />
          <span className="mt-6 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted">
            Verdict · market 0041
          </span>
        </div>
        <div>
          <Label>The moment it settles</Label>
          <h2 className="mt-4 font-display text-display-md text-ink">
            A verdict is three small facts, agreed by everyone.
          </h2>
          <p className="mt-5 text-[1rem] leading-relaxed text-ink-soft">
            The outcome, the confidence rounded to a decile, and the evidence it was read from.
            Validators compare the first two exactly. They never compare the reasoning, because two
            honest readings of the same page never produce the same sentence — and a system that
            demanded they did would reject every true verdict it ever saw.
          </p>
          <p className="mt-4 text-[1rem] leading-relaxed text-ink-soft">
            <strong className="font-medium text-ink">Unresolved is a real answer.</strong> If the
            evidence does not settle the question, the market voids and every position is refunded.
            A market that cannot be settled honestly is unwound, not guessed at.
          </p>
          <div className="mt-8 max-w-sm">
            <EscrowFlow state="paid" amount="4.312 GEN" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Jury() {
  const reveal = useReveal();
  return (
    <section id="jury" ref={reveal.ref} className={`mx-auto max-w-6xl px-4 py-20 ${reveal.className}`}>
      <div className="grid gap-12 md:grid-cols-[1fr_1fr]">
        <div>
          <Label>Skin in the game</Label>
          <h2 className="mt-4 font-display text-display-md text-ink">A jury that can be wrong, expensively.</h2>
          <p className="mt-5 text-[1rem] leading-relaxed text-ink-soft dropcap">
            Anyone can post a bond on a market and say, in advance, how they think it reads. When the
            verdict lands, the ones who called it wrong are slashed and the ones who called it right
            split what was slashed between them. A losing challenge forfeits its bond into the same
            pot.
          </p>
          <p className="mt-4 text-[1rem] leading-relaxed text-ink-soft">
            Jurors are paid out of bonds and nothing else — never out of the market pool. However
            badly a jury behaves, it cannot reach the money the people who bet put in.
          </p>
        </div>
        <div className="rounded-sm border-l-2 border-l-gold bg-gold/8 p-6">
          <h3 className="font-display text-xl text-ink">What this is not</h3>
          <p className="mt-3 text-[0.94rem] leading-relaxed text-ink-soft">
            This is an application-level bond pool. It is not GenLayer's protocol staking: nothing in
            these contracts stakes, slashes or selects a network validator, because no contract-level
            API for that exists. The real validator economics happen a layer below, in the consensus
            that produced the verdict in the first place.
          </p>
          <Link
            to="/docs/the-jury"
            className="mt-5 inline-block font-mono text-[0.7rem] uppercase tracking-[0.16em] text-oxblood hover:underline"
          >
            Read the details →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Sources() {
  const reveal = useReveal();
  return (
    <section ref={reveal.ref} className={`border-t border-line bg-surface ${reveal.className}`}>
      <div className="mx-auto max-w-6xl px-4 py-20">
        <Label>Where the answers come from</Label>
        <h2 className="mt-4 max-w-2xl font-display text-display-md text-ink">
          Five feeds, chosen before anyone took a side.
        </h2>
        <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-ink-soft">
          A market names its source when it opens, and the contract derives the URL from that name at
          settlement. Nobody — not the agent, not the contract owner, not the person who opened it —
          can point the contract somewhere else after seeing which way the money went.
        </p>
        <div className="mt-12 grid gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
          {CATEGORY_KEYS.map((key, index) => {
            const entry = CATEGORIES[key];
            return (
              <article
                key={key}
                className="group relative bg-surface p-7 transition-colors hover:bg-paper-2"
                style={{ animation: `cass-rise 600ms cubic-bezier(0.16,1,0.3,1) ${index * 70}ms both` }}
              >
                <span
                  aria-hidden
                  className="absolute right-6 top-6 h-8 w-8 rounded-full opacity-[0.18] transition-opacity group-hover:opacity-35"
                  style={{ background: `radial-gradient(circle, ${entry.accent}, transparent 70%)` }}
                />
                <Label>{entry.source}</Label>
                <h3 className="mt-3 font-display text-xl text-ink">{entry.label}</h3>
                <p className="mt-2.5 text-[0.9rem] leading-relaxed text-muted">{entry.blurb}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  const reveal = useReveal();
  return (
    <section ref={reveal.ref} className={`mx-auto max-w-6xl px-4 py-24 text-center ${reveal.className}`}>
      <LogoMark className="mx-auto h-14 w-14 text-oxblood" />
      <h2 className="mx-auto mt-8 max-w-2xl font-display text-display-md text-ink">
        Take a side, or tell the market it's wrong.
      </h2>
      <p className="mx-auto mt-5 max-w-xl text-[1rem] leading-relaxed text-ink-soft">
        Every market on the board was opened by the agent, and every one of them will be settled by
        the contract itself. You can back a side, sell your position before it closes, bond a reading
        as a juror, or challenge a verdict you think is wrong.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/markets" tone="primary">Open the app</ButtonLink>
        <ButtonLink to="/docs" tone="ghost">Read the docs</ButtonLink>
      </div>
    </section>
  );
}
