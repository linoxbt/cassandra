/**
 * Written by `agent/deploy.mjs` after a deploy verifies both constructors ran.
 *
 * Deliberately a source file rather than a `.env`: an address that only reaches
 * a local env file never reaches a built app, and the failure looks like the
 * contract is empty rather than like a missing variable.
 */
export const CONTRACTS = {
  studionet: {
    market: "0x857F67E8cEb31AAda1f9C35c80362dEC13813dE1",
    positions: "0x8EEc710b185433d08b13Fb491F5A7B406AB7C43f",
  },
  testnetAsimov: {
    market: "",
    positions: "",
  },
} as const;
