// Offline checks on the source layer's contract with the rest of the agent.
// The live feeds are exercised by `npm run propose -- --dry`, not by CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, evidenceUrl, validQuery } from "../sources.mjs";

test("every category the agent knows builds a URL", () => {
  const queries = {
    crypto: "bitcoin",
    weather: "latitude=51.51&longitude=-0.13&daily=temperature_2m_max",
    news: "ceasefire",
    sports: "2026-09-19",
    pageviews: "Bitcoin,20260910,20260916",
  };
  for (const category of CATEGORIES) {
    const url = evidenceUrl(category, queries[category]);
    assert.match(url, /^https:\/\//, category);
    assert.doesNotThrow(() => new URL(url), category);
  }
});

test("the agent's URLs match the hosts the contract pins", () => {
  assert.match(evidenceUrl("crypto", "bitcoin"), /^https:\/\/api\.coingecko\.com\//);
  assert.match(evidenceUrl("weather", "latitude=1&longitude=2"), /^https:\/\/api\.open-meteo\.com\//);
  assert.match(evidenceUrl("news", "ceasefire"), /^https:\/\/api\.gdeltproject\.org\//);
  assert.match(evidenceUrl("sports", "2026-09-19"), /^https:\/\/www\.thesportsdb\.com\//);
  assert.match(evidenceUrl("pageviews", "Bitcoin,20260910,20260916"), /^https:\/\/wikimedia\.org\//);
});

test("query validation mirrors the contract's, so the agent cannot propose a market it would refuse", () => {
  // The contract restricts source_query to a character set with no slashes,
  // colons or percent signs, so a query can never leave the host its category
  // pins. If these two ever drift, the agent starts paying gas to be rejected.
  assert.equal(validQuery("bitcoin"), true);
  assert.equal(validQuery("Bitcoin,20260910,20260916"), true);
  assert.equal(validQuery("latitude=51.51&longitude=-0.13&daily=temperature_2m_max"), true);
  assert.equal(validQuery("central+bank+rate"), true);

  assert.equal(validQuery("https://evil.example/feed"), false, "a scheme");
  assert.equal(validQuery("bitcoin/../../evil"), false, "a path escape");
  assert.equal(validQuery("bitcoin%26ids=evil"), false, "an encoded separator");
  assert.equal(validQuery("bitcoin#fragment"), false, "a fragment");
  assert.equal(validQuery(""), false, "empty");
  assert.equal(validQuery("x".repeat(201)), false, "over the length cap");
});

test("an unknown category is refused rather than guessed", () => {
  assert.throws(() => evidenceUrl("vibes", "anything"), /unknown category/);
});
