import assert from "node:assert/strict";
import test from "node:test";
import { toFormBody } from "../src/form.js";

test("maps JSON flags onto the panel form fields", () => {
  const body = toFormBody({
    enabled: true,
    clearToken: false,
    shared: true,
    grants: [
      { userId: 4, canControl: true },
      { userId: 9, canControl: false },
    ],
  });
  assert.equal(body.enabled, "on");
  assert.equal(body.clearToken, undefined);
  assert.equal(body.shared, "on");
  assert.equal(body.grant_4, "on");
  assert.equal(body.control_4, "on");
  assert.equal(body.grant_9, "on");
  assert.equal(body.control_9, undefined);
});
