import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { DOCS, docPath, findDoc, neighbours } from "@/lib/docs-nav";
import { Label } from "@/components/ui";
import { Code, CodeBlock, H2, H3, LI, Lede, Note, P, Table, UL, Warn } from "@/components/docs/prose";
import { NETWORKS, useNetwork, isDeployed, contractsFor } from "@/lib/network";
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/categories";

export function DocsIndex() {
  return (
    <>
      <Label>Documentation</Label>
      <h1 className="mt-3 font-display text-display-md text-ink">Cassandra, explained</h1>
      <Lede>
        How markets are opened, how a verdict is reached, who can be slashed for being wrong — and,
        at the end, a plain list of the things this system does not claim to do.
      </Lede>
      <div className="mt-12 flex flex-col gap-10">
        {DOCS.map((section) => (
          <section key={section.title}>
            <Label>{section.title}</Label>
            <div className="mt-4 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
              {section.pages.map((page) => (
                <Link
                  key={page.slug}
                  to={docPath(page.slug)}
                  className="bg-surface p-5 transition-colors hover:bg-paper-2"
                >
                  <h3 className="font-display text-lg text-ink">{page.title}</h3>
                  <p className="mt-1.5 text-[0.88rem] leading-relaxed text-muted">{page.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function DocsPage() {
  const { slug } = useParams();
  const doc = findDoc(slug);
  const { previous, next } = neighbours(slug);

  if (!doc) {
    return (
      <>
        <h1 className="font-display text-display-sm text-ink">No such page</h1>
        <P>
          That documentation page does not exist. <Link to="/docs" className="text-oxblood underline">Back to the index</Link>.
        </P>
      </>
    );
  }

  const Body = BODIES[doc.slug] ?? (() => <P>Coming soon.</P>);

  return (
    <article>
      <Label>Documentation</Label>
      <h1 className="mt-3 font-display text-display-sm text-ink">{doc.title}</h1>
      <div className="mt-5">
        <Body />
      </div>
      <nav className="mt-16 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
        {previous ? (
          <Link to={docPath(previous.slug)} className="bg-surface p-5 transition-colors hover:bg-paper-2">
            <Label>Previous</Label>
            <div className="mt-1 font-display text-base text-ink">{previous.title}</div>
          </Link>
        ) : (
          <span className="bg-surface p-5" />
        )}
        {next ? (
          <Link to={docPath(next.slug)} className="bg-surface p-5 text-right transition-colors hover:bg-paper-2">
            <Label>Next</Label>
            <div className="mt-1 font-display text-base text-ink">{next.title}</div>
          </Link>
        ) : (
          <span className="bg-surface p-5" />
        )}
      </nav>
    </article>
  );
}

const BODIES: Record<string, () => ReactNode> = {
  "what-cassandra-is": () => (
    <>
      <Lede>
        Cassandra is a prediction market where the contract that holds the money is also the thing
        that decides the outcome. There is no oracle account, no resolver key and no backend process
        waiting to be trusted.
      </Lede>
      <P>
        A market names a question, a category, an evidence source and its resolution criteria when it
        opens. Those fields are fixed from that moment. When trading closes, anyone at all can call{" "}
        <Code>resolve</Code>, and the contract goes and reads the feed those fields point at, decides
        what it says, and writes a verdict — but only once every validator has independently done the
        same and agreed on the answer.
      </P>
      <P>
        Most markets here are opened by an autonomous agent that watches the same feeds and looks for
        questions whose answer is genuinely open. It proposes; it never decides.
      </P>
      <H2>Two contracts</H2>
      <Table
        head={["Contract", "What it holds"]}
        rows={[
          [<Code key="a">cassandra.py</Code>, "Markets, the escrow, the consensus round, disputes and the jury. Authoritative on money."],
          [<Code key="b">positions.py</Code>, "The position tokens. Authoritative on who holds what, which is what settlement reads."],
        ]}
      />
      <P>
        Both are GenLayer Intelligent Contracts written in Python and run by GenVM. There is no
        Solidity anywhere in this system and nothing bridges to an EVM chain.
      </P>
    </>
  ),

  "how-it-settles": () => (
    <>
      <Lede>
        Settlement is one consensus round. The leader fetches the evidence and reads it; every
        validator repeats both steps independently; the verdict is written only if they agree on the
        decision.
      </Lede>
      <H2>What actually runs</H2>
      <CodeBlock lang="python">{`def leader_fn():
    body = _fetch(url)                       # the URL derived from the market's own fields
    digest = hashlib.sha256(body).hexdigest()
    parsed = _as_dict(gl.nondet.exec_prompt(prompt, response_format="json"))
    return {"outcome": ..., "decile": ..., "digest": digest, ...}

def validator_fn(leaders_res):
    if not isinstance(leaders_res, gl.vm.Return):
        return _handle_leader_error(leaders_res, leader_fn)
    mine = leader_fn()                       # the validator re-fetches and re-reads
    theirs = leaders_res.calldata
    if mine["outcome"] != theirs.get("outcome"):
        return False
    return int(mine["decile"]) == int(theirs.get("decile", -1))

return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`}</CodeBlock>
      <H2>What is compared, and what is not</H2>
      <UL>
        <LI>
          <strong className="font-medium text-ink">The outcome</strong> — YES, NO or UNRESOLVED. Must
          match exactly.
        </LI>
        <LI>
          <strong className="font-medium text-ink">The confidence, quantised to a decile</strong> —
          because two honest readings never agree on a raw percentage. Comparing the raw number
          rejects good verdicts; comparing nothing at all lets the leader set it alone. Ten buckets
          is the compromise that survives both.
        </LI>
        <LI>
          <strong className="font-medium text-ink">Never the reasoning</strong>, and never the raw
          bytes. See <Link to="/docs/limits" className="text-oxblood underline">what it does not claim</Link>.
        </LI>
      </UL>
      <H2>Three outcomes, not two</H2>
      <P>
        <Code>UNRESOLVED</Code> is a real answer, and an important one. If the feed is stale, silent
        or simply does not address the question, the honest result is that nobody won. The market
        voids and every position is refundable in full. A market that cannot be settled honestly is
        unwound rather than guessed at.
      </P>
      <Note title="Nothing can hang">
        Every stage has a deadline. If the evidence source is unreachable, if validators cannot agree,
        or if an arbitration is never run, anyone can call <Code>void_market</Code> once the relevant
        deadline passes and the pool becomes refundable. No escrow can be held forever.
      </Note>
    </>
  ),

  "the-agent": () => (
    <>
      <Lede>
        The predictor agent reads the same public feeds the contract will read, and proposes markets
        whose answers are genuinely open. It has no privileged role at settlement.
      </Lede>
      <H2>What it does</H2>
      <UL>
        <LI>Pulls live data from the five sources and builds a question around a threshold roughly one day's move from where things currently stand — far enough that the answer is not already known, close enough to be reachable.</LI>
        <LI>Writes the resolution criteria and the evidence source into the market itself, before anyone can take a side.</LI>
        <LI>Refuses to open a market whose evidence URL does not already answer. A market it could not settle itself is a market it has no business asking.</LI>
        <LI>Calls <Code>resolve</Code>, <Code>arbitrate</Code> and <Code>finalize_jury</Code> on a timer, so the board keeps moving without anyone watching it.</LI>
      </UL>
      <H2>What it cannot do</H2>
      <P>
        It cannot influence a verdict. <Code>resolve</Code> is callable by anyone, and the evidence
        URL is derived by the contract from fields fixed when the market opened — so whoever triggers
        settlement cannot choose what the contract reads. The agent key can be rotated by the owner
        at any time without touching a single open market.
      </P>
      <Note title="No model required">
        Questions are composed from live numbers and typed templates, so the agent runs with no API
        key and no model of its own. The judgement in this system happens inside consensus, not in
        the agent.
      </Note>
    </>
  ),

  positions: () => (
    <>
      <Lede>
        Every stake mints position tokens, one-for-one with the wei behind it, in a contract of their
        own. Settlement reads that contract — so whoever holds the winning position at the end is who
        gets paid.
      </Lede>
      <P>
        The ledger is ERC-1155 shaped: one fungible id per market and side, a balance per holder, a
        supply per id, and metadata behind <Code>uri</Code>. It is a GenLayer contract, not a Solidity
        one, and nothing bridges.
      </P>
      <H2>Two rules carry the safety</H2>
      <UL>
        <LI>
          <strong className="font-medium text-ink">Only the market mints or burns.</strong> Supply
          can never diverge from the escrow backing it.
        </LI>
        <LI>
          <strong className="font-medium text-ink">Transfers stop when trading stops.</strong> The
          position contract reads the market's status synchronously on every single transfer and
          refuses once it has left <Code>OPEN</Code>.
        </LI>
      </UL>
      <H2>Why a read and not a flag</H2>
      <P>
        A pushed "freeze" message would be asynchronous, and could arrive after a verdict. That leaves
        a window in which a holder claims their payout and then hands the same winning shares to
        someone who claims again. A synchronous read cannot arrive late, which is the whole reason it
        is a read.
      </P>
      <H2>One ledger, not two</H2>
      <P>
        There is deliberately no second stake ledger in the market contract to drift out of step with
        this one. The market records a replay journal of each mint so a lost cross-contract message
        can be re-sent, but that journal is never a settlement input.
      </P>
    </>
  ),

  "the-jury": () => (
    <>
      <Lede>
        Anyone can post a bond on an open market and say in advance how they think it reads. When the
        verdict lands, the wrong are slashed and the right split what was slashed.
      </Lede>
      <Warn title="This is not protocol staking">
        The jury is an application-level bond pool. Nothing in these contracts stakes, slashes or
        selects a GenLayer network validator — no contract-level API for that exists. GenLayer's real
        validator staking and slashing are protocol-level and are reached from a client, not from a
        contract. The genuine validator economics happened a layer below, in the consensus round that
        produced the verdict.
      </Warn>
      <H2>How it settles</H2>
      <UL>
        <LI><Code>stake_juror(market_id, side)</Code> before the market closes. A juror cannot hedge both sides; topping up the same side adds to the bond.</LI>
        <LI><Code>finalize_jury(market_id)</Code> once the market is settled — callable by anyone, and it seals an unsealed verdict on the way, so no separate call is needed first. One bounded pass works out who was right and how much is being redistributed.</LI>
        <LI><Code>claim_jury(market_id)</Code> per juror, pulling their own settlement.</LI>
      </UL>
      <H2>Two rules that keep it honest</H2>
      <UL>
        <LI>
          Jurors are paid out of slashed bonds and forfeited dispute bonds, and <em>never</em> out of
          the market pool. (A dispute bond forfeited on a market that drew no jury has no claimant,
          so it goes to the fee ledger rather than into a pool nobody can withdraw from.) However badly a jury behaves it cannot reach the money the bettors put in —
          the contract enforces that with a separate ledger and a hard guard.
        </LI>
        <LI>
          If nobody was right, nobody is slashed. With no counterparty to pay, slashing would only
          enrich the contract, so every bond comes back.
        </LI>
      </UL>
      <P>A voided market returns every bond untouched: nothing was proven either way.</P>
    </>
  ),

  disputes: () => (
    <>
      <Lede>
        A verdict sits in a dispute window. A bonded challenge inside that window forces a second
        consensus round that weighs the original reading against the challenger's.
      </Lede>
      <H2>What a challenge costs</H2>
      <UL>
        <LI>Overturned — the bond is refunded in full and the outcome is rewritten.</LI>
        <LI>
          Upheld — the bond is forfeited. Where the market has a jury it goes to the jurors who
          called it right, rather than to the contract owner. Where nobody bonded a reading there is
          no claimant at all, so it goes to the protocol fee ledger instead of sitting in a pool with
          no exit.
        </LI>
        <LI>Never arbitrated — if the second round does not run before its own deadline, the market voids and the bond comes back. A dispute that was never tested cannot be judged frivolous.</LI>
      </UL>
      <H2>Arbitration sees both sides</H2>
      <P>
        The second round is given the original verdict, the original reasoning, the challenger's
        argument and the challenger's own evidence — all of it fenced as untrusted data — and told
        explicitly to defer to neither. It is binding either way.
      </P>
      <H2>Appeals</H2>
      <P>
        Separately from all of this, GenLayer itself supports appealing a transaction, which forces a
        fresh consensus round under real validator economics rather than application-level bonds. Where
        the network supports it, the app surfaces it on a settled market. Where it does not, the
        control is hidden rather than shown as a button that does nothing.
      </P>
    </>
  ),

  evidence: () => (
    <>
      <Lede>
        A market names its source when it opens. The contract derives the URL from that name at
        settlement — so nobody can point it somewhere else after seeing which way the money went.
      </Lede>
      <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-2">
        {CATEGORY_KEYS.map((key) => {
          const entry = CATEGORIES[key];
          return (
            <div key={key} className="bg-surface p-5">
              <Label>{entry.source}</Label>
              <h3 className="mt-2 font-display text-lg text-ink">{entry.label}</h3>
              <p className="mt-1.5 text-[0.88rem] leading-relaxed text-muted">{entry.blurb}</p>
            </div>
          );
        })}
      </div>
      <H2>Why a query cannot escape</H2>
      <P>
        The host and path are pinned by the category; only a short query fragment comes from the
        market, and it is restricted to letters, digits and <Code>_-.,=&amp;+</Code>. No slashes, no
        colons, no percent-encoding. A source query cannot redirect the fetch to another host, and
        the check runs when the market opens rather than when it settles — so a bad market is refused
        before anyone can stake on it.
      </P>
      <H2>Settlement is pinned to a date, not to a moment</H2>
      <P>
        Every market names the day it settles on when it opens, and the evidence URL asks the feed
        for that day. <Code>resolve</Code> is open to anyone for the whole resolution window, so a
        market that read a live spot price would let whoever called it pick a tick that suited them.
        Asking for a recorded daily figure removes the choice entirely: the answer is the same
        whenever the call is made.
      </P>
      <P>
        World news is the stated exception. "Is this still being reported" is inherently relative to
        when you ask, and it is a judgement rather than a number — which is precisely why it is the
        category where consensus over a reading earns its place.
      </P>

      <H3>Evidence is untrusted data</H3>
      <P>
        Whatever the feed returns is wrapped in an explicit fence and labelled as data that is never
        instructions. Text inside it that addresses the model, asserts an answer or tries to change
        the task is quoted, not obeyed.
      </P>
    </>
  ),

  contracts: () => {
    const network = useNetwork();
    const addresses = contractsFor(network);
    return (
      <>
        <Lede>Every method on both contracts. All money is wei, returned from views as decimal strings.</Lede>
        {isDeployed(network) ? (
          <Table
            head={["Contract", `Address on ${NETWORKS[network].label}`]}
            rows={[
              ["Market", <a key="m" className="font-mono text-[0.8rem] text-oxblood underline" href={`${NETWORKS[network].explorer}/address/${addresses.market}`} target="_blank" rel="noreferrer noopener">{addresses.market}</a>],
              ["Positions", <a key="p" className="font-mono text-[0.8rem] text-oxblood underline" href={`${NETWORKS[network].explorer}/address/${addresses.positions}`} target="_blank" rel="noreferrer noopener">{addresses.positions}</a>],
            ]}
          />
        ) : (
          <Note title="Not yet deployed here">
            Cassandra has no deployment on {NETWORKS[network].label} yet. Switch networks in the app
            header, or deploy your own — see <Link to="/docs/running-it" className="text-oxblood underline">running it yourself</Link>.
          </Note>
        )}
        <H2>Market contract</H2>
        <Table
          head={["Method", "Kind", "Notes"]}
          rows={[
            [<Code key="1">open_market</Code>, "write · payable", "Agent, owner, or anyone if public markets are on. The seed is split evenly and minted back to the creator as a real position."],
            [<Code key="2">bet</Code>, "write · payable", "While OPEN. Mints position tokens one-for-one with the wei staked."],
            [<Code key="3">resolve</Code>, "write", "Anyone, once trading has closed. Runs the consensus round."],
            [<Code key="4">dispute</Code>, "write · payable", "Bonded, inside the dispute window."],
            [<Code key="5">arbitrate</Code>, "write", "The second consensus round. Binding."],
            [<Code key="6">finalize</Code>, "write", "Seals an undisputed verdict. Also happens lazily on claim."],
            [<Code key="7">claim</Code>, "write", "Pro-rata payout, or a refund if the market voided."],
            [<Code key="8">void_market</Code>, "write", "The escape hatch, once a stage deadline has passed."],
            [<Code key="9">stake_juror</Code>, "write · payable", "Bond a reading before the market closes."],
            [<Code key="10">finalize_jury</Code> , "write", "One bounded pass over the jury."],
            [<Code key="11">claim_jury</Code>, "write", "Each juror pulls their own settlement."],
            [<Code key="12">resend_mint</Code>, "write", "Re-emits a mint from the journal. Idempotent on the receiving side."],
          ]}
        />
        <H3>Views</H3>
        <P>
          <Code>get_market</Code>, <Code>get_status</Code>, <Code>list_markets(offset, limit)</Code>,{" "}
          <Code>get_verdict</Code>, <Code>get_dispute</Code>, <Code>get_jury</Code>,{" "}
          <Code>get_claim</Code>, <Code>get_config</Code>, <Code>solvency</Code>, <Code>stats</Code>.
        </P>
        <H2>Positions contract</H2>
        <Table
          head={["Method", "Kind", "Notes"]}
          rows={[
            [<Code key="a">mint</Code>, "write", "Market only. Idempotent on an op key."],
            [<Code key="b">burn</Code>, "write", "Market only. Idempotent on an op key."],
            [<Code key="c">transfer</Code>, "write", "Holder. Refused once the market has left OPEN."],
            [<Code key="d">balance_of / supply_of / position_of / holders_of / uri / list_ids</Code>, "view", "The ledger."],
          ]}
        />
      </>
    );
  },

  networks: () => {
    const network = useNetwork();
    return (
      <>
        <Lede>Cassandra targets GenLayer's real networks. Localnet is deliberately not offered, so a wallet is never asked to add a dev chain.</Lede>
        <Table
          head={["Network", "Chain id", "RPC", "Gas"]}
          rows={Object.entries(NETWORKS).map(([key, value]) => [
            <span key={key} className={key === network ? "font-medium text-ink" : undefined}>{value.label}</span>,
            <Code key={`${key}-id`}>{String(value.chain.id)}</Code>,
            <span key={`${key}-rpc`} className="font-mono text-[0.78rem]">{value.chain.rpcUrls.default.http[0]}</span>,
            value.gasless ? "Gasless" : "Needs GEN from the faucet",
          ])}
        />
        <H2>Quotas worth knowing</H2>
        <UL>
          <LI>Studio's RPC limit is shared across every app pointed at it — roughly 60 requests a minute and a few thousand a day. A flat poll burns it fast, so everything here polls on a backoff.</LI>
          <LI>A rate-limited Studio response arrives without CORS headers, so in a browser it looks exactly like a CORS misconfiguration. It is not; it is the quota.</LI>
          <LI>A resolution runs an LLM round across every validator and can take minutes. The app waits up to ten, on a backoff, before it reports anything.</LI>
        </UL>
      </>
    );
  },

  "running-it": () => (
    <>
      <Lede>Everything here runs locally: the contracts, their tests, and the agent.</Lede>
      <H2>Tests</H2>
      <P>
        Three suites. Direct mode runs the real GenVM SDK and storage encoder; the in-process suite
        runs both contracts wired to each other, which direct mode cannot do; the integration suite
        talks to a live network.
      </P>
      <CodeBlock lang="bash">{`make lint     # genvm-lint check + typecheck on both contracts
make test     # direct, positions and unit suites, in sequence`}</CodeBlock>
      <Note title="One contract per process">
        gltest's direct mode loads exactly one contract class per process, which is why the market and
        the position ledger have separate suites and separate pytest invocations.
      </Note>
      <H2>Deploy your own</H2>
      <CodeBlock lang="bash">{`cd agent
npm install
CASSANDRA_PW=... npm run setup     # creates two encrypted keystores
CASSANDRA_PW=... npm run deploy    # both contracts, wired, constructor verified`}</CodeBlock>
      <H2>Drive the agent</H2>
      <CodeBlock lang="bash">{`CASSANDRA_PW=... npm run propose -- --dry   # see what it would open
CASSANDRA_PW=... npm run tick               # one full cycle
npm run state                               # the board, read-only`}</CodeBlock>
      <P>
        The daemon is the same code path on a jittered timer. A systemd unit ships in{" "}
        <Code>deploy/</Code> but is deliberately not enabled: it is a process that spends GEN on its
        own schedule, and turning that on should be a decision someone makes on purpose.
      </P>
    </>
  ),

  limits: () => (
    <>
      <Lede>
        Three things this system does not claim. They are here rather than buried, because a
        guarantee nobody stated clearly is a guarantee nobody can check.
      </Lede>
      <H2>1. The evidence digest is provenance, not proof</H2>
      <P>
        Each verdict records a SHA-256 of the bytes the leader fetched, and a short excerpt. Validators
        re-fetch and must reach the same decision — but the raw bytes themselves are never compared,
        because they cannot be: a live price feed returns different bytes to every caller a second
        apart. What consensus guarantees is the <em>decision</em>. The digest tells you what the
        leader saw; it does not prove the validators saw the same thing.
      </P>
      <H2>2. Payouts land at finality, not on acceptance</H2>
      <P>
        Paying a person is an external message, and external messages execute only when the
        transaction finalizes. A transaction reaching <Code>ACCEPTED</Code> means it landed in a
        block, not that it succeeded and not that money moved. This app waits for{" "}
        <Code>FINALIZED</Code> plus a successful leader receipt before it tells anyone they were
        paid, which is why a claim takes minutes rather than seconds.
      </P>
      <H2>3. A failed payout is not observable on-chain</H2>
      <P>
        If an external payout message were to fail, the contract cannot see that it did, so there is
        no repair function for it — writing one would mean shipping something that cannot do its job.
        In practice the risk is theoretical: these payouts are plain value transfers to ordinary
        accounts, which have no code that could reject them.
      </P>
      <Warn title="And the jury, once more">
        The jury is an application-level bond pool. It is not GenLayer protocol staking, and being
        slashed by it has no effect on anyone's standing as a network validator.
      </Warn>
    </>
  ),
};
