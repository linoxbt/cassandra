# GenLayer Portal — Project submission

Every field of the Portal's **Project** form, in form order, ready to paste.
Character limits are marked; each block below is already inside its limit.

Contribution type: **Builder → Projects → Project**

---

## 01 · Identity

**Logo** — [`brand/logo-512.png`](brand/logo-512.png) (512×512 PNG, 12 KB; the
same laurel mark as the site and favicon).

**Project name**

```
Cassandra
```

**Primary tag / Tag 1 / Tag 2** — ⚠️ **pick these in the browser.** These are
dropdowns and I could not see the option list, so I have not guessed at values
that may not exist. If the options include them, I would choose:

| Field | Suggested | Why |
|---|---|---|
| Primary tag | **AI Agents**, else **Oracles** | The agent opens markets autonomously and the contract reads evidence with an LLM under consensus. If neither exists, **DeFi**. |
| Tag 1 | **Prediction Markets** | What it literally is. |
| Tag 2 | **Oracles** (or **DeFi** if Oracles is primary) | The settlement mechanism is the interesting half. |

---

## 02 · Project summary

**One-liner** *(limit 180 — this is 158)*

```
Prediction markets opened by an autonomous agent and settled by the contract holding the money — it fetches its own evidence, and every validator re-reads it.
```

---

## 03 · Project overview

**Description** *(limit 1000 — this is 992)*

```
Cassandra is a prediction market where the contract holding the escrow also settles it. When trading closes, anyone can call resolve. Inside consensus the contract fetches its own evidence from a public feed and reads it against criteria fixed when the market opened, and every validator independently repeats both. Only the decision is compared — the outcome and a confidence decile — because two honest readings never produce identical prose.

An autonomous agent opens the markets from five keyless feeds: CoinGecko, Open-Meteo, TheSportsDB, Wikimedia pageviews and GDELT. It sets a threshold about a day's move out and will not open a market whose evidence URL does not already answer. It can only propose — resolve is open to anyone.

Stakes are ERC-1155-shaped tokens in a second contract, transferable while a market trades and frozen once it closes, so the escrow pays whoever holds them at the end. Where the evidence cannot decide, the market voids and refunds rather than guessing.
```

---

## 04 · Demo video

**Optional, and we have none.** Leave blank rather than link something that is
not a demo. Everything the form asks a steward to check is live on the site and
needs no video — see the How-to below.

---

## 05 · How-to

Steps 1–5 need **no wallet**: every figure on the site is a live contract read,
so a steward can verify the whole settlement story without signing anything.

| # | Heading | Instruction |
|---|---|---|
| 01 | Open the board | Go to https://cassandra-markets.netlify.app/markets. Every market listed was opened on chain by the autonomous agent; the curve on each card is the live pool split, read from the contract on page load. |
| 02 | Find a market with a verdict | Use the **Settling** or **Settled** filter — Settling holds markets that have a verdict but are still inside their challenge window, Settled holds the finished ones. Or open market #9 directly at https://cassandra-markets.netlify.app/market/9. No wallet is needed for any of this. |
| 03 | Read the verdict | The panel shows the outcome, the confidence band, and the model's own reasoning quoting the figure it read out of the feed. This text came from the consensus round, not from a backend. |
| 04 | Check the evidence yourself | Below the verdict is the exact evidence URL the contract derived from the market's category and source, plus a sha256 of what the leader fetched. Open that URL in a new tab and confirm the number in the reasoning is really there. |
| 05 | See a market the contract refused to decide | Open https://cassandra-markets.netlify.app/market/8. The fixture existed but had no final score, so consensus returned UNRESOLVED, the market went VOID, and every stake became refundable. It guesses at nothing. |
| 06 | Watch the agent | https://cassandra-markets.netlify.app/agent shows what the agent has opened, the live contract config and a solvency breakdown of every wei the contract holds, by ledger. |
| 07 | Read the docs | https://cassandra-markets.netlify.app/docs covers how settlement works, position tokens, the jury, appeals, and a page listing what the system does not claim. |
| 08 | Connect a wallet (optional) | Switch the network selector to Studio and connect. Studio Network is gasless, but a stake still moves real value, so you need GEN — use the faucet in the Studio account selector at https://studio.genlayer.com. |
| 09 | Take a side | On any OPEN market, choose YES or NO, enter an amount at or above the minimum the panel shows (read from the contract, not hardcoded), and stake. Your position mints as a token in the second contract, one-for-one with the wei. |
| 10 | Settle it | Once trading closes, press Resolve on the market page. The contract fetches the evidence and every validator reads it; this takes minutes, not seconds, because it is a real consensus round. The verdict, reasoning and digest then appear as in step 3. |

---

## 06 · Review verification

**Expected verification outcome** *(limit 500 — this is 467)*

```
Open the board and use the Settling or Settled filter. On any market there, with no wallet connected, you should see a verdict of YES, NO or UNRESOLVED, the confidence band, the model's reasoning quoting the figure it read, the exact evidence URL the contract derived, and a sha256 of what the leader fetched. Market #9 reads NO because Open-Meteo gave 19.6C against a 20C line. Market #8 is VOID: the fixture was listed with no final score, so the contract refused to guess and refunded.
```

**Contract link 1** — market, escrow and settlement

```
https://explorer-studio.genlayer.com/address/0x857F67E8cEb31AAda1f9C35c80362dEC13813dE1
```

**Contract link 2** — position ledger (ERC-1155-shaped)

```
https://explorer-studio.genlayer.com/address/0x8EEc710b185433d08b13Fb491F5A7B406AB7C43f
```

---

## 07 · Project links

**Website** *(required)*

```
https://cassandra-markets.netlify.app
```

**GitHub**

```
https://github.com/linoxbt/cassandra
```

---

## Evidence & Supporting Information

**GitHub Repository**

```
https://github.com/linoxbt/cassandra
```

---

## Reviewer notes

Three things the project deliberately does not claim. All are stated in the
README, the contract docstrings and the docs site, and a steward will find them
there rather than having to dig.

**The jury is an application-level bond pool, not protocol staking.** GenLayer's
validator staking and slashing are protocol-level and have no contract-level
API, so `stake_juror` is this contract's own bond ledger. Jurors are paid only
from slashed bonds and forfeited dispute bonds — never from the market pool.

**The evidence digest is provenance, not proof.** Validators re-fetch and must
agree on the decision, but the raw bytes cannot be compared: a live feed returns
something different to every caller a second apart. The digest and excerpt
record what the leader read; the agreement is on the outcome.

**Appeals are probed, not assumed.** A protocol-level appeal re-runs a
settlement under real validator economics. The app asks the SDK at runtime
whether the chain can price an appeal bond; Studio cannot, because it simulates
consensus rather than running the staking contracts, so the panel says so
instead of offering a control that could only fail.

### Build facts

| | |
|---|---|
| Contracts | `contracts/cassandra.py` (escrow, verdict, dispute, jury) and `contracts/positions.py` (position ledger) — Python/GenVM, no Solidity anywhere |
| Tests | 120 Python across three suites, plus 15 for the agent; CI green |
| Frontend | Vite + React reading both contracts through `genlayer-js`, no backend or indexer |
| Agent | Node, on a systemd timer; opens and settles markets unattended |
| Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · deployment history in [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md) |
