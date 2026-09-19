# Deployments

The current addresses live in `agent/state/deployment.<network>.json` and are
written into `frontend/src/lib/contractAddresses.ts` by `agent/deploy.mjs`. This
file is the trail of what came before, so nobody points a tool at a contract that
has been superseded.

A GenLayer contract cannot be upgraded in place, so a fix means a new address and
the old state stays where it is. Nothing is migrated: markets on a superseded
contract keep their escrow and can still be settled and claimed by calling that
address directly.

## Studio Network (chain 61999)

| Deployed | Market | Positions | Why superseded |
|---|---|---|---|
| 2026-09-19 06:02 | `0x13a8d47946411eCA180A611685713d73a831ac87` | `0x28C872666ceE36636aebE65c2d62A38D08e34F29` | Security fix: creator-controlled `criteria` could forge a prompt section. Carried market #1, fully settled and claimed. |
| 2026-09-19 06:00 | `0xaB84623BC2A6Cc711771E8e80713D9b3158aF932` | — | Abandoned part-way when the RPC write quota ran out mid-deploy; never wired to a positions ledger, never used. |

Current, as of 2026-09-19 07:30:

| Market | Positions |
|---|---|
| `0x857F67E8cEb31AAda1f9C35c80362dEC13813dE1` | `0x8EEc710b185433d08b13Fb491F5A7B406AB7C43f` |

## Testnet Asimov (chain 4221)

Not deployed. Asimov is not gasless, so it needs a faucet claim for the deployer
before `GL_CHAIN=testnetAsimov npm run deploy` will work.
