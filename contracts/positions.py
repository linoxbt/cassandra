# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
Cassandra position tokens - the "market NFT", as an Intelligent Contract.

Shaped like ERC-1155: one fungible token id per (market, side), a balance per
holder, a supply per id, and metadata behind `uri`. There is no Solidity and no
bridge; this is a GenLayer contract that the market contract talks to directly.

Two rules carry the whole safety argument:

1. ONLY THE MARKET MINTS OR BURNS. `mint` and `burn` check the caller against
   the market address wired in at deploy time, so supply can never diverge from
   the escrow backing it.

2. TRANSFERS STOP WHEN TRADING STOPS. `transfer` reads the market's status
   synchronously, on every call, and refuses once the market has left OPEN.
   Cross-contract *reads* are synchronous and therefore cannot arrive late; a
   pushed "freeze" message would be asynchronous and could land after a verdict,
   leaving a window in which a holder claims a payout and then hands the same
   winning shares to someone who claims again. Reading the status is what makes
   a transferable receipt safe to settle against.

Mint and burn are idempotent on an `op_key` supplied by the market. The market
emits them with `on="accepted"` so a position appears in the same breath as the
bet rather than a finalization later, and GenVM may deliver an accepted message
more than once across appeal rounds - so a repeated key is a silent no-op, not
an error.
"""
from genlayer import *
from dataclasses import dataclass


ERROR_EXPECTED = "[EXPECTED]"

SIDE_YES = "YES"
SIDE_NO = "NO"
SIDES = (SIDE_YES, SIDE_NO)

STATUS_OPEN = "OPEN"

MAX_OP_KEY_CHARS = 120
MAX_HOLDERS_PER_SIDE = 256
MAX_LIST_LIMIT = 200


class Minted(gl.Event):
    def __init__(self, market_id: str, side: str, holder: str, /, **blob): ...


class Burned(gl.Event):
    def __init__(self, market_id: str, side: str, holder: str, /, **blob): ...


class Transferred(gl.Event):
    def __init__(self, market_id: str, side: str, sender: str, /, **blob): ...


@allow_storage
@dataclass
class Meta:
    """Enough to render a position without a second call into the market."""
    market_id: u256
    question: str
    created_at: u256


class CassandraPositions(gl.Contract):
    owner: Address
    pending_owner: Address
    market: Address

    balances: TreeMap[str, u256]
    supply: TreeMap[str, u256]
    holders: TreeMap[str, str]
    holder_seen: TreeMap[str, bool]
    holder_count: TreeMap[str, u256]
    ops: TreeMap[str, bool]
    meta: TreeMap[u256, Meta]
    known_ids: DynArray[u256]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.pending_owner = Address(bytes(20))
        self.market = Address(bytes(20))

    # ------------------------------------------------------------------
    # internal
    # ------------------------------------------------------------------

    def _now(self) -> int:
        import datetime

        raw = gl.message_raw["datetime"]
        return int(datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp())

    def _only_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the owner may do this")

    def _only_market(self) -> None:
        if self.market == Address(bytes(20)):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} The market contract is not set yet")
        if gl.message.sender_address != self.market:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the market contract may mint or burn")

    def _credit(self, key: str, amount: int) -> None:
        self.balances[key] = u256(int(self.balances.get(key, u256(0))) + amount)

    def _debit(self, key: str, amount: int) -> None:
        held = int(self.balances.get(key, u256(0)))
        if held < amount:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Insufficient position balance")
        self.balances[key] = u256(held - amount)

    def _remember_holder(self, id_key: str, holder: str) -> None:
        """Membership is a map lookup, not a scan of the joined list.

        `mint` runs on every bet, and a market side can carry hundreds of
        holders. Splitting a list that long and searching it each time would make
        the cost of placing a bet grow with how popular the market already is -
        and a repeat bettor would pay it for a name already on the list. The map
        answers that in one lookup, and the string is only rewritten when a
        genuinely new holder arrives."""
        seen_key = f"{id_key}:{holder}"
        if bool(self.holder_seen.get(seen_key, False)):
            return
        count = int(self.holder_count.get(id_key, u256(0)))
        if count >= MAX_HOLDERS_PER_SIDE:
            # The list is a convenience for the UI, not a settlement input:
            # `balance_of` stays authoritative for everyone, listed or not.
            return
        self.holder_seen[seen_key] = True
        self.holder_count[id_key] = u256(count + 1)
        current = str(self.holders.get(id_key, ""))
        self.holders[id_key] = holder if not current else current + "," + holder

    def _seen(self, op_key: str) -> bool:
        key = _clean(op_key, MAX_OP_KEY_CHARS, "op_key")
        if bool(self.ops.get(key, False)):
            return True
        self.ops[key] = True
        return False

    def _market_is_open(self, market_id: int) -> bool:
        if self.market == Address(bytes(20)):
            # Nothing can be open before the ledger knows which market it serves,
            # and calling into the zero address would fail less legibly.
            raise gl.vm.UserError(f"{ERROR_EXPECTED} The market contract is not set yet")
        status = gl.get_contract_at(self.market).view().get_status(u256(market_id))
        return str(status) == STATUS_OPEN

    # ------------------------------------------------------------------
    # wiring
    # ------------------------------------------------------------------

    @gl.public.write
    def set_market(self, market: Address) -> None:
        """One-time wiring. Re-pointing this at a different market would orphan every
        existing balance from the escrow backing it, so it is refused once set."""
        self._only_owner()
        if self.market != Address(bytes(20)):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} The market contract is already set")
        addr = _as_address(market)
        if addr == Address(bytes(20)):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Market address must not be zero")
        self.market = addr

    @gl.public.write
    def transfer_ownership(self, new_owner: Address) -> None:
        self._only_owner()
        self.pending_owner = _as_address(new_owner)

    @gl.public.write
    def accept_ownership(self) -> None:
        if self.pending_owner == Address(bytes(20)) or gl.message.sender_address != self.pending_owner:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only the pending owner may accept")
        self.owner = self.pending_owner
        self.pending_owner = Address(bytes(20))

    # ------------------------------------------------------------------
    # supply, driven by the market
    # ------------------------------------------------------------------

    @gl.public.write
    def mint(self, op_key: str, market_id: u256, side: str, holder: Address, amount: u256, question: str) -> None:
        self._only_market()
        if self._seen(op_key):
            return
        mid = int(market_id)
        s = _side(side)
        who = _as_address(holder)
        value = int(amount)
        if value <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Mint amount must be positive")
        id_key = _id_key(mid, s)
        self._credit(_bal_key(mid, s, who), value)
        self.supply[id_key] = u256(int(self.supply.get(id_key, u256(0))) + value)
        self._remember_holder(id_key, who.as_hex.lower())
        if market_id not in self.meta:
            self.meta[market_id] = Meta(
                market_id=u256(mid),
                question=_clean(question, 300, "question"),
                created_at=u256(self._now()),
            )
            self.known_ids.append(u256(mid))
        Minted(str(mid), s, who.as_hex.lower(), amount=str(value), op_key=str(op_key)).emit()

    @gl.public.write
    def burn(self, op_key: str, market_id: u256, side: str, holder: Address, amount: u256) -> None:
        self._only_market()
        if self._seen(op_key):
            return
        mid = int(market_id)
        s = _side(side)
        who = _as_address(holder)
        value = int(amount)
        if value <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Burn amount must be positive")
        id_key = _id_key(mid, s)
        self._debit(_bal_key(mid, s, who), value)
        self.supply[id_key] = u256(max(0, int(self.supply.get(id_key, u256(0))) - value))
        Burned(str(mid), s, who.as_hex.lower(), amount=str(value), op_key=str(op_key)).emit()

    # ------------------------------------------------------------------
    # holder-driven
    # ------------------------------------------------------------------

    @gl.public.write
    def transfer(self, market_id: u256, side: str, to: Address, amount: u256) -> None:
        """Allowed only while the market is still taking bets - see the module docstring."""
        mid = int(market_id)
        s = _side(side)
        if not self._market_is_open(mid):
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} Positions are frozen once market {mid} stops trading"
            )
        sender = gl.message.sender_address
        recipient = _as_address(to)
        if recipient == Address(bytes(20)):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Cannot transfer to the zero address")
        if recipient == sender:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Cannot transfer to yourself")
        value = int(amount)
        if value <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Transfer amount must be positive")
        self._debit(_bal_key(mid, s, sender), value)
        self._credit(_bal_key(mid, s, recipient), value)
        self._remember_holder(_id_key(mid, s), recipient.as_hex.lower())
        Transferred(
            str(mid), s, sender.as_hex.lower(),
            recipient=recipient.as_hex.lower(), amount=str(value),
        ).emit()

    # ------------------------------------------------------------------
    # views
    # ------------------------------------------------------------------

    @gl.public.view
    def balance_of(self, market_id: u256, side: str, holder: Address) -> str:
        return str(int(self.balances.get(_bal_key(int(market_id), _side(side), _as_address(holder)), u256(0))))

    @gl.public.view
    def supply_of(self, market_id: u256, side: str) -> str:
        return str(int(self.supply.get(_id_key(int(market_id), _side(side)), u256(0))))

    @gl.public.view
    def position_of(self, market_id: u256, holder: Address) -> dict:
        mid = int(market_id)
        who = _as_address(holder)
        return {
            "market_id": str(mid),
            "yes": str(int(self.balances.get(_bal_key(mid, SIDE_YES, who), u256(0)))),
            "no": str(int(self.balances.get(_bal_key(mid, SIDE_NO, who), u256(0)))),
        }

    @gl.public.view
    def holders_of(self, market_id: u256, side: str) -> list:
        """Everyone who has ever held this position, capped at
        MAX_HOLDERS_PER_SIDE. Holders are not removed when a balance reaches
        zero, so read it as "who has touched this side", and take the balance
        from `balance_of`."""
        raw = str(self.holders.get(_id_key(int(market_id), _side(side)), ""))
        return [h for h in raw.split(",") if h]

    @gl.public.view
    def uri(self, market_id: u256, side: str) -> str:
        """ERC-1155-flavoured metadata, inline rather than behind a gateway."""
        import json

        mid = int(market_id)
        s = _side(side)
        entry = self.meta.get(u256(mid))
        question = str(entry.question) if entry is not None else ""
        return json.dumps(
            {
                "name": f"Cassandra #{mid} - {s}",
                "description": question or f"Position on Cassandra market {mid}",
                "market_id": str(mid),
                "side": s,
                "supply": str(int(self.supply.get(_id_key(mid, s), u256(0)))),
            },
            sort_keys=True,
        )

    @gl.public.view
    def list_ids(self, offset: u256, limit: u256) -> list:
        start = int(offset)
        count = min(int(limit) or 20, MAX_LIST_LIMIT)
        ids = [int(i) for i in self.known_ids]
        return [str(i) for i in ids[start:start + count]]

    @gl.public.view
    def get_market(self) -> str:
        return self.market.as_hex

    @gl.public.view
    def owner_address(self) -> str:
        return self.owner.as_hex


# ----------------------------------------------------------------------
# module helpers
# ----------------------------------------------------------------------

def _as_address(value) -> Address:
    return value if isinstance(value, Address) else Address(value)


def _side(side: str) -> str:
    s = str(side).strip().upper()
    if s not in SIDES:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Side must be YES or NO")
    return s


def _id_key(market_id: int, side: str) -> str:
    return f"{market_id}:{side}"


def _bal_key(market_id: int, side: str, holder: Address) -> str:
    # Lowercase: the live SDK returns EIP-55 checksummed hex while test stubs
    # return lowercase, and a map keyed on the raw form silently splits in two.
    return f"{market_id}:{side}:{holder.as_hex.lower()}"


def _clean(text: str, limit: int, label: str) -> str:
    value = str(text).strip()
    if not value:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} {label} must not be empty")
    if len(value) > limit:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} {label} must be at most {limit} characters")
    return value
