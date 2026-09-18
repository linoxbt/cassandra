"""Wires both contracts together on the in-process host. See glstub.py for what
this proves and what it does not."""
import datetime
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import glstub  # noqa: E402

GEN = 10**18
NOW = datetime.datetime(2026, 9, 18, 12, 0, 0, tzinfo=datetime.timezone.utc)
NOW_TS = int(NOW.timestamp())

MARKET_ADDR = glstub.Address("0x" + "c3" * 20)
POSITIONS_ADDR = glstub.Address("0x" + "9a" * 20)

OWNER = glstub.Address("0x" + "10" * 20)
AGENT = glstub.Address("0x" + "a9" * 20)
ALICE = glstub.Address("0x" + "a1" * 20)
BOB = glstub.Address("0x" + "b0" * 20)
CAROL = glstub.Address("0x" + "ca" * 20)

CONFIG = {
    "trading_min_seconds": 300,
    "trading_max_seconds": 30 * 86400,
    "resolve_window_seconds": 3 * 86400,
    "dispute_window_seconds": 86400,
    "arbitration_window_seconds": 2 * 86400,
    "min_bet_atto": 10**15,
    "min_seed_atto": 2 * 10**15,
    "dispute_bond_atto": 10**17,
    "min_juror_bond_atto": 10**17,
    "juror_slash_bps": 5000,
    "protocol_fee_bps": 0,
    "allow_public_markets": True,
}

COINGECKO_PREFIX = "https://api.coingecko.com/api/v3/coins/"
COINGECKO_BODY = json.dumps({"id": "bitcoin", "market_data": {"current_price": {"usd": 91250.42}}}).encode()

VERDICT_YES = json.dumps({"outcome": "YES", "confidence": 93, "reasoning": "Above the threshold."})
VERDICT_NO = json.dumps({"outcome": "NO", "confidence": 91, "reasoning": "Below the threshold."})
VERDICT_UNRESOLVED = json.dumps({"outcome": "UNRESOLVED", "confidence": 15, "reasoning": "Not addressed."})


def _load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "contracts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Harness:
    def __init__(self, **config_overrides):
        self.gl = glstub.install()
        self.now = NOW_TS
        self._set_clock()

        positions_module = _load("cassandra_positions", "positions.py")
        market_module = _load("cassandra_market", "cassandra.py")
        self.modules = (market_module, positions_module)

        self.acting_as(OWNER)
        self.gl.message_raw["contract_address"] = POSITIONS_ADDR
        self.gl.stack = [POSITIONS_ADDR]
        self.positions = positions_module.CassandraPositions()
        self.gl.register(POSITIONS_ADDR, self.positions)

        self.gl.stack = [MARKET_ADDR]
        self.gl.message_raw["contract_address"] = MARKET_ADDR
        merged = dict(CONFIG)
        merged.update(config_overrides)
        self.market = market_module.Cassandra(AGENT, json.dumps(merged))
        self.gl.register(MARKET_ADDR, self.market)

        self.positions.set_market(MARKET_ADDR)
        self.market.set_positions(POSITIONS_ADDR)

        self.gl.nondet.web.prefixes.append((COINGECKO_PREFIX, (200, COINGECKO_BODY)))

    # -- host controls -------------------------------------------------

    def _set_clock(self):
        stamp = datetime.datetime.fromtimestamp(self.now, tz=datetime.timezone.utc)
        self.gl.message_raw["datetime"] = stamp.strftime("%Y-%m-%dT%H:%M:%SZ")

    def warp_to(self, ts: int) -> None:
        assert ts >= self.now, "time only moves forward"
        self.now = ts
        self._set_clock()

    def warp(self, seconds: int) -> None:
        self.warp_to(self.now + seconds)

    def acting_as(self, sender, value: int = 0, on=MARKET_ADDR) -> None:
        """Credits the contract with the value first, exactly as a payable call does
        on chain, so the balance model can catch a payout that exceeds what came in."""
        self.gl.message.sender_address = sender
        self.gl.message.value = glstub.u256(value)
        self.gl.stack = [glstub.Address(on)]
        self.gl.message_raw["contract_address"] = glstub.Address(on)
        if value:
            key = glstub.Address(on)
            self.gl.balances[key] = self.gl.balances.get(key, 0) + int(value)

    def paid_to(self, who) -> int:
        return self.gl.paid.get(glstub.Address(who), 0)

    def balance(self, of=MARKET_ADDR) -> int:
        return self.gl.balances.get(glstub.Address(of), 0)

    def queue_verdict(self, verdict: str) -> None:
        self.gl.nondet.responses.append(verdict)

    def serve(self, prefix: str, status: int, body) -> None:
        payload = body if isinstance(body, bytes) else str(body).encode()
        self.gl.nondet.web.prefixes.insert(0, (prefix, (status, payload)))

    # -- flows ---------------------------------------------------------

    def open_market(self, seed=2 * GEN, closes_in=3600, sender=AGENT, **overrides):
        args = {
            "question": "Will BTC trade above $90,000 on 2026-09-19?",
            "category": "crypto",
            "source_query": "bitcoin,19-09-2026",
            "criteria": "Resolves YES if the CoinGecko daily USD price for bitcoin on 2026-09-19 is above 90000.",
            "closes_at": self.now + closes_in,
            "rationale": "24h change is 2.1% and the threshold is within one move.",
        }
        args.update(overrides)
        self.acting_as(sender, seed)
        return self.market.open_market(
            args["question"], args["category"], args["source_query"],
            args["criteria"], args["closes_at"], args["rationale"],
        )

    def bet(self, market_id, side, amount, sender=ALICE):
        self.acting_as(sender, amount)
        self.market.bet(market_id, side)

    def stake_juror(self, market_id, side, amount, sender=ALICE):
        self.acting_as(sender, amount)
        self.market.stake_juror(market_id, side)

    def resolve(self, market_id, verdict=VERDICT_YES, sender=ALICE):
        self.queue_verdict(verdict)
        self.acting_as(sender)
        return self.market.resolve(market_id)

    def claim(self, market_id, sender=ALICE):
        self.acting_as(sender)
        return int(self.market.claim(market_id))

    def position(self, market_id, side, holder) -> int:
        return int(self.positions.balance_of(market_id, side, holder))

    def solvency(self) -> dict:
        self.acting_as(OWNER)
        return self.market.solvency()
