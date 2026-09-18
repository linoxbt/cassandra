"""The bonded jury. This is an application-level bond pool, not protocol staking:
nothing here stakes, slashes or selects a GenLayer network validator."""
from helpers import COINGECKO_BTC, GEN, VERDICT_UNRESOLVED, VERDICT_YES, warp_to

AFTER_CLOSE = "2026-09-18T13:30:00Z"
AFTER_WINDOW = "2026-09-19T14:00:00Z"


def _resolve(contract, direct_vm, market, verdict=VERDICT_YES):
    warp_to(direct_vm, AFTER_CLOSE)
    direct_vm.mock_web(r".*api\.coingecko\.com.*", {"status": 200, "body": COINGECKO_BTC})
    direct_vm.mock_llm(r".*", verdict)
    return contract.resolve(market)


def _stake(contract, direct_vm, market, who, side, amount):
    direct_vm.sender = who
    direct_vm.value = amount
    contract.stake_juror(market, side)
    direct_vm.value = 0


def test_a_juror_bonds_a_reading_before_the_market_closes(contract, direct_vm, market, direct_alice):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    jury = contract.get_jury(market)
    assert len(jury) == 1
    assert jury[0]["side"] == "YES"
    assert jury[0]["bond"] == str(GEN)
    assert contract.solvency()["jury_bonded"] == str(GEN)


def test_a_juror_cannot_join_after_the_close(contract, direct_vm, market, direct_alice):
    warp_to(direct_vm, AFTER_CLOSE)
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    with direct_vm.expect_revert("no longer accepts jurors"):
        contract.stake_juror(market, "yes")
    direct_vm.value = 0


def test_a_juror_cannot_hedge_both_sides(contract, direct_vm, market, direct_alice):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    with direct_vm.expect_revert("other side"):
        contract.stake_juror(market, "no")
    direct_vm.value = 0


def test_topping_up_the_same_side_adds_to_the_bond(contract, direct_vm, market, direct_alice):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    jury = contract.get_jury(market)
    assert len(jury) == 1
    assert jury[0]["bond"] == str(2 * GEN)


def test_a_wrong_juror_is_slashed_and_a_right_one_is_paid(
    contract, direct_vm, market, direct_alice, direct_bob
):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _stake(contract, direct_vm, market, direct_bob, "no", 2 * GEN)
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    contract.finalize(market)
    slashed = int(contract.finalize_jury(market))
    assert slashed == GEN  # 50% of bob's 2 GEN, at juror_slash_bps = 5000
    direct_vm.sender = direct_alice
    assert int(contract.claim_jury(market)) == GEN + slashed
    direct_vm.sender = direct_bob
    assert int(contract.claim_jury(market)) == GEN


def test_the_jury_is_paid_from_bonds_never_from_the_market_pool(
    contract, direct_vm, market, direct_alice, direct_bob, direct_charlie
):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _stake(contract, direct_vm, market, direct_bob, "no", 2 * GEN)
    direct_vm.sender = direct_charlie
    direct_vm.value = 4 * GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    contract.finalize_jury(market)
    before = contract.get_market(market)
    direct_vm.sender = direct_alice
    contract.claim_jury(market)
    direct_vm.sender = direct_bob
    contract.claim_jury(market)
    after = contract.get_market(market)
    assert after["yes_pool"] == before["yes_pool"]
    assert after["no_pool"] == before["no_pool"]
    assert after["paid"] == "0"
    # Every bonded wei has now been handed back out; nothing is left behind.
    assert contract.solvency()["jury_bonded"] == "0"


def test_nobody_is_slashed_when_nobody_was_right(contract, direct_vm, market, direct_alice, direct_bob):
    _stake(contract, direct_vm, market, direct_alice, "no", GEN)
    _stake(contract, direct_vm, market, direct_bob, "no", GEN)
    _resolve(contract, direct_vm, market)  # resolves YES; both jurors were wrong
    warp_to(direct_vm, AFTER_WINDOW)
    # With nobody to pay, slashing would only enrich the contract.
    assert contract.finalize_jury(market) == "0"
    direct_vm.sender = direct_alice
    assert int(contract.claim_jury(market)) == GEN
    direct_vm.sender = direct_bob
    assert int(contract.claim_jury(market)) == GEN


def test_a_void_market_returns_every_bond_untouched(contract, direct_vm, market, direct_alice, direct_bob):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _stake(contract, direct_vm, market, direct_bob, "no", GEN)
    _resolve(contract, direct_vm, market, verdict=VERDICT_UNRESOLVED)
    contract.finalize_jury(market)
    for who in (direct_alice, direct_bob):
        direct_vm.sender = who
        assert int(contract.claim_jury(market)) == GEN


def test_a_forfeited_dispute_bond_is_paid_to_the_right_jurors(
    contract, direct_vm, market, direct_alice, direct_bob
):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, "2026-09-18T20:00:00Z")
    direct_vm.sender = direct_bob
    direct_vm.value = 2 * GEN
    contract.dispute(market, "https://www.coindesk.com/price/bitcoin", "I disagree.")
    direct_vm.value = 0
    direct_vm.mock_web(r".*coindesk\.com.*", {"status": 200, "body": "{}"})
    assert contract.arbitrate(market) == "YES"  # upheld, so the bond is forfeited
    contract.finalize_jury(market)
    direct_vm.sender = direct_alice
    assert int(contract.claim_jury(market)) == GEN + 2 * GEN


def test_settling_twice_is_refused(contract, direct_vm, market, direct_alice):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    contract.finalize_jury(market)
    with direct_vm.expect_revert("already finalized"):
        contract.finalize_jury(market)
    direct_vm.sender = direct_alice
    contract.claim_jury(market)
    with direct_vm.expect_revert("Already settled"):
        contract.claim_jury(market)


def test_a_stranger_cannot_claim_from_a_jury_they_did_not_sit_on(contract, direct_vm, market, direct_alice, direct_bob):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    contract.finalize_jury(market)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("did not sit"):
        contract.claim_jury(market)


def test_claiming_before_the_jury_is_finalized_is_refused(contract, direct_vm, market, direct_alice):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("not been finalized"):
        contract.claim_jury(market)


def test_a_forfeited_bond_on_a_market_with_no_jury_is_not_stranded(contract, direct_vm, market, direct_bob):
    """A dispute bond forfeited on a market nobody sat on has no juror to pay.
    Left in the bonded pool it would be stuck forever, because `claim_jury` is the
    only way out and there is nobody who can call it."""
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, "2026-09-18T20:00:00Z")
    direct_vm.sender = direct_bob
    direct_vm.value = 2 * GEN
    contract.dispute(market, "https://www.coindesk.com/price/bitcoin", "I disagree.")
    direct_vm.value = 0
    direct_vm.mock_web(r".*coindesk\.com.*", {"status": 200, "body": "{}"})
    assert contract.arbitrate(market) == "YES"  # upheld, so the bond is forfeited
    assert contract.solvency()["jury_bonded"] == str(2 * GEN)
    contract.finalize_jury(market)
    # It leaves the bonded pool and lands somewhere with a withdrawal path.
    assert contract.solvency()["jury_bonded"] == "0"
    assert contract.solvency()["fees"] == str(2 * GEN)


def test_a_forfeited_bond_goes_whole_to_the_one_juror_who_was_right(
    contract, direct_vm, market, direct_alice, direct_bob
):
    _stake(contract, direct_vm, market, direct_alice, "yes", GEN)
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, "2026-09-18T20:00:00Z")
    direct_vm.sender = direct_bob
    direct_vm.value = 2 * GEN
    contract.dispute(market, "https://www.coindesk.com/price/bitcoin", "I disagree.")
    direct_vm.value = 0
    direct_vm.mock_web(r".*coindesk\.com.*", {"status": 200, "body": "{}"})
    contract.arbitrate(market)
    assert contract.get_market(market)["status"] == "FINAL"
    contract.finalize_jury(market)
    direct_vm.sender = direct_alice
    # The single right juror takes their bond plus the whole forfeited pot.
    assert int(contract.claim_jury(market)) == GEN + 2 * GEN
    assert contract.solvency()["jury_bonded"] == "0"
