import assert from "node:assert/strict";
import test from "node:test";
import { planRetention } from "./prune-ghcr.mjs";

function version(id, tags, createdAt, name = `sha256:${id}`) {
  return { id, tags, createdAt, name };
}

test("keeps branch, release, and the newest commit tags", () => {
  const versions = [
    version(1, ["main", "sha-aaaaaaa"], "2026-01-01T00:00:00Z"),
    version(2, ["develop", "sha-bbbbbbb"], "2026-02-01T00:00:00Z"),
    version(3, ["master"], "2025-01-01T00:00:00Z"),
    version(4, ["0.12.0"], "2024-01-01T00:00:00Z"),
    version(5, ["v1.2.3"], "2024-06-01T00:00:00Z"),
    version(6, ["sha-ccccccc"], "2026-03-01T00:00:00Z"),
    version(7, ["sha-ddddddd"], "2026-04-01T00:00:00Z"),
    version(8, ["sha-eeeeeee"], "2026-05-01T00:00:00Z"),
    version(9, ["sha-fffffff"], "2026-06-01T00:00:00Z"),
    version(10, ["nightly"], "2026-07-01T00:00:00Z"),
  ];
  const deleted = planRetention(versions, { keepSha: 3 });
  assert.deepEqual(deleted.sort((a, b) => a - b), [6]);
});

test("deletes an untagged manifest that no kept image references", () => {
  const versions = [
    version(1, ["main"], "2026-01-01T00:00:00Z", "sha256:parent"),
    version(2, [], "2026-01-01T00:00:00Z", "sha256:child"),
    version(3, [], "2025-01-01T00:00:00Z", "sha256:orphan"),
  ];
  assert.deepEqual(planRetention(versions, { childDigests: new Set(["sha256:child"]) }), [3]);
  assert.deepEqual(planRetention(versions, { childDigests: new Set(["sha256:child"]), untaggedSafe: false }), []);
});

test("deletes signatures of removed images and keeps signatures of images that stay", () => {
  const versions = [
    version(1, ["main"], "2026-01-01T00:00:00Z", "sha256:aabb"),
    version(2, ["sha256-aabb.sig"], "2026-01-01T00:00:00Z", "sha256:sig1"),
    version(3, ["sha256-ccdd.sig"], "2025-01-01T00:00:00Z", "sha256:sig2"),
    version(4, ["sha256-eeff.att"], "2025-01-01T00:00:00Z", "sha256:att"),
  ];
  assert.deepEqual(planRetention(versions).sort((a, b) => a - b), [3, 4]);
});
