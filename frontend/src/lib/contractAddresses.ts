/**
 * Written by `agent/deploy.mjs` after a deploy verifies both constructors ran.
 *
 * Deliberately a source file rather than a `.env`: an address that only reaches
 * a local env file never reaches a built app, and the failure looks like the
 * contract is empty rather than like a missing variable.
 */
export const CONTRACTS = {
  studionet: {
    market: "0x13a8d47946411eCA180A611685713d73a831ac87",
    positions: "0x28C872666ceE36636aebE65c2d62A38D08e34F29",
  },
  testnetAsimov: {
    market: "",
    positions: "",
  },
} as const;
