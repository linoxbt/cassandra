/**
 * Written by `agent/deploy.mjs` after a deploy verifies both constructors ran.
 *
 * Deliberately a source file rather than a `.env`: an address that only reaches
 * a local env file never reaches a built app, and the failure looks like the
 * contract is empty rather than like a missing variable.
 */
export const CONTRACTS = {
  studionet: {
    market: "",
    positions: "",
  },
  testnetAsimov: {
    market: "",
    positions: "",
  },
} as const;
