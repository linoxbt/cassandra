"""Shared constants and builders for the direct-mode suite."""
import json

GEN = 10**18
NOW_ISO = "2026-09-18T12:00:00Z"
NOW_TS = 1789732800  # 2026-09-18T12:00:00Z

POSITIONS_ADDR = "0x" + "9a" * 20

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


def account_bytes(value) -> bytes:
    """gltest's account fixtures return raw 20 bytes before the SDK is loaded and an
    `Address` afterwards, so which one a test sees depends on fixture ordering.
    Normalise rather than guess."""
    as_bytes = getattr(value, "as_bytes", None)
    return bytes(as_bytes) if as_bytes is not None else bytes(value)


def account_hex(value) -> str:
    return "0x" + account_bytes(value).hex()


def warp_to(vm, when) -> None:
    """gltest 0.29.2 refreshes sender and value on warp but leaves the SDK's cached
    `message_raw["datetime"]` alone, so the contract clock does not move. Setting it
    directly is the documented workaround."""
    import datetime
    import sys

    if isinstance(when, int):
        stamp = datetime.datetime.fromtimestamp(when, datetime.timezone.utc)
        when = stamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    vm.warp(when)
    module = sys.modules.get("genlayer.gl")
    if module is not None:
        module.message_raw["datetime"] = when


def config(**overrides) -> str:
    merged = dict(CONFIG)
    merged.update(overrides)
    return json.dumps(merged)


COINGECKO_BTC = json.dumps(
    {"bitcoin": {"usd": 91250.42, "usd_24h_change": 2.1, "last_updated_at": NOW_TS}}
)

VERDICT_YES = json.dumps(
    {"outcome": "YES", "confidence": 93, "reasoning": "The feed reports 91250.42 USD, above the 90000 threshold."}
)
VERDICT_NO = json.dumps(
    {"outcome": "NO", "confidence": 91, "reasoning": "The feed reports a price below the threshold."}
)
VERDICT_UNRESOLVED = json.dumps(
    {"outcome": "UNRESOLVED", "confidence": 20, "reasoning": "The feed did not carry the asset in question."}
)


def market_args(closes_at: int, **overrides) -> tuple:
    args = {
        "question": "Will BTC trade above $90,000 on 2026-09-19?",
        "category": "crypto",
        "source_query": "bitcoin",
        "criteria": "Resolves YES if the CoinGecko USD price for bitcoin is strictly above 90000 at settlement.",
        "closes_at": closes_at,
        "rationale": "Opened by the predictor agent: 24h change is 2.1% and the threshold is within one move.",
    }
    args.update(overrides)
    return (
        args["question"], args["category"], args["source_query"],
        args["criteria"], args["closes_at"], args["rationale"],
    )
