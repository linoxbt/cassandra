"""An in-process stand-in for the GenVM host, used by tests/unit.

Why this exists: gltest's direct mode loads exactly one contract class per
process and has no handler for cross-contract calls, so it can never run
`cassandra.py` and `positions.py` against each other. Cassandra's whole
settlement story is that identity - the escrow reads the token ledger - so it
needs a host where both contracts are live at once, the clock and the balance
are test-controlled, and message delivery can be delayed or dropped on purpose.

This module supplies just enough of the `genlayer` namespace to import both
contract files unmodified and run them as ordinary Python.

What it proves:
  - The real contract source runs: every guard, transition and wei-level
    calculation is the shipped code.
  - Cross-contract reads and writes are dispatched for real between the two
    instances, with the caller's address as the sender, so the "only the market
    may mint" and "read the status on every transfer" rules are actually tested.
  - `run_nondet_unsafe` runs the real leader body, and with `gl.vm.validate` on,
    the real validator too.
  - The contract balance is modelled, so paying out more than was taken in
    raises instead of passing silently.

What it does NOT prove: GenVM storage encoding, gas, schema, or consensus over
a real model. Storage realism is tests/direct and tests/positions; real LLM
outcomes are the live run in tests/integration.
"""
import json as _json
import sys
import types


class UserError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class Address:
    __slots__ = ("_hex",)

    def __init__(self, value):
        if isinstance(value, Address):
            self._hex = value._hex
            return
        if isinstance(value, (bytes, bytearray)):
            raw = bytes(value)
        else:
            text = str(value)
            if text.startswith("0x") or text.startswith("0X"):
                text = text[2:]
            try:
                raw = bytes.fromhex(text)
            except ValueError:
                raise Exception(f"invalid address {value}")
        if len(raw) != 20:
            raise Exception(f"invalid address {value}")
        self._hex = "0x" + raw.hex()

    @property
    def as_hex(self) -> str:
        """Lowercase, where the real SDK returns EIP-55 checksummed. Both contracts
        lowercase before every map key and comparison, which tests/direct covers."""
        return self._hex

    @property
    def as_bytes(self) -> bytes:
        return bytes.fromhex(self._hex[2:])

    def __eq__(self, other):
        return isinstance(other, Address) and other._hex == self._hex

    def __hash__(self):
        return hash(self._hex)

    def __repr__(self):
        return f"Address({self._hex})"


MAX_U256 = 2**256 - 1


class u256(int):
    """Range-checked at construction - stricter and earlier than the real storage
    encoder. A negative reaching here is an accounting bug and should fail loudly."""

    def __new__(cls, value=0):
        number = int(value)
        if number < 0:
            raise AssertionError(f"u256 underflow: {number}")
        if number > MAX_U256:
            raise AssertionError(f"u256 overflow: {number}")
        return super().__new__(cls, number)


class _Generic:
    def __class_getitem__(cls, item):
        return cls


class TreeMap(dict, _Generic):
    pass


class DynArray(list, _Generic):
    pass


def allow_storage(cls):
    return cls


class Event:
    """Records rather than emits. The real SDK replaces a subclass's `__init__` in
    `__init_subclass__`, treating positional-only parameters as indexed topics -
    which is why the contracts declare them before a `/`. Mirrored here so a
    subclass whose body is `...` still works."""

    _sink = []

    def __init_subclass__(cls):
        import inspect

        signature = inspect.signature(cls.__init__)
        indexed = tuple(
            sorted(
                name
                for i, (name, param) in enumerate(signature.parameters.items())
                if i > 0 and param.kind is inspect.Parameter.POSITIONAL_ONLY
            )
        )
        for i, (name, param) in enumerate(signature.parameters.items()):
            if i == 0:
                continue
            if param.kind is inspect.Parameter.POSITIONAL_OR_KEYWORD:
                raise TypeError(f"{cls.__name__}: specify `/` after indexed fields")

        def __init__(self, *args, **kwargs):
            if len(args) != len(indexed):
                raise TypeError(
                    f"{cls.__name__}: expected {len(indexed)} indexed fields, got {len(args)}"
                )
            self._args = list(args)
            self._blob = dict(zip(indexed, args))
            self._blob.update(kwargs)

        cls.__init__ = __init__
        cls.indexed = indexed
        cls.signature = f"{cls.__name__}({','.join(indexed)})"

    def emit(self):
        Event._sink.append((type(self).__name__, list(self._args), dict(self._blob)))


class _Message:
    def __init__(self):
        self.sender_address = Address("0x" + "00" * 20)
        self.value = u256(0)


class _Public:
    class _Write:
        def __call__(self, fn):
            fn.__gl_write__ = True
            return fn

        def payable(self, fn):
            fn.__gl_payable__ = True
            fn.__gl_write__ = True
            return fn

    def __init__(self):
        self.write = self._Write()

    def view(self, fn):
        fn.__gl_view__ = True
        return fn


class InsufficientBalance(AssertionError):
    """The contract tried to pay out more than it holds."""


class _ExternalRecipient:
    def __init__(self, address, gl):
        self._address = address
        self._gl = gl

    def emit_transfer(self, value, **kwargs):
        if kwargs:
            raise TypeError(f"external emit_transfer takes no {list(kwargs)}")
        amount = int(value)
        if amount <= 0:
            raise ValueError("value must be greater than 0 for emit_transfer")
        holder = self._gl.current_address()
        held = self._gl.balances.get(holder, 0)
        if amount > held:
            raise InsufficientBalance(
                f"contract {holder.as_hex} tried to send {amount} holding only {held}"
            )
        self._gl.balances[holder] = held - amount
        self._gl.paid[self._address] = self._gl.paid.get(self._address, 0) + amount
        self._gl.transfers.append({"from": holder, "to": self._address, "value": amount})


class _Return:
    def __init__(self, calldata):
        self.calldata = calldata


class _LeaderError:
    def __init__(self, message):
        self.message = message


class _Vm:
    UserError = UserError
    Return = _Return

    def __init__(self):
        self.validate = False
        self.votes = []

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        try:
            result = leader_fn()
        except UserError as err:
            if self.validate:
                self.votes.append(bool(validator_fn(_LeaderError(err.message))))
            raise
        if self.validate:
            self.votes.append(bool(validator_fn(_Return(result))))
        return result


class _Contract:
    """Materialises storage fields from annotations before the contract's __init__."""

    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        for name, annotation in getattr(cls, "__annotations__", {}).items():
            label = getattr(annotation, "__name__", "")
            if annotation is TreeMap or label == "TreeMap":
                setattr(instance, name, TreeMap())
            elif annotation is DynArray or label == "DynArray":
                setattr(instance, name, DynArray())
            elif annotation is bool or label == "bool":
                setattr(instance, name, False)
            elif annotation is str or label == "str":
                setattr(instance, name, "")
            else:
                setattr(instance, name, u256(0))
        return instance


class _EqPrinciple:
    def __init__(self):
        self.calls = []

    def strict_eq(self, fn):
        self.calls.append("strict_eq")
        return fn()


class Response:
    def __init__(self, status, body, headers=None):
        self.status = status
        self.body = body
        self.headers = headers or {}


class _Web:
    def __init__(self):
        self.pages = {}
        self.prefixes = []
        self.fetches = []
        self.headers = []

    def get(self, url, headers=None):
        self.fetches.append(url)
        self.headers.append(dict(headers or {}))
        if url in self.pages:
            status, body = self.pages[url]
            return Response(status, body)
        for prefix, (status, body) in self.prefixes:
            if url.startswith(prefix):
                return Response(status, body)
        raise RuntimeError(f"no page registered for {url}")

    def render(self, url, mode="text"):
        raise AssertionError("the contracts must use raw web.get, never render")


class _Nondet:
    def __init__(self):
        self.web = _Web()
        self.prompts = []
        self.responses = []

    def exec_prompt(self, prompt, response_format=None):
        """With response_format="json" GenVM returns an already-parsed object, so
        queued JSON text is decoded before it is handed over."""
        self.prompts.append(prompt)
        if not self.responses:
            raise AssertionError("no queued exec_prompt response")
        response = self.responses.pop(0)
        if response_format == "json" and isinstance(response, str):
            return _json.loads(response)
        return response


class _Evm:
    def __init__(self, gl):
        self._gl = gl

    def contract_interface(self, _declaration):
        gl = self._gl

        def factory(address):
            return _ExternalRecipient(_addr(address), gl)

        return factory


class _Methods:
    """Dispatches a cross-contract call onto the registered instance, with the
    calling contract as the sender - which is how the callee's access control is
    actually exercised."""

    def __init__(self, gl, address, value=0, deferred=False):
        self._gl = gl
        self._address = address
        self._value = int(value)
        self._deferred = deferred

    def __getattr__(self, name):
        def call(*args, **kwargs):
            if self._deferred:
                return self._gl.post(self._address, name, args, kwargs, self._value)
            return self._gl.dispatch(self._address, name, args, kwargs, self._value)

        return call


class _ContractProxy:
    def __init__(self, gl, address):
        self._gl = gl
        self._address = address

    def view(self, **_kwargs):
        return _Methods(self._gl, self._address)

    def emit(self, value=0, on="finalized"):
        return _Methods(self._gl, self._address, value, deferred=True)

    def emit_transfer(self, value, on="finalized"):
        raise AssertionError(
            "gl.get_contract_at(...).emit_transfer() is the IC->IC form and cannot pay an EOA"
        )

    @property
    def balance(self):
        return u256(self._gl.balances.get(self._address, 0))


class _Gl:
    def __init__(self):
        self.vm = _Vm()
        self.public = _Public()
        self.message = _Message()
        self.message_raw = {
            "datetime": "2026-09-18T12:00:00Z",
            "contract_address": Address("0x" + "00" * 20),
        }
        self.eq_principle = _EqPrinciple()
        self.nondet = _Nondet()
        self.Contract = _Contract
        self.Event = Event
        self.transfers = []
        self.paid = {}
        self.balances = {}
        self.evm = _Evm(self)
        self.contracts = {}
        self.stack = []
        # When False, `emit(...)` queues the message instead of running it, so a
        # test can model a cross-contract write that lands late or never lands.
        self.autodeliver = True
        self.outbox = []

    # -- registry ------------------------------------------------------

    def register(self, address, instance) -> None:
        self.contracts[_addr(address)] = instance

    def current_address(self):
        return self.stack[-1] if self.stack else self.message_raw["contract_address"]

    def get_contract_at(self, address):
        return _ContractProxy(self, _addr(address))

    # -- dispatch ------------------------------------------------------

    def dispatch(self, address, method, args, kwargs, value=0):
        target = self.contracts.get(_addr(address))
        if target is None:
            raise AssertionError(f"no contract registered at {_addr(address).as_hex}")
        sender = self.current_address()
        previous_sender = self.message.sender_address
        previous_value = self.message.value
        self.message.sender_address = sender
        self.message.value = u256(value)
        if value:
            self.balances[_addr(address)] = self.balances.get(_addr(address), 0) + int(value)
        self.stack.append(_addr(address))
        try:
            return getattr(target, method)(*args, **kwargs)
        finally:
            self.stack.pop()
            self.message.sender_address = previous_sender
            self.message.value = previous_value

    def post(self, address, method, args, kwargs, value=0):
        message = {"to": _addr(address), "method": method, "args": args, "kwargs": kwargs, "value": value}
        if self.autodeliver:
            return self.dispatch(address, method, args, kwargs, value)
        self.outbox.append(message)
        return None

    def deliver(self, count=None) -> int:
        """Run queued cross-contract messages, oldest first."""
        delivered = 0
        while self.outbox and (count is None or delivered < count):
            message = self.outbox.pop(0)
            self.dispatch(message["to"], message["method"], message["args"], message["kwargs"], message["value"])
            delivered += 1
        return delivered

    def drop_outbox(self) -> int:
        dropped = len(self.outbox)
        self.outbox.clear()
        return dropped


def _addr(value) -> Address:
    return value if isinstance(value, Address) else Address(value)


def install():
    """Register a fresh fake `genlayer` module and return its `gl` singleton."""
    gl = _Gl()
    Event._sink = []
    module = types.ModuleType("genlayer")
    module.gl = gl
    module.Address = Address
    module.u256 = u256
    module.TreeMap = TreeMap
    module.DynArray = DynArray
    module.allow_storage = allow_storage
    module.__all__ = ["gl", "Address", "u256", "TreeMap", "DynArray", "allow_storage"]
    sys.modules["genlayer"] = module
    return gl


def events(name=None):
    return [e for e in Event._sink if name is None or e[0] == name]
