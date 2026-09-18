// The status normaliser is where a silent "success" comes from, so it is tested
// on its own, with no network and no chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffMs, classify, errorText, statusName } from "../txstatus.mjs";

test("a numeric status ordinal is read as its name", () => {
  // getTransaction returns the ordinal and leaves the name undefined on that
  // RPC path; comparing it against the string list is how a transaction that
  // finalized in seconds looks like it hung forever.
  assert.equal(statusName({ status: 7 }), "FINALIZED");
  assert.equal(statusName({ status: 5 }), "ACCEPTED");
  assert.equal(statusName({ status: "7" }), "FINALIZED");
  assert.equal(statusName({ statusName: "FINALIZED" }), "FINALIZED");
  assert.equal(statusName({ status_name: "accepted" }), "ACCEPTED");
  assert.equal(statusName({}), "UNKNOWN");
});

test("ACCEPTED is not a decision", () => {
  const k = classify({ status: 5 });
  assert.equal(k.done, false);
  assert.equal(k.ok, false);
});

test("FINALIZED without a SUCCESS leader receipt is a failure", () => {
  const reverted = classify({
    status: 7,
    consensus_data: { leader_receipt: [{ execution_result: "ERROR" }] },
  });
  assert.equal(reverted.done, true);
  assert.equal(reverted.ok, false);

  const ok = classify({
    status: 7,
    consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] },
  });
  assert.equal(ok.done, true);
  assert.equal(ok.ok, true);
});

test("a decided state that is not a verdict is not a success", () => {
  for (const status of ["UNDETERMINED", "CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"]) {
    const k = classify({ statusName: status });
    assert.equal(k.done, true, status);
    assert.equal(k.ok, false, status);
  }
});

test("a revert message is pulled out of whichever shape carries it", () => {
  const text = errorText({
    consensus_data: { leader_receipt: [{ result: { payload: { readable: "[EXPECTED] Already claimed" } } }] },
  });
  assert.match(text, /Already claimed/);
  assert.equal(errorText({}), "");
});

test("the poll backs off rather than burning the daily quota", () => {
  assert.equal(backoffMs(0), 4000);
  assert.ok(backoffMs(1) > backoffMs(0));
  assert.equal(backoffMs(20), 20000, "capped");
});
