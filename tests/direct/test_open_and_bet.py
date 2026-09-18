"""Opening markets, taking bets, and what the position mints look like."""
import pytest

from helpers import GEN, NOW_TS, market_args, warp_to


def test_open_market_seeds_both_sides_and_mints_to_the_creator(contract, ledger, market, agent):
    view = contract.get_market(market)
    assert view["status"] == "OPEN"
    assert view["by_agent"] is True
    assert view["yes_pool"] == str(GEN)
    assert view["no_pool"] == str(GEN)
    assert view["seed"] == str(2 * GEN)
    # The seed is not dust with no withdrawal path: it is a real position the
    # creator can claim like anyone else.
    assert ledger.balance(market, "YES", agent) == GEN
    assert ledger.balance(market, "NO", agent) == GEN


def test_evidence_url_is_derived_not_supplied(contract, market):
    view = contract.get_market(market)
    assert view["evidence_url"].startswith("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin")


def test_bet_mints_positions_one_for_one_with_wei(contract, direct_vm, direct_alice, market, ledger):
    direct_vm.sender = direct_alice
    direct_vm.value = 3 * GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    assert ledger.balance(market, "YES", direct_alice) == 3 * GEN
    view = contract.get_market(market)
    assert view["yes_pool"] == str(4 * GEN)
    assert view["bet_count"] == "1"
    # supply and pool are the same number by construction - that identity is what
    # lets settlement read the token contract instead of a second stake ledger.
    assert ledger.total_supply(market, "YES") == int(view["yes_pool"])


def test_bet_below_the_minimum_is_refused(contract, direct_vm, direct_alice, market):
    direct_vm.sender = direct_alice
    direct_vm.value = 10**12
    with direct_vm.expect_revert("at least"):
        contract.bet(market, "yes")
    direct_vm.value = 0


def test_bet_after_close_is_refused(contract, direct_vm, direct_alice, market):
    warp_to(direct_vm, "2026-09-18T13:30:00Z")
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    with direct_vm.expect_revert("no longer taking bets"):
        contract.bet(market, "yes")
    direct_vm.value = 0


def test_market_closes_lazily_without_anyone_calling_close(contract, direct_vm, market):
    assert contract.get_status(market) == "OPEN"
    warp_to(direct_vm, "2026-09-18T13:30:00Z")
    assert contract.get_status(market) == "CLOSED"


def test_a_public_market_is_allowed_but_not_marked_as_the_agent(contract, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = 2 * GEN
    market_id = contract.open_market(*market_args(NOW_TS + 3600))
    direct_vm.value = 0
    assert contract.get_market(market_id)["by_agent"] is False


def test_seed_must_be_even_so_both_sides_start_level(contract, direct_vm, agent):
    direct_vm.sender = agent
    direct_vm.value = 2 * GEN + 1
    with direct_vm.expect_revert("even number"):
        contract.open_market(*market_args(NOW_TS + 3600))
    direct_vm.value = 0


def test_trading_window_bounds_are_enforced(contract, direct_vm, agent):
    direct_vm.sender = agent
    direct_vm.value = 2 * GEN
    with direct_vm.expect_revert("at least"):
        contract.open_market(*market_args(NOW_TS + 60))
    with direct_vm.expect_revert("at most"):
        contract.open_market(*market_args(NOW_TS + 60 * 86400))
    direct_vm.value = 0
