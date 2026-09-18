"""The position ledger: who may mint, who may move, and when movement stops."""
from conftest import GEN, MARKET_ADDR


def _hex(value) -> str:
    as_bytes = getattr(value, "as_bytes", None)
    return "0x" + (bytes(as_bytes) if as_bytes is not None else bytes(value)).hex()


def test_only_the_market_may_mint(positions, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Only the market contract"):
        positions.mint("op-1", 1, "YES", _hex(direct_alice), GEN, "Will it rain?")


def test_a_mint_credits_the_holder_and_the_supply(positions, direct_vm, direct_alice, market_sender):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), 3 * GEN, "Will it rain?")
    assert positions.balance_of(1, "YES", _hex(direct_alice)) == str(3 * GEN)
    assert positions.supply_of(1, "YES") == str(3 * GEN)
    assert positions.supply_of(1, "NO") == "0"


def test_a_repeated_op_key_is_a_no_op_not_a_second_mint(positions, direct_vm, direct_alice, market_sender):
    """GenVM may deliver an `on="accepted"` message more than once across appeal
    rounds, so a repeat has to be free rather than fatal."""
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), 3 * GEN, "Will it rain?")
    positions.mint("op-1", 1, "YES", _hex(direct_alice), 3 * GEN, "Will it rain?")
    assert positions.balance_of(1, "YES", _hex(direct_alice)) == str(3 * GEN)


def test_a_burn_debits_the_holder(positions, direct_vm, direct_alice, market_sender):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), 3 * GEN, "Will it rain?")
    positions.burn("op-2", 1, "YES", _hex(direct_alice), 3 * GEN)
    assert positions.balance_of(1, "YES", _hex(direct_alice)) == "0"
    assert positions.supply_of(1, "YES") == "0"


def test_burning_more_than_is_held_is_refused(positions, direct_vm, direct_alice, market_sender):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), GEN, "Will it rain?")
    with direct_vm.expect_revert("Insufficient position balance"):
        positions.burn("op-2", 1, "YES", _hex(direct_alice), 2 * GEN)


def test_a_holder_can_transfer_while_the_market_is_open(
    positions, direct_vm, direct_alice, direct_bob, market_sender
):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), 3 * GEN, "Will it rain?")
    direct_vm.sender = direct_alice
    positions.transfer(1, "YES", _hex(direct_bob), GEN)
    assert positions.balance_of(1, "YES", _hex(direct_alice)) == str(2 * GEN)
    assert positions.balance_of(1, "YES", _hex(direct_bob)) == str(GEN)
    assert positions.supply_of(1, "YES") == str(3 * GEN)


def test_transfers_stop_the_moment_the_market_stops_trading(
    positions, direct_vm, direct_alice, direct_bob, market_stub, market_sender
):
    """This is the rule that makes a transferable receipt safe to settle against:
    without it, a holder could claim and then hand the same winning shares on."""
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), 3 * GEN, "Will it rain?")
    market_stub.status[1] = "RESOLVED"
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("frozen"):
        positions.transfer(1, "YES", _hex(direct_bob), GEN)


def test_the_status_is_read_on_every_transfer_not_cached(
    positions, direct_vm, direct_alice, direct_bob, market_stub, market_sender
):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), 3 * GEN, "Will it rain?")
    direct_vm.sender = direct_alice
    positions.transfer(1, "YES", _hex(direct_bob), GEN)
    positions.transfer(1, "YES", _hex(direct_bob), GEN)
    assert market_stub.calls == [1, 1]


def test_transferring_more_than_is_held_is_refused(
    positions, direct_vm, direct_alice, direct_bob, market_sender
):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), GEN, "Will it rain?")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Insufficient position balance"):
        positions.transfer(1, "YES", _hex(direct_bob), 2 * GEN)


def test_transfers_to_nowhere_and_to_yourself_are_refused(
    positions, direct_vm, direct_alice, market_sender
):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), GEN, "Will it rain?")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("zero address"):
        positions.transfer(1, "YES", "0x" + "00" * 20, GEN)
    with direct_vm.expect_revert("to yourself"):
        positions.transfer(1, "YES", _hex(direct_alice), GEN)


def test_an_unknown_side_is_refused(positions, direct_vm, direct_alice, market_sender):
    direct_vm.sender = market_sender
    with direct_vm.expect_revert("YES or NO"):
        positions.mint("op-1", 1, "MAYBE", _hex(direct_alice), GEN, "Will it rain?")


def test_the_market_can_only_be_wired_once(positions, direct_vm, direct_owner):
    direct_vm.sender = direct_owner
    with direct_vm.expect_revert("already set"):
        positions.set_market("0x" + "dd" * 20)


def test_metadata_describes_the_position(positions, direct_vm, direct_alice, market_sender):
    import json

    direct_vm.sender = market_sender
    positions.mint("op-1", 7, "NO", _hex(direct_alice), GEN, "Will BTC close above $90,000?")
    meta = json.loads(positions.uri(7, "NO"))
    assert meta["name"] == "Cassandra #7 - NO"
    assert meta["description"] == "Will BTC close above $90,000?"
    assert meta["supply"] == str(GEN)


def test_holders_and_ids_are_listed_for_the_ui(positions, direct_vm, direct_alice, direct_bob, market_sender):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), GEN, "Will it rain?")
    positions.mint("op-2", 1, "YES", _hex(direct_bob), GEN, "Will it rain?")
    holders = positions.holders_of(1, "YES")
    assert sorted(holders) == sorted([_hex(direct_alice).lower(), _hex(direct_bob).lower()])
    assert positions.list_ids(0, 10) == ["1"]


def test_a_combined_position_view_reads_both_sides(positions, direct_vm, direct_alice, market_sender):
    direct_vm.sender = market_sender
    positions.mint("op-1", 1, "YES", _hex(direct_alice), GEN, "Will it rain?")
    positions.mint("op-2", 1, "NO", _hex(direct_alice), 2 * GEN, "Will it rain?")
    view = positions.position_of(1, _hex(direct_alice))
    assert view == {"market_id": "1", "yes": str(GEN), "no": str(2 * GEN)}
