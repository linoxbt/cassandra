# Architecture

Cassandra is two GenLayer Intelligent Contracts, an off-chain agent that can only
propose, and a frontend that talks to the chain directly. There is no backend, no
database, no oracle account and no resolver key.

```
                    proposes markets                  ┌──────────────────┐
  ┌───────────┐      (and nothing else)               │  evidence feeds  │
  │  agent/   │ ──────────────────────────┐           │  CoinGecko       │
  │ Node, off │                           │           │  Open-Meteo      │
  │  chain    │                           ▼           │  GDELT           │
  └───────────┘                  ┌─────────────────┐  │  TheSportsDB     │
                                 │  cassandra.py   │  │  Wikimedia       │
  ┌───────────┐   bet / claim    │  escrow         │──┴──────────────────┘
  │ frontend/ │ ────────────────▶│  verdict        │   fetched inside consensus,
  │ genlayer- │                  │  dispute        │   by the leader and again by
  │    js     │◀──── views ──────│  jury           │   every validator
  └───────────┘                  └────────┬────────┘
                                          │ mint / burn (idempotent, on="accepted")
                                          │ balance_of (synchronous read)
                                          ▼
                                 ┌─────────────────┐
                                 │  positions.py   │  ERC-1155-shaped ledger.
                                 │  balances       │  Authoritative for who holds
                                 │  transfer       │  what; frozen once trading
                                 └─────────────────┘  stops.
```

## Why two contracts

The position token is the point of the design: settlement reads the ledger, so a
position that changed hands pays whoever holds it at the end. That only works if
one contract is authoritative about balances, which means the escrow has to ask
it rather than keep a second copy.

Keeping a second stake ledger in the market contract would be the easy version,
and it is exactly the bug class worth avoiding — two ledgers that are supposed to
agree eventually do not. So there is only one. `bets` in `cassandra.py` is a
replay journal for the mint message, never read at settlement.

## The rules that carry the safety argument

**0. Every fetch identifies itself.** Wikimedia answers 403 to a request that
does not name its caller, and it is not the only host that does. The User-Agent
goes on every evidence request, including a challenger's citation — which is an
arbitrary https URL the contract has no category for. Evidence that fails to load
for a reason unrelated to the claim is the worst kind of failure here, because it
decides a dispute on a technicality.

**1. The evidence URL is derived, never supplied.** `_evidence_url(category,
source_query)` builds the URL from fields fixed when the market opened. Nobody
can point the contract at a source of their choosing after seeing which way the
money went. `source_query` is restricted to a character set with no slashes,
colons or percent signs, so it cannot walk out of the host its category pins; the
one endpoint assembled from parts (`pageviews`) validates each part separately.

**2. Only the decision is compared.** The leader fetches and reads; every
validator repeats both and must land on the same `outcome` and the same
confidence *decile*. Free text is never compared, because two honest readings
never produce the same prose, and raw bytes are never compared either — a live
price feed returns different bytes to every caller a second apart. Confidence is
quantised before it is compared **and** before it is stored: comparing a raw
percentage fails good verdicts, and comparing nothing lets the leader set it
alone.

**3. Transfers stop when trading stops.** `positions.transfer` reads the market's
status synchronously on every call and refuses once the market has left OPEN.
Cross-contract reads are synchronous and therefore cannot arrive late; a pushed
"freeze" message would be asynchronous and could land after a verdict, leaving a
window in which a holder claims a payout and then hands the same winning shares
to someone who claims again.

## Nothing can hang

Every stage has a deadline.

| Stuck at | Escape |
|---|---|
| Evidence source unreachable at close | `resolve` reverts `[TRANSIENT]` and can be retried; past `resolve_deadline` anyone can `void_market` |
| Validators cannot agree | the round fails, the market stays CLOSED, and the deadline still applies |
| The reading is genuinely inconclusive | the verdict is `UNRESOLVED`, which voids the market — every position is refundable |
| Nobody backed the winning side | voided, because the pool would otherwise have no claimant |
| A dispute is never arbitrated | past `arbitration_window_seconds`, `void_market` unwinds it and **returns the bond** — a dispute that was never tested cannot be judged frivolous |

A void market refunds `yes + no` positions at face value. It is a real outcome,
not an error state, and the app shows it as one.

## Money

All amounts are `u256` at atto scale. There are four separate ledgers and they
never cross:

- **market escrow** — `yes_pool + no_pool`, drained by `paid_atto` and `refunded_atto`
- **jury bonds** — `jury_pool_atto` less `jury_paid_atto`
- **open dispute bonds** — held until arbitration disposes of them
- **protocol fees** — `fees_atto`, taken out of a payout, never out of a pool

`solvency()` returns all four, and the in-process suite asserts that everything
paid out across a busy market equals everything paid in, less rounding dust.

Both summary views (`solvency` and `stats`) read **running counters**, not a scan.
A view that walks every market ever opened gets slower every day the agent runs,
and these two are exactly what a dashboard polls. The counters are updated at the
points money moves and at the single place a market reaches a terminal state, and
a test drives a full lifecycle recomputing all five from scratch at every step —
an incremental counter is only worth having if it cannot drift.

One consequence worth knowing: `stats()` reports `live` (markets that have not
reached FINAL or VOID), **not** markets still trading. A market closes by the
clock alone, with no transaction to observe it, so counting what is still trading
would need the scan back. The app derives that from the market list it already
has.

The jury is paid only from slashed bonds and forfeited dispute bonds. It can
never take money from the people who bet. If nobody on the jury was right,
nobody is slashed — with no counterparty to pay, slashing would only enrich the
contract.

A dispute bond forfeited on a market **nobody sat on as a juror** has no
claimant: `claim_jury` is the only way out of the bonded pool and there is nobody
who can call it. Rather than leave it stranded, `finalize_jury` moves it to the
fee ledger, which does have a withdrawal path. So "an upheld dispute forfeits the
bond to the jury" is true when there is a jury, and to the protocol when there
is not.

## Three things this does not claim

1. **The jury is not protocol staking.** GenLayer's validator staking and
   slashing are protocol-level and have no contract-level API. Nothing here
   stakes, slashes or selects a network validator; `stake_juror` is an
   application-level bond pool and the docs say so in those words.

2. **The evidence digest is provenance, not proof.** It records what the leader
   fetched. Validators re-fetch and must reach the same decision, but the bytes
   cannot be compared, so the digest is not consensus-verified and the excerpt
   is shown as "the leader's evidence", not "the evidence".

3. **A failed payout is not observable on-chain.** An EOA payout is an external
   message that executes at finalization; value leaves the contract when the
   message is emitted and is not returned automatically if the child fails. The
   plan called for a `reclaim` to re-credit such a payout, and it was dropped
   because a contract cannot prove the transfer never landed. In practice a
   plain value transfer to an EOA has no code that can revert, so this is a
   theoretical hole rather than a live one — but it is a hole, and pretending
   otherwise with a function that cannot work would be worse.

## Testing, and what each layer proves

Three suites, three processes, because gltest's direct mode loads exactly one
contract class per process.

| Suite | Host | Proves |
|---|---|---|
| `tests/direct` (76) | real GenVM SDK + storage encoder, one contract | the market's storage schema, every guard and transition, the consensus round against mocked web and LLM, validator agreement and divergence |
| `tests/positions` (15) | same, other contract | mint/burn access control and idempotency, the transfer freeze, metadata |
| `tests/unit` (22) | in-process stub, **both contracts wired to each other** | cross-contract settlement, a transferred position paying its new holder, double-claim attempts, wei-level money conservation against a modelled balance, and that the running counters never drift |

Two deliberate pieces of test infrastructure:

- `tests/direct/fakepositions.py` fills gltest's `_gl_call_hook` with a mirror of
  the position ledger, because direct mode has no handler for `CallContract` or
  `PostMessage`. Without it `claim` cannot run at all.
- `tests/unit/glstub.py` is a fake `genlayer` module that dispatches
  cross-contract calls between two live instances with the caller's address as
  the sender, models the contract balance (so an overpayment raises rather than
  passing), and can delay or drop an emitted message on purpose.

The LLM path is built on `gl.vm.run_nondet_unsafe` rather than
`gl.eq_principle.prompt_*` specifically so it is reachable in direct mode:
gltest's mock host has no handler for the `ExecPromptTemplate` request that
`prompt_comparative` issues, so those primitives return `None` regardless of any
registered mock, and every state downstream of one becomes untestable.

## Toolchain traps worth knowing

- **`vm.warp()` does not move the contract clock** in gltest 0.29.2 — it
  refreshes sender and value but leaves the SDK's cached
  `message_raw["datetime"]` alone. `tests/direct/helpers.py:warp_to` sets it
  directly. Without this, every time-based test silently tests nothing.
- **The account fixtures return raw bytes before the SDK is loaded and an
  `Address` afterwards**, so which one a test sees depends on fixture ordering.
  `helpers.account_bytes` normalises rather than guesses.
- **A reverted call captures no validator**, so `run_validator()` has to be taken
  from a successful round and then re-run against swapped mocks.
- **`genlayer write` hardcodes `value: 0n`** and cannot call a payable method
  under any flags, which is fatal for a prediction market. Everything that moves
  money goes through `genlayer-js` in `agent/`.
- **ACCEPTED is not success**, and `txExecutionResultName` is empty on Studio.
  `agent/txstatus.mjs` and `frontend/src/lib/tx.ts` both read
  `consensus_data.leader_receipt[0].execution_result` instead, and both treat
  UNDETERMINED and the two timeouts as *no verdict* rather than as failure or
  success.
- **Studio enforces 5000 requests per day per IP**, separately from the
  well-known per-minute bucket, and a rate-limited response reaches a browser
  looking exactly like a CORS error. Every poller here backs off 4s → 20s.
