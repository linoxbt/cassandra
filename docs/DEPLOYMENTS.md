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

## Studio Next (chain 61997) — not deployed, and not currently possible

Studio Next is GenLayer's newer testnet, reachable at
`https://studio-next.genlayer.com/api` and also as `studio-dev.genlayer.com`
(one network, two hostnames). It runs Consensus v0.6. `agent/lib.mjs` carries the
chain definition and `fund.mjs` works against it, but the contracts cannot be
deployed there yet, for a reason that is not about this codebase.

Three things had to be true, and the third is not:

1. **An SDK that knows the chain.** `genlayer-js@1.1.8` does not; the unreleased
   `2.0.0-rc.1` does, as `studioDevnet`. Note that the RC **cannot read the
   contracts deployed on Studio (61999)** — `gen_call: execution failed` — so the
   two networks need different SDK versions. This is a fork, not an upgrade.
2. **Fees on every transaction.** v0.6 rejects a transaction with no fee
   (`FeeValueMustBeNonZero`). The fix is to pass the result of
   `estimateTransactionFees()` — distribution, message allocations *and* the
   separate `feeValue` — on every write. Verified working.
3. **A runner the network accepts *and* the test toolchain has.** This is the
   blocker:

   | Runner | In the local toolchain? | Accepted by Studio Next? |
   |---|---|---|
   | `1jb45aa8…` (what we pin, in the GenVM rc7 bundle) | yes | **rejected** — "runner malformed" |
   | `1zr6nqk5…` (newer, also in the rc7 bundle) | yes | **rejected** — "runner malformed" |
   | `5jycge4q…` (v0.3.0-rc9) | **no** | accepted |

   The only runner Studio Next accepts comes from a GenVM rc9 that was never
   published as a release, so `gltest` cannot download it and `genvm-lint`
   cannot check against it. `genlayer-test` 0.29.2 and `genvm-linter` 0.11.0 are
   the newest on PyPI and both target the v0.2 API.

Porting is otherwise tractable — roughly 25 mechanical edits for the renamed
v0.3 API (`gl.contract.Contract`, `gl.storage.allow`, `gl.chain.Event`,
`gl.contract.get_at`, `run_nondet`, `gl.chain.Account` in place of the EVM shim).
What is missing is any way to test the result: 120 tests would stop running, on
contracts that hold other people's money. Revisit when GenVM publishes a release
containing the v0.3 runner and the test tooling targets it.

## Testnet Asimov (chain 4221)

Not deployed. Asimov is not gasless, so it needs a faucet claim for the deployer
before `GL_CHAIN=testnetAsimov npm run deploy` will work.
