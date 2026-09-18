"""Challenging a verdict, and what a challenge costs when it fails."""
import json

from helpers import COINGECKO_BTC, GEN, VERDICT_NO, VERDICT_YES, warp_to

AFTER_CLOSE = "2026-09-18T13:30:00Z"
IN_WINDOW = "2026-09-18T20:00:00Z"
AFTER_WINDOW = "2026-09-19T14:00:00Z"
CHALLENGE_URL = "https://www.coindesk.com/price/bitcoin"

ALT_EVIDENCE = json.dumps({"note": "an exchange print showing a lower settlement price"})


def _resolve_yes(contract, direct_vm, market):
    warp_to(direct_vm, AFTER_CLOSE)
    direct_vm.mock_web(r".*api\.coingecko\.com.*", {"status": 200, "body": COINGECKO_BTC})
    direct_vm.mock_web(r".*coindesk\.com.*", {"status": 200, "body": ALT_EVIDENCE})
    direct_vm.mock_llm(r".*", VERDICT_YES)
    contract.resolve(market)


def test_a_bonded_dispute_moves_the_market_out_of_settlement(contract, direct_vm, market, direct_bob):
    _resolve_yes(contract, direct_vm, market)
    warp_to(direct_vm, IN_WINDOW)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    contract.dispute(market, CHALLENGE_URL, "The settlement print was below the threshold at the close.")
    direct_vm.value = 0
    assert contract.get_market(market)["status"] == "DISPUTED"
    filed = contract.get_dispute(market)
    assert filed["bond"] == str(GEN)
    assert filed["disposed"] is False


def test_a_dispute_after_the_window_is_refused(contract, direct_vm, market, direct_bob):
    _resolve_yes(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    with direct_vm.expect_revert("window"):
        contract.dispute(market, CHALLENGE_URL, "Too late.")
    direct_vm.value = 0


def test_an_underfunded_dispute_is_refused(contract, direct_vm, market, direct_bob):
    _resolve_yes(contract, direct_vm, market)
    warp_to(direct_vm, IN_WINDOW)
    direct_vm.sender = direct_bob
    direct_vm.value = 10**15
    with direct_vm.expect_revert("bond must be at least"):
        contract.dispute(market, CHALLENGE_URL, "Cheap talk.")
    direct_vm.value = 0


def test_a_non_https_evidence_url_is_refused(contract, direct_vm, market, direct_bob):
    _resolve_yes(contract, direct_vm, market)
    warp_to(direct_vm, IN_WINDOW)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    with direct_vm.expect_revert("must be https"):
        contract.dispute(market, "http://insecure.example/price", "Bad scheme.")
    direct_vm.value = 0


def test_an_upheld_verdict_forfeits_the_bond_to_the_jury_pool(contract, direct_vm, market, direct_bob):
    _resolve_yes(contract, direct_vm, market)
    warp_to(direct_vm, IN_WINDOW)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    contract.dispute(market, CHALLENGE_URL, "I say it settled below.")
    direct_vm.value = 0
    assert contract.arbitrate(market) == "YES"
    filed = contract.get_dispute(market)
    assert filed["disposed"] is True
    assert filed["overturned"] is False
    assert contract.get_market(market)["status"] == "FINAL"
    # Forfeited to the people who were right, not to the contract owner.
    assert contract.solvency()["jury_bonded"] == str(GEN)


def test_an_overturned_verdict_refunds_the_bond_and_rewrites_the_outcome(contract, direct_vm, market, direct_bob):
    _resolve_yes(contract, direct_vm, market)
    warp_to(direct_vm, IN_WINDOW)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    contract.dispute(market, CHALLENGE_URL, "The close was below the threshold.")
    direct_vm.value = 0
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*api\.coingecko\.com.*", {"status": 200, "body": COINGECKO_BTC})
    direct_vm.mock_web(r".*coindesk\.com.*", {"status": 200, "body": ALT_EVIDENCE})
    direct_vm.mock_llm(r".*", VERDICT_NO)
    assert contract.arbitrate(market) == "NO"
    verdict = contract.get_verdict(market)
    assert verdict["outcome"] == "NO"
    assert verdict["original_outcome"] == "YES"
    assert verdict["arbitrated"] is True
    assert contract.get_dispute(market)["overturned"] is True
    assert contract.solvency()["jury_bonded"] == "0"


def test_arbitration_sees_both_readings(contract, direct_vm, market, direct_bob):
    _resolve_yes(contract, direct_vm, market)
    warp_to(direct_vm, IN_WINDOW)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    contract.dispute(market, CHALLENGE_URL, "The exchange print disagrees.")
    direct_vm.value = 0
    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*api\.coingecko\.com.*", {"status": 200, "body": COINGECKO_BTC})
    direct_vm.mock_web(r".*coindesk\.com.*", {"status": 200, "body": ALT_EVIDENCE})
    # The prompt must carry the original verdict, the original reasoning, the
    # challenger's argument and the challenger's evidence, all fenced.
    direct_vm.mock_llm(
        r"(?s)A CHALLENGE HAS BEEN FILED.*original verdict was YES.*"
        r"exchange print disagrees.*an exchange print showing a lower settlement price",
        VERDICT_NO,
    )
    assert contract.arbitrate(market) == "NO"


def test_arbitration_that_never_runs_voids_and_returns_the_bond(contract, direct_vm, market, direct_bob):
    _resolve_yes(contract, direct_vm, market)
    warp_to(direct_vm, IN_WINDOW)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    contract.dispute(market, CHALLENGE_URL, "Never arbitrated.")
    direct_vm.value = 0
    warp_to(direct_vm, "2026-09-22T00:00:00Z")
    contract.void_market(market)
    view = contract.get_market(market)
    assert view["status"] == "VOID"
    assert "arbitration did not run" in view["void_reason"]
    # The dispute was never tested, so it cannot be judged frivolous.
    assert contract.get_dispute(market)["disposed"] is True
    assert contract.solvency()["jury_bonded"] == "0"


def test_a_market_nobody_resolves_voids_at_its_deadline(contract, direct_vm, market):
    warp_to(direct_vm, "2026-09-22T00:00:00Z")
    contract.void_market(market)
    view = contract.get_market(market)
    assert view["status"] == "VOID"
    assert "resolution deadline" in view["void_reason"]


def test_a_market_cannot_be_voided_early(contract, direct_vm, market):
    warp_to(direct_vm, AFTER_CLOSE)
    with direct_vm.expect_revert("cannot be voided yet"):
        contract.void_market(market)
