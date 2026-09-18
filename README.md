<p align="center">
  <img src="frontend/public/icon.svg" alt="Cassandra" width="72">
</p>

<h1 align="center">Cassandra</h1>

<p align="center">
  <strong>Prediction markets opened by an autonomous agent and settled by the contract that holds the money.</strong>
</p>

<p align="center">
  No oracle account. No resolver key. No backend. When a market closes, the
  contract fetches its own evidence and reads it — and every validator on the
  network repeats both before the verdict is written.
</p>

---

Cassandra was cursed to speak true prophecy that nobody believed. Here, belief is
not optional: the verdict is whatever independent validators agree the evidence
says, and the escrow pays out against it automatically.

|  |  |
|---|---|
| **Contracts** | [`contracts/cassandra.py`](contracts/cassandra.py) · [`contracts/positions.py`](contracts/positions.py) — GenVM / Python, no Solidity anywhere |
| **Agent** | [`agent/`](agent/) — Node + `genlayer-js`; proposes markets, and nothing else |
| **Frontend** | [`frontend/`](frontend/) — Vite + React + `genlayer-js`, talking to the chain directly |
| **Tests** | 113 across three suites — see [Testing](#testing) |
| **Architecture** | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

## How a market lives

1. **The agent proposes.** It pulls live numbers from five keyless feeds, builds a
   question around a threshold that is genuinely open, and refuses to open any
   market whose evidence URL does not already answer. A market it could not
   settle itself is a market it has no business asking.
2. **Anyone takes a side.** A bet mints position tokens one-for-one with the wei
   staked, in a separate ERC-1155-shaped contract. Positions are transferable
   while the market trades.
3. **Jurors bond a reading.** Optional, and paid only out of slashed bonds — never
   out of the market pool.
4. **The contract settles itself.** After the close, anyone can call `resolve`.
   Inside consensus the leader fetches the evidence and reads it; every validator
   re-fetches and re-reads, and must land on the same outcome and the same
   confidence decile. Prose is never compared.
5. **A verdict can be challenged.** A bonded dispute inside the window forces a
   second consensus round weighing both readings. Overturned refunds the bond;
   upheld forfeits it to the jury pool.
6. **Winners claim.** Settlement reads the token ledger, so a position that
   changed hands pays whoever holds it.

If the evidence cannot decide, the verdict is `UNRESOLVED` and the market voids —
everyone is refunded. That is a real outcome, not a failure.

## Evidence sources

All five are keyless. The URL is derived by the contract from fields fixed when
the market opened, so nobody can choose the source after seeing which way the
money went.

| Category | Source | Shape of question |
|---|---|---|
| `crypto` | CoinGecko | will an asset trade past a threshold |
| `weather` | Open-Meteo | will a daily maximum reach a figure |
| `sports` | TheSportsDB | will a named side win a named fixture |
| `pageviews` | Wikimedia | will an article's readership spike past a line |
| `news` | GDELT | is a story still live — the one that needs judgement rather than arithmetic |

## The jury is not protocol staking

`stake_juror` is an **application-level bond pool inside this contract**.
GenLayer's real validator staking and slashing are protocol-level and have no
contract-level API; nothing here stakes, slashes or selects a network validator.
The brief this was built from asked for per-market validator staking, and that is
the honest version of it.

Two more things Cassandra does not claim:

- **The evidence digest is provenance, not proof.** It records what the leader
  fetched. Validators re-fetch and must agree on the decision, but raw bytes
  cannot be compared — a live price feed returns different bytes to every caller
  a second apart.
- **A failed payout is not observable on-chain.** An EOA payout executes at
  finalization and is not returned automatically if the child message fails. See
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#three-things-this-does-not-claim).

## Running it

```sh
python3 -m venv .venv
./.venv/bin/pip install "genlayer-py==0.16.3" "genlayer-test==0.29.2" "genvm-linter==0.11.0" "pytest>=8,<9" pyright

make lint     # genvm-lint check + typecheck, both contracts
make test     # 113 tests across three suites
```

### Deploying

Studio Network is gasless, so neither account needs funding there.

```sh
cd agent && npm install
CASSANDRA_PW=<a passphrase> npm run setup     # creates two encrypted keystores
CASSANDRA_PW=<same> npm run deploy            # deploys both, wires them, verifies both
```

`deploy.mjs` deploys `positions` first, then `cassandra` pointing at it, then
points `positions` back. It proves both constructors ran and both links took with
view calls before recording anything, and writes the addresses straight into
`frontend/src/lib/contractAddresses.ts` — not into a `.env` the build may never
read.

### The agent

```sh
CASSANDRA_PW=... DRY_RUN=1 npm run propose   # see what it would open, send nothing
CASSANDRA_PW=... npm run tick                # one cycle, by hand
CASSANDRA_PW=... npm run daemon              # the same cycle on a jittered timer
```

A systemd unit is in [`deploy/cassandra-agent.service`](deploy/cassandra-agent.service).
It is deliberately **not** enabled: it runs a process that opens markets and
spends GEN on its own schedule.

### A live lifecycle, one step at a time

```sh
CASSANDRA_PW=... npm run smoke -- open
CASSANDRA_PW=... npm run smoke -- bet
CASSANDRA_PW=... npm run smoke -- transfer
CASSANDRA_PW=... npm run smoke -- resolve    # after the close
CASSANDRA_PW=... npm run smoke -- claim
CASSANDRA_PW=... npm run smoke -- state
```

Resumable on purpose: Studio's shared quota fits only a handful of writes per
window and an LLM round takes minutes, so a script that tries the whole lifecycle
in one go loses its place halfway.

## Testing

```sh
make test          # all three, in sequence
```

Three suites in three processes, because gltest's direct mode loads exactly one
contract class per process.

| Suite | What it proves |
|---|---|
| `tests/direct` (76) | the market against the real GenVM storage encoder: every guard, the consensus round, validator agreement *and* divergence |
| `tests/positions` (15) | mint/burn access control and idempotency, the transfer freeze |
| `tests/unit` (22) | both contracts wired to each other, with a modelled balance — cross-contract settlement, double-claim attempts, and wei-level money conservation, plus that the running counters never drift |

The LLM path is built on `gl.vm.run_nondet_unsafe` rather than
`gl.eq_principle.prompt_*` precisely so it is reachable under `mock_llm`: gltest
has no handler for the request `prompt_comparative` issues, so anything built on
it is untestable in direct mode, along with every state downstream of it.

## Networks

| | Studio Network | Asimov Testnet |
|---|---|---|
| RPC | `https://studio.genlayer.com/api` | `https://rpc-asimov.genlayer.com` |
| Chain id | 61999 | 4221 |
| Gas | gasless | funded; faucet at `testnet-faucet.genlayer.foundation` |
| Explorer | explorer-studio.genlayer.com | explorer-asimov.genlayer.com |

Studio enforces **5000 requests per day per IP** on top of the per-minute bucket,
and a rate-limited response reaches a browser looking exactly like a CORS error.
Every poller in this repo backs off 4s → 20s.

## Licence

MIT.
