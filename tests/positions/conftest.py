"""Direct-mode fixtures for `contracts/positions.py`.

This lives in its own directory because gltest's direct mode loads exactly one
contract class per process: `positions.py` and `cassandra.py` cannot both be
deployed in the same pytest run. Run it as its own invocation (see the Makefile).

The market contract it reads back into is stubbed here through the same gl_call
hook, so the freeze rule is exercised against a status this suite controls.
"""
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

NOW_ISO = "2026-09-18T12:00:00Z"
GEN = 10**18
MARKET_ADDR = "0x" + "c3" * 20


class FakeMarket:
    def __init__(self):
        self.status = {1: "OPEN"}
        self.calls = []

    def get_status(self, market_id):
        self.calls.append(int(market_id))
        return self.status.get(int(market_id), "")


@pytest.fixture
def market_stub(direct_vm):
    stub = FakeMarket()

    def hook(_vm, request):
        from genlayer.py import calldata

        if "CallContract" in request:
            payload = request["CallContract"]["calldata"]
            handler = getattr(stub, payload.get("method", ""), None)
            if handler is None:
                return None
            return bytes([0]) + calldata.encode(handler(*payload.get("args", [])))
        if "PostMessage" in request:
            return {"ok": None}
        return None

    direct_vm._gl_call_hook = hook
    return stub


@pytest.fixture
def positions(direct_vm, direct_deploy, direct_owner, market_stub):
    import datetime
    import sys as _sys

    direct_vm.warp(NOW_ISO)
    module = _sys.modules.get("genlayer.gl")
    if module is not None:
        module.message_raw["datetime"] = NOW_ISO
    direct_vm.sender = direct_owner
    instance = direct_deploy("contracts/positions.py")
    instance.set_market(MARKET_ADDR)
    # The market address is also the only allowed minter.
    direct_vm.sender = bytes.fromhex(MARKET_ADDR[2:])
    return instance


@pytest.fixture
def market_sender():
    return bytes.fromhex(MARKET_ADDR[2:])
