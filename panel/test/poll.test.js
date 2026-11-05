import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startPolling } from "../client/src/poll.js";

function fakeDocument() {
  const listeners = new Set();
  return {
    hidden: false,
    addEventListener: (name, fn) => listeners.add(fn),
    removeEventListener: (name, fn) => listeners.delete(fn),
    show() {
      this.hidden = false;
      for (const fn of listeners) fn();
    },
    get listeners() {
      return listeners.size;
    },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("polling", () => {
  it("never runs two pulls at once", async () => {
    let active = 0;
    let most = 0;
    let calls = 0;
    const doc = fakeDocument();
    const stop = startPolling(async () => {
      calls += 1;
      active += 1;
      most = Math.max(most, active);
      await wait(30);
      active -= 1;
    }, 5, { doc });
    await wait(120);
    stop();
    assert.equal(most, 1);
    assert.ok(calls >= 2 && calls <= 5, String(calls));
    assert.equal(doc.listeners, 0);
  });

  it("pauses while the page is hidden and pulls when it shows again", async () => {
    let calls = 0;
    const doc = fakeDocument();
    doc.hidden = true;
    const stop = startPolling(async () => { calls += 1; }, 5, { doc });
    await wait(40);
    assert.equal(calls, 0);
    doc.show();
    await wait(1);
    assert.equal(calls, 1);
    stop();
    const before = calls;
    await wait(30);
    assert.equal(calls, before);
  });

  it("waits one interval first when immediate is off and keeps going after a failure", async () => {
    let calls = 0;
    const doc = fakeDocument();
    const stop = startPolling(async () => {
      calls += 1;
      throw new Error("down");
    }, 10, { doc, immediate: false });
    assert.equal(calls, 0);
    await wait(60);
    stop();
    assert.ok(calls >= 2, String(calls));
  });
});
