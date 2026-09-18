"""The escrow and the token ledger, running against each other for real."""
import pytest

from harness import AGENT, ALICE, BOB, CAROL, GEN, MARKET_ADDR, OWNER, POSITIONS_ADDR, VERDICT_NO, VERDICT_UNRESOLVED, VERDICT_YES


def test_a_bet_mints_the_position_through_the_token_contract(h):
    market = h.open_market()
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    assert h.position(market, "YES", ALICE) == 3 * GEN
    assert int(h.positions.supply_of(market, "YES")) == int(h.market.get_market(market)["yes_pool"])


def test_nobody_but_the_market_can_mint(h, UserError):
    market = h.open_market()
    h.acting_as(ALICE, on=POSITIONS_ADDR)
    with pytest.raises(UserError, match="Only the market contract"):
        h.positions.mint("forged", market, "YES", ALICE, 100 * GEN, "free money")


def test_a_transferred_position_pays_its_new_holder(h):
    """This is the point of the token: settlement reads the ledger, so whoever
    holds the winning position at the end is who gets paid."""
    market = h.open_market()
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.acting_as(ALICE, on=POSITIONS_ADDR)
    h.positions.transfer(market, "YES", BOB, 3 * GEN)
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    assert h.claim(market, sender=BOB) > 0
    assert h.paid_to(BOB) > 0
    assert h.paid_to(ALICE) == 0


def test_the_seller_cannot_also_claim(h, UserError):
    market = h.open_market()
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.acting_as(ALICE, on=POSITIONS_ADDR)
    h.positions.transfer(market, "YES", BOB, 3 * GEN)
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    h.claim(market, sender=BOB)
    with pytest.raises(UserError, match="no winning position"):
        h.claim(market, sender=ALICE)


def test_a_position_cannot_be_moved_after_the_market_stops_trading(h, UserError):
    market = h.open_market()
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.warp(3700)
    h.resolve(market)
    h.acting_as(ALICE, on=POSITIONS_ADDR)
    with pytest.raises(UserError, match="frozen"):
        h.positions.transfer(market, "YES", BOB, 3 * GEN)


def test_claiming_then_transferring_is_impossible(h, UserError):
    """The freeze is what closes the double-claim: claim, then hand the same
    winning shares to someone who claims again."""
    market = h.open_market()
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    h.claim(market, sender=ALICE)
    h.acting_as(ALICE, on=POSITIONS_ADDR)
    with pytest.raises(UserError, match="frozen"):
        h.positions.transfer(market, "YES", BOB, 3 * GEN)


def test_a_claim_burns_the_position(h):
    market = h.open_market()
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.warp(3700)
    h.resolve(market)
    h.warp(86401)
    h.claim(market, sender=ALICE)
    assert h.position(market, "YES", ALICE) == 0


def test_a_mint_that_lands_late_still_lands_exactly_once(h):
    """`on="accepted"` messages can be delivered more than once across appeal
    rounds, and in principle not at all. Neither must change the numbers."""
    market = h.open_market()
    h.gl.autodeliver = False
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    assert h.position(market, "YES", ALICE) == 0  # not minted yet
    h.gl.autodeliver = True
    h.gl.deliver()
    assert h.position(market, "YES", ALICE) == 3 * GEN
    # A duplicate delivery of the same message is a no-op, not a second mint.
    h.acting_as(OWNER)
    h.market.resend_mint(f"mint:{market}:bet-1")
    assert h.position(market, "YES", ALICE) == 3 * GEN


def test_a_dropped_mint_can_be_replayed_from_the_journal(h):
    market = h.open_market()
    h.gl.autodeliver = False
    h.bet(market, "yes", 3 * GEN, sender=ALICE)
    h.gl.drop_outbox()
    h.gl.autodeliver = True
    assert h.position(market, "YES", ALICE) == 0
    h.acting_as(ALICE)
    h.market.resend_mint(f"mint:{market}:bet-1")
    assert h.position(market, "YES", ALICE) == 3 * GEN


def test_the_positions_contract_reads_the_status_live_not_from_a_pushed_flag(h, UserError):
    """A pushed freeze would be asynchronous and could arrive after a verdict.
    The read cannot arrive late, which is the whole reason it is a read."""
    market = h.open_market()
    h.bet(market, "yes", GEN, sender=ALICE)
    h.gl.autodeliver = False  # nothing the market emits can reach positions now
    h.warp(3700)
    h.resolve(market)
    h.acting_as(ALICE, on=POSITIONS_ADDR)
    with pytest.raises(UserError, match="frozen"):
        h.positions.transfer(market, "YES", BOB, GEN)
