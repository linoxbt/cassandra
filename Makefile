VENV ?= .venv
PY   := $(VENV)/bin/python
PATH := $(CURDIR)/$(VENV)/bin:$(PATH)

.PHONY: lint test test-direct test-positions test-unit test-all deploy smoke

lint:
	$(VENV)/bin/genvm-lint check contracts/cassandra.py
	$(VENV)/bin/genvm-lint check contracts/positions.py
	$(VENV)/bin/genvm-lint typecheck contracts/cassandra.py
	$(VENV)/bin/genvm-lint typecheck contracts/positions.py

# gltest's direct mode loads exactly one contract class per process, so the two
# contracts' direct suites cannot share a pytest run.
test-direct:
	$(PY) -m pytest tests/direct -q

test-positions:
	$(PY) -m pytest tests/positions -q

test-unit:
	$(PY) -m pytest tests/unit -q

test: test-direct test-positions test-unit

test-all: lint test

deploy:
	cd agent && npm run deploy

smoke:
	cd agent && npm run smoke
