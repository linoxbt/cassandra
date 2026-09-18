"""Claims, refunds, and the invariant that a market never pays out more than it took."""
from helpers import COINGECKO_BTC, GEN, VERDICT_UNRESOLVED, VERDICT_YES, account_bytes, config, market_args, warp_to

AFTER_CLOSE = "2026-09-18T13:30:00Z"
AFTER_WINDOW = "2026-09-19T14:00:00Z"


def _resolve(contract, direct_vm, market, verdict=VERDICT_YES):
    warp_to(direct_vm, AFTER_CLOSE)
    direct_vm.mock_web(r".*api\.coingecko\.com.*", {"status": 200, "body": COINGECKO_BTC})
    direct_vm.mock_llm(r".*", verdict)
    return contract.resolve(market)


def test_a_winner_is_paid_pro_rata_out_of_the_whole_pool(contract, direct_vm, market, ledger, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    direct_vm.value = 3 * GEN
    contract.bet(market, "yes")
    direct_vm.sender = direct_bob
    direct_vm.value = 4 * GEN
    contract.bet(market, "no")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    # Pools: YES 1 (seed) + 3 = 4, NO 1 (seed) + 4 = 5. Total 9.
    direct_vm.sender = direct_alice
    paid = int(contract.claim(market))
    assert paid == (3 * GEN * 9 * GEN) // (4 * GEN)
    assert contract.get_market(market)["status"] == "FINAL"
    # The winning position is burned, so it cannot be presented twice.
    assert ledger.balance(market, "YES", direct_alice) == 0


def test_the_creator_claims_the_seed_like_anyone_else(contract, direct_vm, market, agent, direct_bob):
    direct_vm.sender = direct_bob
    direct_vm.value = 4 * GEN
    contract.bet(market, "no")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    direct_vm.sender = agent
    paid = int(contract.claim(market))
    # The seed's YES half is the entire winning pool, so it takes the lot.
    assert paid == 6 * GEN


def test_claiming_twice_is_refused(contract, direct_vm, market, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    direct_vm.sender = direct_alice
    contract.claim(market)
    with direct_vm.expect_revert("Already claimed"):
        contract.claim(market)


def test_the_losing_side_cannot_claim(contract, direct_vm, market, direct_bob):
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    contract.bet(market, "no")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("no winning position"):
        contract.claim(market)


def test_the_total_paid_never_exceeds_the_pool(contract, direct_vm, market, agent, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    direct_vm.value = 3 * GEN
    contract.bet(market, "yes")
    direct_vm.sender = direct_bob
    direct_vm.value = 7 * GEN
    contract.bet(market, "no")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    total_pool = 12 * GEN
    paid = 0
    for who in (direct_alice, agent):
        direct_vm.sender = who
        paid += int(contract.claim(market))
    assert paid <= total_pool
    assert int(contract.get_market(market)["paid"]) <= total_pool


def test_claiming_before_the_dispute_window_closes_is_refused(contract, direct_vm, market, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("still open"):
        contract.claim(market)


def test_claim_seals_an_undisputed_verdict_without_a_separate_call(contract, direct_vm, market, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    assert contract.get_market(market)["status"] == "RESOLVED"
    warp_to(direct_vm, AFTER_WINDOW)
    direct_vm.sender = direct_alice
    contract.claim(market)
    assert contract.get_market(market)["status"] == "FINAL"


def test_a_void_market_refunds_both_sides_in_full(contract, direct_vm, market, ledger, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    direct_vm.value = 3 * GEN
    contract.bet(market, "yes")
    direct_vm.sender = direct_bob
    direct_vm.value = 4 * GEN
    contract.bet(market, "no")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market, verdict=VERDICT_UNRESOLVED)
    assert contract.get_market(market)["status"] == "VOID"
    direct_vm.sender = direct_alice
    assert int(contract.claim(market)) == 3 * GEN
    direct_vm.sender = direct_bob
    assert int(contract.claim(market)) == 4 * GEN
    assert ledger.balance(market, "YES", direct_alice) == 0
    assert ledger.balance(market, "NO", direct_bob) == 0


def test_a_refund_cannot_be_taken_twice(contract, direct_vm, market, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market, verdict=VERDICT_UNRESOLVED)
    direct_vm.sender = direct_alice
    contract.claim(market)
    with direct_vm.expect_revert("Already refunded"):
        contract.claim(market)


def test_refunds_never_exceed_the_pool(contract, direct_vm, market, agent, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = 5 * GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market, verdict=VERDICT_UNRESOLVED)
    for who in (direct_alice, agent):
        direct_vm.sender = who
        contract.claim(market)
    view = contract.get_market(market)
    assert int(view["refunded"]) == int(view["yes_pool"]) + int(view["no_pool"])


def test_a_protocol_fee_comes_out_of_the_payout_not_the_pool(
    direct_vm, direct_deploy, direct_owner, agent, ledger, direct_alice
):
    from helpers import NOW_ISO, NOW_TS, POSITIONS_ADDR

    warp_to(direct_vm, NOW_ISO)
    direct_vm.sender = direct_owner
    contract = direct_deploy("contracts/cassandra.py", account_bytes(agent), config(protocol_fee_bps=200))
    contract.set_positions(POSITIONS_ADDR)
    direct_vm.sender = agent
    direct_vm.value = 2 * GEN
    market = contract.open_market(*market_args(NOW_TS + 3600))
    direct_vm.sender = direct_alice
    direct_vm.value = 3 * GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    _resolve(contract, direct_vm, market)
    warp_to(direct_vm, AFTER_WINDOW)
    direct_vm.sender = direct_alice
    # pools: YES 1 (seed) + 3 = 4, NO 1 (seed). Total 5.
    gross = (3 * GEN * 5 * GEN) // (4 * GEN)
    net = int(contract.claim(market))
    assert net == gross - (gross * 200) // 10000
    assert contract.solvency()["fees"] == str((gross * 200) // 10000)


def test_a_lost_mint_can_be_replayed_from_the_journal(contract, direct_vm, market, ledger, direct_alice):
    ledger.drop_next_mint("mint:1:bet-1")
    direct_vm.sender = direct_alice
    direct_vm.value = 3 * GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    assert ledger.balance(market, "YES", direct_alice) == 0
    ledger.dropped.clear()
    contract.resend_mint("mint:1:bet-1")
    assert ledger.balance(market, "YES", direct_alice) == 3 * GEN


def test_replaying_a_mint_that_did_land_changes_nothing(contract, direct_vm, market, ledger, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = 3 * GEN
    contract.bet(market, "yes")
    direct_vm.value = 0
    contract.resend_mint("mint:1:bet-1")
    contract.resend_mint("mint:1:bet-1")
    assert ledger.balance(market, "YES", direct_alice) == 3 * GEN
