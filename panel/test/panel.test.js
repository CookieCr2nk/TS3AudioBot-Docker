import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actions, buildActionRequest } from "../src/actions.js";
import { decrypt, encrypt, tokensEqual } from "../src/crypto.js";
import { presentBotList, presentHistory, presentPlaylists, presentSearch, presentStatus } from "../src/present.js";
import { loadSchemaSql, statementsFromSchema } from "../src/schema.js";
import { buildApiPath, scope, statusParts } from "../src/ts3ab.js";
import {
  assertBaseUrl,
  parsePassword,
  parseVolume,
  splitApiCredential,
} from "../src/validate.js";

process.env.TOKEN_KEY = "test-token-key-value";

const templateBot = { useInstance: true, instanceMode: "template", instanceRef: "default" };
const user = { role: "user", canControl: true };
const reader = { role: "user", canControl: false };
const admin = { role: "admin", canControl: true };

describe("api paths", () => {
  it("wraps template commands the way the official client does", () => {
    assert.equal(buildApiPath(statusParts(templateBot)), "/bot/template/default/(/json/merge/(/song)/(/volume)/(/repeat)/(/random)/(/info))");
  });

  it("uses a running id when configured that way", () => {
    const bot = { useInstance: true, instanceMode: "id", instanceRef: "3" };
    assert.equal(buildApiPath(scope(bot, ["song"])), "/bot/use/3/(/song)");
  });

  it("skips the bot context when the mode is none", () => {
    const bot = { useInstance: false, instanceMode: "none", instanceRef: "" };
    assert.equal(buildApiPath(scope(bot, ["song"])), "/song");
  });

  it("encodes a resource so it cannot close the command", () => {
    const built = buildActionRequest(templateBot, "play", { resource: "http://x/(/quit" }, user);
    const path = buildApiPath(built.parts);
    assert.equal(path, "/bot/template/default/(/play/http%3A%2F%2Fx%2F%28%2Fquit)");
    assert.equal(path.includes("/(/quit"), false);
  });

  it("disconnects the posted instance, not the saved template", () => {
    const built = buildActionRequest(templateBot, "disconnect", { instanceId: "7" }, admin);
    assert.equal(buildApiPath(built.parts), "/bot/use/7/(/bot/disconnect)");
  });
});

describe("action guard", () => {
  it("rejects unknown and dangerous command names", () => {
    assert.throws(() => buildActionRequest(templateBot, "quit", {}, admin), /Unbekannte Aktion/);
    for (const name of ["quit", "eval", "rights", "system", "api"]) {
      assert.equal(actions[name], undefined);
    }
  });

  it("blocks playback without control and hosting actions for users", () => {
    assert.throws(() => buildActionRequest(templateBot, "play", { resource: "https://example.com/a" }, reader), /Steuerrechte/);
    assert.throws(() => buildActionRequest(templateBot, "disconnect", { instanceId: "1" }, user), /Administratoren/);
  });

  it("requires an explicit confirm before deleting a playlist", () => {
    assert.throws(() => buildActionRequest(templateBot, "list-delete", { listId: "mix" }, user), /bestätigt/);
    const built = buildActionRequest(templateBot, "list-delete", { listId: "mix", confirm: "on" }, user);
    assert.equal(buildApiPath(built.parts), "/bot/template/default/(/list/delete/mix)");
  });
});

describe("status and lists", () => {
  it("reads the merged song payload", () => {
    const status = presentStatus([
      { Title: "Sonne", Source: "https://youtu.be/x", Length: 180, Position: 30, Paused: false },
      42,
      1,
      false,
      {
        Title: "Queue",
        PlaybackIndex: 0,
        SongCount: 1,
        Items: [{ Title: "Sonne", Link: "https://youtu.be/x", AudioType: "youtube" }],
      },
    ]);
    assert.equal(status.song.title, "Sonne");
    assert.equal(status.song.positionLabel, "0:30");
    assert.equal(status.song.lengthLabel, "3:00");
    assert.equal(status.volume, 42);
    assert.equal(status.repeat, "one");
    assert.equal(status.shuffle, false);
    assert.equal(status.queue.items[0].title, "Sonne");
    assert.equal(status.problems.length, 0);
  });

  it("normalizes playlists, history and bot rows", () => {
    assert.deepEqual(presentPlaylists([{ Id: "mix", Title: "Mix", SongCount: 2 }]), [
      { id: "mix", title: "Mix", count: 2 },
    ]);
    assert.equal(presentHistory([{ Id: 4, Title: "Alt", AudioType: "youtube" }])[0].id, 4);
    assert.equal(presentSearch("0: Sonne\n1: Ich will")[1].title, "Ich will");
    assert.deepEqual(presentBotList([
      { Id: null, Name: "default", Server: "ts.example.com", Status: 0 },
      { Id: 2, Name: "lobby", Server: "", Status: "Connected" },
    ]), [
      { id: null, name: "default", server: "ts.example.com", status: "offline", statusLabel: "Offline" },
      { id: 2, name: "lobby", server: "", status: "connected", statusLabel: "Verbunden" },
    ]);
  });
});

describe("input", () => {
  it("accepts the compose hostname and rejects metadata and credentials", () => {
    assert.equal(assertBaseUrl("http://ts3audiobot:58913/"), "http://ts3audiobot:58913");
    assert.throws(() => assertBaseUrl("http://169.254.169.254/"), /nicht erlaubt/);
    assert.throws(() => assertBaseUrl("http://user:pass@bot:58913"), /Zugangsdaten/);
    assert.throws(() => assertBaseUrl("http://bot:58913/api"), /Host und Port/);
    assert.throws(() => assertBaseUrl("file:///etc/passwd"), /http/);
  });

  it("splits a pasted api token", () => {
    assert.deepEqual(splitApiCredential("", "uid123=:secret"), { user: "uid123=", secret: "secret" });
  });

  it("limits volume and passwords", () => {
    assert.equal(parseVolume("0"), 0);
    assert.equal(parseVolume("100"), 100);
    assert.throws(() => parseVolume("101"));
    assert.throws(() => parseVolume("-1"));
    assert.throws(() => parsePassword("short"));
  });
});

describe("secrets and schema", () => {
  it("roundtrips a token", () => {
    const payload = encrypt("tök:en/+= ");
    assert.equal(decrypt(payload), "tök:en/+= ");
    assert.notEqual(payload.includes("tök"), true);
  });

  it("compares tokens without accepting a different length", () => {
    assert.equal(tokensEqual("abc", "abc"), true);
    assert.equal(tokensEqual("abc", "abcd"), false);
    assert.equal(tokensEqual("", ""), false);
  });

  it("loads five tables from the schema file", () => {
    const statements = statementsFromSchema(loadSchemaSql());
    assert.equal(statements.length, 5);
    for (const statement of statements) assert.match(statement, /^CREATE TABLE/i);
  });
});
