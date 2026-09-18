import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, rank } from "../predictor.mjs";

const candidate = (category, n) => ({ category, source_query: `${category}-${n}`, question: `${category} ${n}` });

test("a batch is drawn across categories, not from whichever one sorts first", () => {
  // CoinGecko alone offers four coins, so a ranking that does not interleave
  // fills the whole board with crypto.
  const candidates = [
    candidate("crypto", 1), candidate("crypto", 2), candidate("crypto", 3), candidate("crypto", 4),
    candidate("weather", 1), candidate("weather", 2),
    candidate("sports", 1),
  ];
  const top = rank(candidates).slice(0, 3).map((c) => c.category);
  assert.equal(new Set(top).size, 3, `expected three categories, got ${top.join(", ")}`);
});

test("every candidate survives the ranking", () => {
  const candidates = [candidate("crypto", 1), candidate("weather", 1), candidate("weather", 2)];
  assert.equal(rank(candidates).length, 3);
});

test("categories already on the board are drawn last", () => {
  const candidates = [candidate("crypto", 1), candidate("weather", 1)];
  const ranked = rank(candidates, ["crypto", "crypto"]);
  assert.equal(ranked[0].category, "weather");
});

test("an empty batch ranks to nothing rather than looping", () => {
  assert.deepEqual(rank([]), []);
});

test("flags are parsed into the shape openMarkets expects", () => {
  const args = parseArgs(["--dry", "--limit", "3", "--categories", "crypto,weather"]);
  assert.equal(args.dry, true);
  assert.equal(args.limit, 3);
  assert.deepEqual(args.categories, ["crypto", "weather"]);
});
