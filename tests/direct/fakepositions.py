"""A stand-in positions ledger for direct-mode tests.

gltest's direct mode loads exactly one contract class per process and has no
handler for `CallContract` / `PostMessage`, so the market contract's calls into
`positions.py` return nothing and `claim` cannot run. It does expose a hook for
those requests, which this module fills with a ledger that mirrors the real
positions contract: mint and burn are idempotent on `op_key`, and `balance_of`
answers from the same numbers the mints produced.

What that buys: every settlement path in `cassandra.py` - the payout arithmetic,
the solvency guard, double-claim rejection, refunds - runs against the real GenVM
storage encoder with balances that came from real `bet` calls.

What it does not prove: that `positions.py` itself is correct, or that GenVM
delivers these messages. Those are `tests/positions/` and `tests/unit/`.
"""


class FakePositions:
    def __init__(self):
        self.balances = {}
        self.supply = {}
        self.ops = {}
        self.calls = []
        self.dropped = set()

    # -- the shape the market contract sees ----------------------------

    def balance_of(self, market_id, side, holder):
        return str(self.balances.get((int(market_id), str(side), _hex(holder)), 0))

    def mint(self, op_key, market_id, side, holder, amount, question=""):
        if op_key in self.ops:
            return
        if op_key in self.dropped:
            # Simulates a cross-contract write that never landed.
            return
        self.ops[op_key] = True
        key = (int(market_id), str(side), _hex(holder))
        self.balances[key] = self.balances.get(key, 0) + int(amount)
        sid = (int(market_id), str(side))
        self.supply[sid] = self.supply.get(sid, 0) + int(amount)

    def burn(self, op_key, market_id, side, holder, amount):
        if op_key in self.ops:
            return
        self.ops[op_key] = True
        key = (int(market_id), str(side), _hex(holder))
        held = self.balances.get(key, 0)
        assert held >= int(amount), f"burn of {int(amount)} against {held}"
        self.balances[key] = held - int(amount)
        sid = (int(market_id), str(side))
        self.supply[sid] = self.supply.get(sid, 0) - int(amount)

    # -- test helpers --------------------------------------------------

    def balance(self, market_id, side, holder) -> int:
        return self.balances.get((int(market_id), str(side), _hex(holder)), 0)

    def total_supply(self, market_id, side) -> int:
        return self.supply.get((int(market_id), str(side)), 0)

    def drop_next_mint(self, op_key: str) -> None:
        self.dropped.add(op_key)


def install(vm) -> FakePositions:
    ledger = FakePositions()

    def hook(_vm, request):
        from genlayer.py import calldata

        if "CallContract" in request:
            payload = request["CallContract"]["calldata"]
            method = payload.get("method", "")
            args = list(payload.get("args", []))
            ledger.calls.append((method, args))
            handler = getattr(ledger, method, None)
            if handler is None:
                return None
            value = handler(*args)
            # ResultCode.RETURN is 0, then the calldata-encoded return value.
            return bytes([0]) + calldata.encode(value)

        if "PostMessage" in request:
            payload = request["PostMessage"]["calldata"]
            method = payload.get("method", "")
            args = list(payload.get("args", []))
            ledger.calls.append((method, args))
            handler = getattr(ledger, method, None)
            if handler is not None:
                handler(*args)
            return {"ok": None}

        return None

    vm._gl_call_hook = hook
    return ledger


def _hex(value) -> str:
    """Addresses reach here three ways: as SDK `Address` objects from the contract,
    as raw 20-byte account ids from the gltest fixtures, and as hex strings from
    test code. All three have to land on the same key."""
    as_hex = getattr(value, "as_hex", None)
    if as_hex is not None:
        return as_hex.lower()
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex()
    return str(value).lower()
