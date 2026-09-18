"""Direct-mode fixtures. The real GenVM SDK and storage encoder run here, so this
suite is what proves the storage schema and every guard; see fakepositions.py for
how the cross-contract calls are served."""
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import fakepositions  # noqa: E402
from helpers import NOW_ISO, NOW_TS, POSITIONS_ADDR, account_bytes, config, warp_to  # noqa: E402


@pytest.fixture
def ledger(direct_vm):
    return fakepositions.install(direct_vm)


@pytest.fixture
def agent(direct_charlie):
    return direct_charlie


@pytest.fixture
def contract(direct_vm, direct_deploy, direct_owner, agent, ledger):
    # Address params are passed as raw bytes / hex strings: `genlayer` is not
    # importable until a deploy has loaded the SDK, and the contract normalises
    # every address through `_as_address` anyway.
    warp_to(direct_vm, NOW_ISO)
    direct_vm.sender = direct_owner
    instance = direct_deploy("contracts/cassandra.py", account_bytes(agent), config())
    instance.set_positions(POSITIONS_ADDR)
    return instance


@pytest.fixture
def market(contract, direct_vm, agent):
    """One agent-opened crypto market, seeded with 2 GEN, closing in an hour."""
    from helpers import GEN, market_args

    direct_vm.sender = agent
    direct_vm.value = 2 * GEN
    market_id = contract.open_market(*market_args(NOW_TS + 3600))
    direct_vm.value = 0
    return market_id
