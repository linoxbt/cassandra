"""Money conservation. The host models the contract balance, so an overpayment
raises here instead of passing silently."""
import pytest

from harness import (
    AGENT, ALICE, BOB, CAROL, GEN, MARKET_ADDR, OWNER, POSITIONS_ADDR,
    VERDICT_NO, VERDICT_UNRESOLVED, VERDICT_YES,
)


def test_a_full_lifecycle_pays_out_exactly_what_came_in(h):
    market = h.open_market(seed=2 * GEN)
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.bet(market, "no", 5 * GEN, sender=BOB)
    h.bet(market, "yes", 2 * GEN, sender=CAROL)
    taken = 2 * GEN + 3 * GEN + 5 * GEN + 2 * GEN
    assert h.balance() == taken
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    for who in (ALICE, CAROL, AGENT):
        h.claim(market, sender=who)
    handed_out = sum(h.paid_to(who) for who in (ALICE, BOB, CAROL, AGENT))
    assert handed_out <= taken
    # Integer division floors every share, so at most a few wei of dust is left.
    assert taken - handed_out < 10
    assert h.balance() == taken - handed_out


def test_the_losing_side_funds_the_winning_side_and_nothing_more(h):
    market = h.open_market(seed=2 * GEN)
    h.bet(market, "yes", 4 * GEN, sender=ALICE)
    h.bet(market, "no", 6 * GEN, sender=BOB)
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    alice = h.claim(market, sender=ALICE)
    # YES pool 5 (1 seed + 4), total pool 12. Alice holds 4 of 5.
    assert alice == (4 * GEN * 12 * GEN) // (5 * GEN)
    assert h.paid_to(BOB) == 0


def test_a_void_market_returns_every_stake_and_keeps_nothing(h):
    market = h.open_market(seed=2 * GEN)
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.bet(market, "no", 5 * GEN, sender=BOB)
    taken = 10 * GEN
    h.warp(3700)
    h.resolve(market, verdict=VERDICT_UNRESOLVED)
    for who in (ALICE, BOB, AGENT):
        h.claim(market, sender=who)
    assert h.paid_to(ALICE) == 3 * GEN
    assert h.paid_to(BOB) == 5 * GEN
    assert h.paid_to(AGENT) == 2 * GEN
    assert h.balance() == 0
    assert sum(h.paid_to(w) for w in (ALICE, BOB, AGENT)) == taken


def test_two_markets_never_settle_out_of_each_other(h, UserError):
    first = h.open_market(seed=2 * GEN)
    second = h.open_market(seed=2 * GEN)
    h.bet(first, "yes", 8 * GEN, sender=ALICE)
    h.bet(second, "yes", GEN, sender=BOB)
    h.warp(3700)
    h.resolve(first)
    h.warp(86401)
    h.claim(first, sender=ALICE)
    h.claim(first, sender=AGENT)
    # The second market's escrow is untouched by the first market's payouts.
    assert h.market.get_market(second)["paid"] == "0"
    assert h.balance() >= 3 * GEN


def test_the_jury_pool_is_a_separate_ledger_from_the_market_escrow(h):
    market = h.open_market(seed=2 * GEN)
    h.bet(market, "yes", 4 * GEN, sender=ALICE)
    h.stake_juror(market, "yes", 2 * GEN, sender=BOB)
    h.stake_juror(market, "no", 2 * GEN, sender=CAROL)
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    h.acting_as(OWNER)
    h.market.finalize_jury(market)
    solvency = h.solvency()
    assert solvency["market_escrow"] == str(6 * GEN)
    assert solvency["jury_bonded"] == str(4 * GEN)
    h.acting_as(BOB)
    assert int(h.market.claim_jury(market)) == 2 * GEN + GEN  # bond + carol's slashed half
    h.acting_as(CAROL)
    assert int(h.market.claim_jury(market)) == GEN
    assert h.solvency()["jury_bonded"] == "0"
    # The market pool never moved while the jury settled.
    assert h.market.get_market(market)["paid"] == "0"


def test_the_jury_can_never_be_paid_out_of_the_market_escrow(h, UserError):
    """The guard, tested directly: even if the bonded pool were somehow short, the
    settlement stops rather than reaching into the escrow behind it."""
    market = h.open_market(seed=2 * GEN)
    h.bet(market, "yes", 10 * GEN, sender=ALICE)
    h.stake_juror(market, "yes", GEN, sender=BOB)
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    h.acting_as(OWNER)
    h.market.finalize_jury(market)
    h.market.jury_paid_atto = type(h.market.jury_pool_atto)(int(h.market.jury_pool_atto))
    h.acting_as(BOB)
    with pytest.raises(UserError, match="exceed the bonded pool"):
        h.market.claim_jury(market)


def test_a_forfeited_dispute_bond_leaves_the_escrow_untouched(h):
    market = h.open_market(seed=2 * GEN)
    h.bet(market, "yes", 4 * GEN, sender=ALICE)
    h.stake_juror(market, "yes", GEN, sender=CAROL)
    h.warp(3700)
    h.resolve(market)
    h.acting_as(BOB, 2 * GEN)
    h.market.dispute(market, "https://example.org/proof", "I read it the other way.")
    h.serve("https://example.org/proof", 200, "{}")
    h.queue_verdict(VERDICT_YES)
    h.acting_as(BOB)
    assert h.market.arbitrate(market) == "YES"
    assert h.market.get_market(market)["paid"] == "0"
    h.acting_as(OWNER)
    h.market.finalize_jury(market)
    h.acting_as(CAROL)
    assert int(h.market.claim_jury(market)) == GEN + 2 * GEN
    assert h.paid_to(BOB) == 0


def test_protocol_fees_accrue_separately_and_only_the_owner_takes_them(h, UserError):
    h = type(h)(protocol_fee_bps=500)
    market = h.open_market(seed=2 * GEN)
    h.bet(market, "yes", 4 * GEN, sender=ALICE)
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    net = h.claim(market, sender=ALICE)
    gross = (4 * GEN * 6 * GEN) // (5 * GEN)
    fee = (gross * 500) // 10000
    assert net == gross - fee
    assert h.solvency()["fees"] == str(fee)
    h.acting_as(ALICE)
    with pytest.raises(UserError, match="Only the owner"):
        h.market.withdraw_fees()
    h.acting_as(OWNER)
    assert int(h.market.withdraw_fees()) == fee
    assert h.paid_to(OWNER) == fee
    assert h.solvency()["fees"] == "0"


def test_every_wei_is_accounted_for_across_a_busy_market(h):
    """One market, two bettors, two jurors, a failed dispute, and a full drain."""
    market = h.open_market(seed=2 * GEN)
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.bet(market, "no", 5 * GEN, sender=BOB)
    h.stake_juror(market, "yes", GEN, sender=CAROL)
    h.stake_juror(market, "no", GEN, sender=BOB)
    h.warp(3700)
    h.resolve(market)
    h.acting_as(BOB, GEN)
    h.market.dispute(market, "https://example.org/proof", "Wrong.")
    h.serve("https://example.org/proof", 200, "{}")
    h.queue_verdict(VERDICT_YES)
    h.acting_as(BOB)
    h.market.arbitrate(market)
    taken = 2 * GEN + 3 * GEN + 5 * GEN + GEN + GEN + GEN
    assert h.balance() == taken
    h.warp(86401)
    h.claim(market, sender=ALICE)
    h.claim(market, sender=AGENT)
    h.acting_as(OWNER)
    h.market.finalize_jury(market)
    h.acting_as(CAROL)
    h.market.claim_jury(market)
    h.acting_as(BOB)
    h.market.claim_jury(market)
    handed_out = sum(h.paid_to(w) for w in (ALICE, BOB, CAROL, AGENT, OWNER))
    assert handed_out == taken - h.balance()
    assert h.balance() < 10  # nothing but rounding dust
