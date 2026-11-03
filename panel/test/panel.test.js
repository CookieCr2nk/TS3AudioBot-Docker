import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { after, describe, it } from "node:test";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { loginDecision, missingLiveBot, serverErrorLog, signedInUser } from "../src/api.js";
import { createApp, panelRoot } from "../src/app.js";
import { canDeleteBot, pool } from "../src/db.js";
import { HttpError, Ts3ApiError, failureFor } from "../src/errors.js";
import { actions, buildActionRequest, commanderSaved, hostingCalls, hostingLiveMessage, liveMoveParts, liveRenameParts, ownLiveId, parseBulk, settingsRecord, templateIsConnected, withCommander, withPlay } from "../src/actions.js";
import { hostingChanges } from "../client/src/hostingForm.js";
import { decrypt, encrypt, tokensEqual } from "../src/crypto.js";
import { rateLimit } from "../src/http.js";
import { hashPassword, verifyPassword } from "../src/passwords.js";
import { catalogs, clientJson, languageChoice, languageFromHeader, languages, resolveLanguage, translate, translator } from "../src/i18n.js";
import { countRunningBots, displayStreamUrl, presentBotList, presentClientChannel, presentCommander, presentSearch, presentSendMode, presentSetting, presentStatus, presentTsIdentity, presentWhisper } from "../src/present.js";
import { applyMigrations, legacyMigrations, loadMigrations, migrationFromSource } from "../src/schema.js";
import { apiHeaders, buildApiPath, scope, statusParts } from "../src/ts3ab.js";
import {
  assertBaseUrl,
  parseBotLimit,
  parseHostingSettings,
  parseOptionalPassword,
  parsePassword,
  parseStreamUrl,
  parseVolume,
  splitApiCredential,
} from "../src/validate.js";

process.env.TOKEN_KEY = "test-token-key-value";

after(() => pool.end());

const templateBot = { useInstance: true, instanceMode: "template", instanceRef: "default" };
const user = { role: "user", canControl: true };
const reader = { role: "user", canControl: false };
const admin = { role: "admin", canControl: true };

describe("api paths", () => {
  it("wraps template commands the way the official client does", () => {
    assert.equal(buildApiPath(statusParts(templateBot)), "/bot/template/default/(/json/merge/(/song)/(/volume)/(/repeat)/(/random)/(/info/0/20))");
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

  it("sends no authorization header when the bot has no token", () => {
    assert.equal("Authorization" in apiHeaders({ apiUser: "", apiToken: null }), false);
    const authed = apiHeaders({ apiUser: "uid", apiToken: "secret" });
    assert.equal(authed.Authorization, `Basic ${Buffer.from("uid:secret", "utf8").toString("base64")}`);
  });
});

describe("action guard", () => {
  it("rejects unknown and dangerous command names", () => {
    assert.throws(() => buildActionRequest(templateBot, "quit", {}, admin), /Unknown action/);
    for (const name of ["quit", "eval", "rights", "system", "api"]) {
      assert.equal(actions[name], undefined);
    }
  });

  it("accepts one playback action for several bots and rejects the rest", () => {
    assert.deepEqual(parseBulk({ op: "start", ids: [1, "2", 2] }), { op: "start", ids: [1, 2] });
    assert.equal(parseBulk({ op: "stop", ids: [4] }).op, "stop");
    assert.throws(() => parseBulk({ op: "play", ids: [3], resource: "https://example.com/a.mp3" }), /Unknown action/);
    assert.throws(() => parseBulk({ op: "disconnect", ids: [1], instanceId: "1" }), /Unknown action/);
    assert.throws(() => parseBulk({ op: "bot-setup", ids: [1], key: "abcdefgh" }), /Unknown action/);
    assert.throws(() => parseBulk({ op: "start", ids: [] }), /at least one/);
    assert.throws(() => parseBulk({ op: "stop", ids: ["nope"] }), /invalid/);
    assert.throws(() => parseBulk({ op: "start", ids: Array.from({ length: 26 }, (_, index) => index + 1) }), /at most/);
  });

  it("counts a bulk action in one step and keeps the limit when the batch does not fit", () => {
    const key = `bulk-test-${Date.now()}`;
    assert.equal(rateLimit(key, 3, 60_000, 1), true);
    assert.equal(rateLimit(key, 3, 60_000, 3), false);
    assert.equal(rateLimit(key, 3, 60_000, 2), true);
    assert.equal(rateLimit(key, 3, 60_000, 1), false);
  });

  it("blocks playback without control and hosting actions for users", () => {
    assert.throws(() => buildActionRequest(templateBot, "play", { resource: "https://example.com/a" }, reader), /control rights/);
    assert.throws(() => buildActionRequest(templateBot, "disconnect", { instanceId: "1" }, reader), /control rights/);
    assert.equal(buildApiPath(buildActionRequest(templateBot, "disconnect", { instanceId: "1" }, user).parts), "/bot/use/1/(/bot/disconnect)");
  });

  it("keeps hosting secrets out of the audit text", () => {
    const hosting = buildActionRequest(
      templateBot,
      "template-hosting",
      { name: "lobby", nickname: "Music", serverPassword: "s3cret-pass", bitrate: "48", run: "on" },
      admin,
    );
    assert.equal(hosting.parts, null);
    assert.equal(JSON.stringify(hosting.action.detail(hosting.args)).includes("s3cret-pass"), false);
    assert.equal(hosting.args.serverPassword, "s3cret-pass");
    assert.deepEqual(hostingCalls(parseHostingSettings({ name: "lobby", volume: "40" })), [
      ["settings", "bot", "set", "lobby", "audio.volume.default", "40"],
    ]);
    assert.throws(() => buildActionRequest(templateBot, "template-hosting", { name: "lobby" }, admin), /at least one/);
    const opened = buildActionRequest(templateBot, "template-hosting", { name: "lobby", nickname: "Music" }, user);
    assert.equal(opened.args.nickname, "Music");
    assert.throws(() => buildActionRequest(templateBot, "template-hosting", { name: "lobby", nickname: "Music" }, reader), /control rights/);
    const remembered = settingsRecord(parseHostingSettings({
      name: "lobby",
      nickname: "Music",
      channel: "/5",
      serverPassword: "s3cret-pass",
      startup: "https://user:pass@example.com/a",
    }));
    assert.equal(JSON.stringify(remembered).includes("s3cret-pass"), false);
    assert.equal(JSON.stringify(remembered).includes("user:pass"), false);
    assert.equal(remembered.serverPassword, 1);
    assert.equal(remembered.startup, "https://example.com/a");
    assert.equal(settingsRecord({ address: "voice.example:9987" }).address, "voice.example:9987");
    assert.equal("address" in remembered, false);
    assert.deepEqual(hostingChanges({
      nickname: "Music",
      channel: "/5",
      bitrate: "48",
      volume: "40",
      run: "on",
    }, { nickname: "Music", channel: "/5", bitrate: 48, volume: 40, run: true }), {});
    assert.deepEqual(hostingChanges({ nickname: "Night", channel: "/5" }, { nickname: "Music", channel: "/5" }), { nickname: "Night" });
    assert.deepEqual(hostingChanges({ nickname: "", channel: "/8" }, { nickname: "Music", channel: "/5" }), { nickname: null, channel: "/8" });
    assert.deepEqual(hostingChanges({ nickname: "", channel: "" }, { nickname: "Music", channel: "/5" }), { nickname: null, channel: null });
    assert.deepEqual(hostingChanges({ channel: "", bitrate: "", serverPassword: "" }, { channel: "/5", bitrate: 48 }), { channel: null });
    assert.deepEqual(hostingChanges({ channel: "" }, {}), {});
    assert.deepEqual(hostingChanges({ startup: "" }, { startup: "" }), {});
    assert.deepEqual(hostingChanges({ startup: "" }, { startup: "https://example.com/a" }), { clearStartup: "on" });
    assert.deepEqual(hostingChanges({ startup: "https://example.com/a" }, { startup: "https://example.com/a" }), {});
    assert.deepEqual(hostingChanges({ startup: "https://example.com/b" }, { startup: "https://example.com/a" }), { startup: "https://example.com/b" });
    assert.deepEqual(hostingChanges({ streamId: "4" }, {}), { streamId: "4" });
    assert.deepEqual(hostingChanges({ streamId: "4", startup: "https://example.com/a" }, {}), { streamId: "4" });
    assert.deepEqual(hostingChanges({ streamId: "4", startup: "" }, { startupStreamId: 4, startup: "https://example.com/a" }), {});
    assert.deepEqual(hostingChanges({ streamId: "4", startup: "https://example.com/a" }, { startupStreamId: 4, startup: "https://example.com/a" }), {});
    assert.deepEqual(hostingChanges({ streamId: "5", startup: "https://example.com/b" }, { startupStreamId: 4, startup: "https://example.com/a" }), { streamId: "5" });
    assert.deepEqual(hostingChanges({ startup: "" }, { startupStreamId: 4, startup: "https://example.com/a" }), { clearStartup: "on" });
    assert.deepEqual(hostingChanges({ run: "off" }, { run: true }), { run: "off" });
    assert.equal(ownLiveId([{ Id: 7, Name: "lobby", Status: 2 }], "lobby"), "7");
    assert.equal(ownLiveId([{ Id: 7, Name: "other", Status: 2 }], "lobby"), "");
    const stream = buildActionRequest(
      templateBot,
      "template-hosting",
      { name: "lobby", startup: "https://user:pass@example.com/a'b(!quit)" },
      admin,
    );
    assert.equal(JSON.stringify(stream.action.detail(stream.args)).includes("pass"), false);
    assert.equal(stream.args.startupCommand, "!play 'https://user:pass@example.com/a\\'b(!quit)'");
    const stored = buildApiPath(["settings", "bot", "set", "lobby", "events.onconnect", stream.args.startupCommand]);
    assert.equal(stored.includes("quit)"), false);
    assert.equal(decodeURIComponent(stored).includes(stream.args.startupCommand), true);
    const cleared = parseHostingSettings({ name: "lobby", clearStartup: "on" });
    assert.deepEqual(hostingCalls(cleared), []);
    const resetChannel = parseHostingSettings({ name: "lobby", channel: null });
    assert.equal(resetChannel.channel, null);
    assert.equal(resetChannel.nickname, undefined);
    assert.deepEqual(hostingCalls(resetChannel), [["settings", "bot", "set", "lobby", "connect.channel"]]);
    assert.equal(buildApiPath(hostingCalls(resetChannel)[0]), "/settings/bot/set/lobby/connect.channel");
    assert.equal(settingsRecord(resetChannel).channel, null);
    assert.equal("nickname" in settingsRecord(resetChannel), false);
    assert.equal(withPlay("!xecute (!bot commander on) (!play 'old')", null), "!bot commander on");
    const quotedPlay = "!play 'https://example.com/a)(b'";
    assert.equal(withCommander(quotedPlay, true), `!xecute (!bot commander on) (${quotedPlay})`);
    assert.equal(withPlay(`!xecute (!bot commander on) (${quotedPlay})`, null), "!bot commander on");
    assert.throws(() => withPlay("!xecute (!play 'open)", null), /connect script/);
    assert.equal(withPlay("!bot commander on", stream.args.startupCommand).startsWith("!xecute (!bot commander on) ("), true);
    assert.throws(() => parseHostingSettings({ name: "lobby", startup: "https://example.com/a", clearStartup: "on" }), /Clear the startup/);
    assert.equal(buildApiPath(liveRenameParts("lobby", "A(B)")), "/bot/template/lobby/(/bot/name/A%28B%29)");
    assert.equal(templateIsConnected([{ Name: "lobby", Status: 2 }], "lobby"), true);
    assert.equal(templateIsConnected([{ Name: "lobby", Status: "Offline" }], "lobby"), false);

    const commander = buildActionRequest(templateBot, "commander", { mode: "on" }, admin);
    assert.equal(commander.parts, null);
    assert.equal(commander.action.detail(commander.args).key, "Channel commander is on");
    assert.equal(withCommander("!play 'https://example.com/a'", true), "!xecute (!bot commander on) (!play 'https://example.com/a')");
    assert.equal(withCommander("!xecute (!bot commander on) (!play 'https://example.com/a')", false), "!play 'https://example.com/a'");
    assert.equal(commanderSaved("!bot commander on"), true);
    assert.equal(commanderSaved("!play 'https://example.com/a'"), false);
    assert.equal(canDeleteBot({ id: 4, role: "user" }, { assigneeUserId: 4 }), true);
    assert.equal(canDeleteBot({ id: 4, role: "user" }, { assigneeUserId: 9 }), false);
    assert.equal(canDeleteBot({ id: 4, role: "user" }, { assigneeUserId: null, ownerUserId: 4 }), false);
    assert.equal(canDeleteBot({ id: 1, role: "admin" }, { assigneeUserId: 9 }), true);
    assert.equal(hostingLiveMessage({ nickname: true, channel: true, connected: false }), "Connection settings saved. The nickname and channel apply when this bot connects.");
    assert.equal(hostingLiveMessage({ channel: true, connected: true, moveOk: true }), "Connection settings saved. The bot moved to that channel.");
    assert.equal(hostingLiveMessage({ channel: true, connected: true, moveOk: false }), "Connection settings saved. The bot could not be moved.");
    assert.equal(hostingLiveMessage({ nickname: true, connected: true, nicknameOk: true }), "Connection settings saved. The nickname is updated.");
    assert.equal(buildApiPath(liveMoveParts("lobby", "/5")), "/bot/template/lobby/(/bot/move/%2F5)");
    const moved = buildActionRequest(templateBot, "move", { channel: "/5" }, admin);
    assert.equal(buildApiPath(moved.parts), "/bot/template/default/(/bot/move/%2F5)");
    assert.equal(JSON.stringify(moved.parts).includes("connect.channel"), false);
    assert.throws(() => buildActionRequest(templateBot, "move", { channel: "/5" }, reader), /control rights/);
    assert.throws(() => buildActionRequest(templateBot, "commander", { mode: "on" }, reader), /control rights/);
    assert.equal(buildActionRequest(templateBot, "move", { channel: "/5" }, user).args.channel, "/5");
    assert.throws(() => buildActionRequest(templateBot, "commander", { mode: "maybe" }, admin), /invalid/);
    assert.throws(() => buildActionRequest(templateBot, "bot-setup", { key: "abcdefgh" }, admin), /Unknown action/);
    assert.equal(presentCommander({ Value: true }), true);
    assert.equal(presentCommander(false), false);
    assert.equal(presentCommander("later"), null);
    assert.equal(presentWhisper({ SendMode: "Whisper" }), "whisper");
    assert.equal(presentWhisper({ Value: { SendMode: 1 } }), "voice");
    assert.equal(presentWhisper({ SendMode: "WhisperGroup" }), "group");
    assert.equal(presentWhisper("none"), "none");
    assert.equal(presentWhisper({ SendMode: "later" }), null);
    assert.equal(presentSendMode(" whisper "), "whisper");
    assert.equal(presentSendMode("VOICE"), "voice");
    assert.equal(presentSendMode("!whisper off"), "custom");
    assert.equal(presentSendMode(""), null);
    assert.equal(presentClientChannel({ ChannelId: { Value: 12 } }), "12");
    assert.equal(presentClientChannel({ ChannelId: 0 }), "");
    const whispered = buildActionRequest(templateBot, "whisper", { mode: "whisper" }, admin);
    assert.equal(whispered.parts, null);
    assert.equal(whispered.args.mode, "whisper");
    assert.equal(whispered.action.detail(whispered.args).key, "Whisper is on");
    assert.equal(buildActionRequest(templateBot, "whisper", { mode: "voice" }, user).args.mode, "voice");
    assert.throws(() => buildActionRequest(templateBot, "whisper", { mode: "all" }, admin), /invalid/);
    assert.throws(() => buildActionRequest(templateBot, "whisper", { mode: "whisper" }, reader), /control rights/);
    assert.equal(presentSetting({ Value: "!bot commander on" }), "!bot commander on");
    assert.equal(presentTsIdentity({ Uid: { Value: "uidvalue=" }, Id: 12 }).uid, "uidvalue=");
    assert.equal(presentTsIdentity({ Uid: { Value: "uidvalue=" }, Id: 12 }).clientId, "12");
  });

});

describe("offline status and login", () => {
  it("treats only a missing live bot as offline", () => {
    assert.equal(missingLiveBot("This bot does not exist."), true);
    assert.equal(missingLiveBot("Bot API timed out"), false);
    assert.equal(missingLiveBot("Bot API is unreachable"), false);
    assert.equal(missingLiveBot("This bot does not exist"), false);
  });

  it("logs a bot API failure as one line or not at all", () => {
    assert.equal(serverErrorLog(new Ts3ApiError("This bot does not exist.")), "skip");
    assert.equal(serverErrorLog(new Ts3ApiError("Bot API timed out")), "line");
    assert.equal(serverErrorLog(new Ts3ApiError("Bot API is unreachable")), "line");
    assert.equal(serverErrorLog(new Ts3ApiError("Bot said no")), "skip");
    assert.equal(serverErrorLog(new HttpError("Broken", 500)), "dump");
    assert.equal(serverErrorLog(new Error("boom")), "dump");
    assert.equal(serverErrorLog(new HttpError("Username or password is wrong.", 401)), "skip");
  });

  it("does not reveal a suspended account until the password matches", () => {
    const suspended = { id: 3, suspended: 1 };
    assert.equal(loginDecision({ user: null, valid: false }), "invalid");
    assert.equal(loginDecision({ user: suspended, valid: false }), "invalid");
    assert.equal(loginDecision({ user: suspended, valid: true }), "suspended");
    assert.equal(loginDecision({ user: { id: 3, suspended: 0 }, valid: true }), "ok");
  });

  it("keeps can create bots on the signed-in user", () => {
    assert.equal(signedInUser({ id: 4, username: "ada", role: "user", can_create_bots: 1 }).canCreateBots, true);
    assert.equal(signedInUser({ id: 4, username: "ada", role: "user", can_create_bots: 0 }).canCreateBots, false);
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

  it("normalizes search and bot rows", () => {
    assert.equal(presentSearch("0: Sonne\n1: Ich will")[1].title, "Ich will");
    assert.equal(countRunningBots([
      { status: "connected", name: "default" },
      { status: "connecting", name: "lobby" },
      { status: "offline", name: "quiet" },
    ], ["default", "quiet", "missing"]), 1);
    assert.equal(countRunningBots([
      { status: "connected", name: "default" },
      { status: "offline", name: "quiet" },
    ], null), 1);
    assert.deepEqual(presentBotList([
      { Id: null, Name: "default", Server: "ts.example.com", Status: 0 },
      { Id: 2, Name: "lobby", Server: "", Status: "Connected" },
    ]), [
      { id: null, name: "default", server: "ts.example.com", status: "offline", statusLabel: "Offline" },
      { id: 2, name: "lobby", server: "", status: "connected", statusLabel: "Connected" },
    ]);
  });
});

describe("input", () => {
  it("accepts the compose hostname and rejects metadata and credentials", () => {
    assert.equal(assertBaseUrl("http://ts3audiobot:58913/"), "http://ts3audiobot:58913");
    assert.throws(() => assertBaseUrl("http://169.254.169.254/"), /not allowed/);
    assert.throws(() => assertBaseUrl("http://user:pass@bot:58913"), /credentials/);
    assert.throws(() => assertBaseUrl("http://bot:58913/api"), /host and a port/);
    assert.throws(() => assertBaseUrl("file:///etc/passwd"), /http/);
  });

  it("splits a pasted api token and allows an empty credential", () => {
    assert.deepEqual(splitApiCredential("", "uid123=:secret"), { user: "uid123=", secret: "secret" });
    assert.deepEqual(splitApiCredential("", ""), { user: "", secret: "" });
    assert.deepEqual(splitApiCredential("uid", "", { keepExisting: true }), { user: "uid", secret: null });
    assert.deepEqual(splitApiCredential("uid", "secret", { clear: true }), { user: "", secret: "" });
    assert.throws(() => splitApiCredential("uid", ""), /together/);
  });

  it("accepts a stream address and hides credentials in the label", () => {
    assert.equal(parseStreamUrl("https://example.com/live"), "https://example.com/live");
    const stored = parseStreamUrl("https://user:pass@example.com/stream");
    assert.equal(stored.includes("user:pass@"), true);
    assert.equal(displayStreamUrl(stored).includes("user"), false);
    assert.equal(displayStreamUrl(stored).includes("pass"), false);
    assert.throws(() => parseStreamUrl("http://169.254.169.254/latest"), /not allowed/);
    assert.throws(() => parseStreamUrl("file:///etc/passwd"), /http/);
    const hosting = parseHostingSettings({ name: "lobby", channel: "/5", bitrate: "8", run: "off" });
    assert.equal(hosting.channel, "/5");
    assert.equal(hosting.bitrate, 8);
    assert.equal(hosting.run, false);
    assert.throws(() => parseHostingSettings({ name: "lobby", bitrate: "7" }), /8 and 98/);
    assert.equal(parseBotLimit(""), null);
    assert.equal(parseBotLimit("0"), 0);
    assert.equal(parseBotLimit("12"), 12);
    assert.throws(() => parseBotLimit("-1"), /Bot limit/);
    assert.throws(() => parseBotLimit("10001"), /Bot limit/);
  });

  it("limits volume and passwords", () => {
    assert.equal(parseVolume("0"), 0);
    assert.equal(parseVolume("100"), 100);
    assert.throws(() => parseVolume("101"));
    assert.throws(() => parseVolume("-1"));
    assert.throws(() => parsePassword("short"));
    assert.equal(parseOptionalPassword(""), null);
    assert.equal(parseOptionalPassword("longenough1"), "longenough1");
    assert.throws(() => parseOptionalPassword("short"));
  });
});

describe("secrets and schema", () => {
  it("roundtrips a token", () => {
    const payload = encrypt("tök:en/+= ");
    assert.equal(decrypt(payload), "tök:en/+= ");
    assert.notEqual(payload.includes("tök"), true);
  });

  it("rejects an overlong password instead of matching its prefix", async () => {
    const hash = await hashPassword("correct-horse");
    assert.equal(await verifyPassword("correct-horse", hash), true);
    assert.equal(await verifyPassword(`${"x".repeat(200)}correct-horse`, hash), false);
    assert.equal(await verifyPassword("correct-horse", null), false);
  });

  it("compares tokens without accepting a different length", () => {
    assert.equal(tokensEqual("abc", "abc"), true);
    assert.equal(tokensEqual("abc", "abcd"), false);
    assert.equal(tokensEqual("", ""), false);
  });

  it("loads one schema and keeps the old migration checksums", () => {
    const migrations = loadMigrations();
    assert.deepEqual(migrations.map((migration) => migration.version), ["001_schema"]);
    const creates = migrations[0].statements.filter((statement) => /^CREATE TABLE/i.test(statement));
    assert.deepEqual(
      creates.map((statement) => statement.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i)[1]),
      ["users", "sessions", "instances", "ts_bots", "instance_grants", "radio_streams", "audit_log"],
    );
    const schema = migrations[0].statements.join("\n");
    assert.match(schema, /password_hash VARCHAR\(255\) NULL/);
    assert.match(schema, /bot_limit INT UNSIGNED NULL/);
    assert.match(schema, /can_create_bots TINYINT\(1\) NOT NULL DEFAULT 0/);
    assert.match(schema, /assignee_user_id BIGINT UNSIGNED NULL/);
    assert.match(schema, /uq_ts_bots_instance_template/);
    assert.match(schema, /connect_nickname VARCHAR\(30\) NULL/);
    assert.match(schema, /connect_server_password TINYINT NOT NULL DEFAULT 0/);
    assert.match(schema, /connect_address VARCHAR\(200\) NULL/);
    assert.match(schema, /fk_audit_ts_bot/);
    assert.equal(/CREATE TABLE IF NOT EXISTS bots\b/i.test(schema), false);
    assert.equal(/bot_admins/i.test(schema), false);
    assert.deepEqual(
      legacyMigrations().map((migration) => [migration.version, migration.checksum]),
      [
        ["001_baseline", "5f20be8d7a40ffbbb0da753cc316b6835fe74f3f31680438fa3f57b584001cdf"],
        ["002_radio_streams", "2bcf7698fe793d3712063595415ff907d7570b8521a0c5a9dc21f9df66eaba32"],
        ["003_hosting", "43812584c1a32fc2452fa692b0dc2270040c1b6ee7e740b1abf35055a3ad3e24"],
        ["004_drop_legacy_bots", "0bfb87741a93580131781db6ef74602f65777ac2f268d85c78658542955b1b50"],
        ["005_bot_limit", "5cb04c3a1cedaa1e88c8f6c15033f98050d9f4046f9c61dd14003df4defc5696"],
        ["006_bot_access", "53411ea16d90980f6f17876de5303e92803d308a99b04b120781b60f3877a72a"],
        ["007_bot_label", "28291370ba2c4f2daf8b1262bdc429a150bf88ff825793d47a098cda1f949216"],
        ["008_bot_template", "4b8e55f16789cfb9860ca402bbaa1989c8363700c41b92dc14eddbbae104916e"],
        ["009_bot_admins", "702e14886530ddedaaf4561cbb46a15bf4d3c6acf93d908bfb9f9856b3b690db"],
        ["010_drop_bot_admins", "5d334e0a7ac000fc08d1c3390a4ad93945bb070107459002badce5e2dcfa14d2"],
        ["011_bot_settings", "f205d3e0ef8d6765506cd310b816c99a7a2d29ca95eb6cadbba0dfa05b2610d0"],
        ["012_bot_address", "b9f0c2adf881566b906efc68c2cf8ce1c6f73722eb9b09135ac84b75c2b1c470"],
      ],
    );
    const crlf = migrationFromSource("009_sample", "SELECT 1;\r\n");
    const lf = migrationFromSource("009_sample", "SELECT 1;\n");
    assert.equal(crlf.checksum, lf.checksum);
  });

  it("applies the schema once and refuses a changed or unknown version", async () => {
    const migrations = loadMigrations();
    const { pool, applied, calls } = memoryPool();
    const lines = await captureLogs(async () => {
      await applyMigrations(pool, migrations);
      await applyMigrations(pool, migrations);
    });
    assert.deepEqual(
      lines.filter((line) => line.startsWith("[panel] Applied database migration")),
      ["[panel] Applied database migration 001_schema"],
    );
    assert.equal(lines.filter((line) => line === "[panel] Database schema is current").length, 1);
    assert.equal(calls.filter((sql) => /INSERT INTO schema_migrations/i.test(sql)).length, 1);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].version, "001_schema");

    const changed = migrations.map((migration, index) =>
      index === 0 ? { ...migration, checksum: "0".repeat(64) } : migration,
    );
    await assert.rejects(() => applyMigrations(pool, changed), /changed after it was applied/);
    await assert.rejects(
      () => applyMigrations(memoryPool([{ version: "009_custom", checksum: "abc" }]).pool, migrations),
      /does not include/,
    );
  });

  it("replaces a finished migration history without running the schema again", async () => {
    const migrations = loadMigrations();
    const { pool, applied, calls } = memoryPool(legacyRows(12), { transactional: true });
    const lines = await captureLogs(() => applyMigrations(pool, migrations));
    assert.equal(lines.includes("[panel] Replaced applied migration history with 001_schema"), true);
    assert.equal(lines.some((line) => line.startsWith("[panel] Applying database migration 011_")), false);
    assert.equal(calls.some((sql) => /CREATE TABLE IF NOT EXISTS ts_bots/i.test(sql)), false);
    assert.equal(calls.includes("BEGIN"), true);
    assert.equal(calls.includes("COMMIT"), true);
    assert.deepEqual(applied.map((row) => row.version), ["001_schema"]);
    assert.equal(applied[0].checksum, migrations[0].checksum);
  });

  it("adds the connection columns for a release 1.0 database and then replaces that history", async () => {
    const migrations = loadMigrations();
    const through010 = memoryPool(legacyRows(10), { transactional: true });
    const lines010 = await captureLogs(() => applyMigrations(through010.pool, migrations));
    assert.equal(lines010.includes("[panel] Applied database migration 011_bot_settings"), true);
    assert.equal(lines010.includes("[panel] Applied database migration 012_bot_address"), true);
    assert.equal(through010.calls.filter((sql) => /ADD COLUMN IF NOT EXISTS connect_/i.test(sql)).length, 9);
    assert.deepEqual(through010.applied.map((row) => row.version), ["001_schema"]);

    const through011 = memoryPool(legacyRows(11), { transactional: true });
    const lines011 = await captureLogs(() => applyMigrations(through011.pool, migrations));
    assert.equal(lines011.some((line) => line.startsWith("[panel] Applying database migration 011_")), false);
    assert.equal(lines011.includes("[panel] Applied database migration 012_bot_address"), true);
    assert.deepEqual(
      through011.calls.filter((sql) => /ALTER TABLE/i.test(sql)),
      ["ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_address VARCHAR(200) NULL"],
    );
    assert.deepEqual(through011.applied.map((row) => row.version), ["001_schema"]);
  });

  it("refuses a migration history this panel cannot finish", async () => {
    const migrations = loadMigrations();
    const stopped = memoryPool(legacyRows(8));
    await assert.rejects(
      () => applyMigrations(stopped.pool, migrations),
      /history through 008_bot_template and this panel cannot finish it/,
    );
    assert.equal(stopped.calls.some((sql) => /ALTER TABLE|DELETE FROM schema_migrations/i.test(sql)), false);

    const gap = legacyRows(10).concat(legacyRows(12).slice(11));
    await assert.rejects(
      () => applyMigrations(memoryPool(gap).pool, migrations),
      /012_bot_address without the earlier panel migrations/,
    );

    const changed = legacyRows(12);
    changed[0] = { ...changed[0], checksum: "0".repeat(64) };
    await assert.rejects(
      () => applyMigrations(memoryPool(changed).pool, migrations),
      /001_baseline changed after it was applied/,
    );
  });
});

function legacyRows(count) {
  return legacyMigrations()
    .slice(0, count)
    .map((migration) => ({ version: migration.version, checksum: migration.checksum }));
}

function memoryPool(applied = [], { transactional = false } = {}) {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push(String(sql));
      if (/^SELECT version, checksum FROM schema_migrations/i.test(sql)) {
        return [applied.map((row) => ({ ...row }))];
      }
      if (/INSERT( IGNORE)? INTO schema_migrations/i.test(sql)) {
        if (!applied.some((row) => row.version === params[0])) {
          applied.push({ version: params[0], checksum: params[1] });
        }
      }
      if (/DELETE FROM schema_migrations/i.test(sql)) {
        const drop = new Set(params);
        for (let index = applied.length - 1; index >= 0; index -= 1) {
          if (drop.has(applied[index].version)) applied.splice(index, 1);
        }
      }
      return [{ affectedRows: 1 }];
    },
  };
  if (transactional) {
    pool.getConnection = async () => ({
      async beginTransaction() {
        calls.push("BEGIN");
      },
      async commit() {
        calls.push("COMMIT");
      },
      async rollback() {
        calls.push("ROLLBACK");
      },
      release() {},
      query: (sql, params) => pool.query(sql, params),
    });
  }
  return { pool, applied, calls };
}

async function captureLogs(run) {
  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    await run();
    return lines;
  } finally {
    console.log = originalLog;
  }
}

describe("language", () => {
  it("follows the browser language and keeps English as the fallback", () => {
    assert.equal(languageFromHeader("de-DE,de;q=0.9,en;q=0.8"), "de");
    assert.equal(languageFromHeader("en-US,en;q=0.9,de;q=0.8"), "en");
    assert.equal(languageFromHeader("de,en"), "de");
    assert.equal(languageFromHeader("en,de"), "en");
    assert.equal(languageFromHeader("fr-FR,fr;q=0.9"), "en");
    assert.equal(languageFromHeader("*"), "en");
    assert.equal(languageFromHeader(""), "en");
    assert.equal(resolveLanguage("de-DE,de;q=0.9", "auto"), "de");
    assert.equal(resolveLanguage("de-DE,de;q=0.9", "en"), "en");
    assert.equal(resolveLanguage("en-US", "de"), "de");
    assert.equal(resolveLanguage("fr-FR", "nope"), "en");
    assert.equal(languageChoice("DE"), "de");
    assert.equal(languageChoice(""), "auto");
    assert.equal(languageChoice("fr"), "auto");
    assert.deepEqual(languages.map((item) => item.id), ["en", "de"]);
    assert.deepEqual(Object.keys(catalogs), ["de"]);
    assert.equal(translate("de", "Sign in"), "Anmelden");
    assert.equal(translate("en", "Sign in"), "Sign in");
    assert.equal(translate("de", "{label} is invalid", { label: "Password" }), "Passwort ist ungültig");
    assert.equal(translate("de", "Bot said no"), "Bot said no");
    assert.equal(clientJson("de").includes("Gerade läuft nichts."), true);
    assert.equal(clientJson("de").includes("<"), false);
    const german = translator("de");
    assert.equal(presentStatus(null, german).problems[0], "Die Bot-API hat keinen Status geliefert.");
    assert.equal(presentBotList([{ Id: 2, Name: "lobby", Status: "Connected" }], german)[0].statusLabel, "Verbunden");
  });

  it("keeps every panel phrase in each translation catalog", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "locales") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(js|jsx)$/.test(name)) files.push(path);
      }
    };
    walk(join(root, "src"));
    walk(join(root, "client"));
    const keys = [];
    const pattern = /(?:^|[^\w])t\(\s*"((?:\\.|[^"\\])*)"|new (?:Http|Validation|Ts3Api)Error\(\s*"((?:\\.|[^"\\])*)"/g;
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(pattern)) keys.push((match[1] || match[2]).replace(/\\"/g, '"'));
    }
    const catalogIds = languages.filter((item) => item.id !== "en").map((item) => item.id);
    assert.deepEqual(Object.keys(catalogs).sort(), [...catalogIds].sort());
    for (const id of catalogIds) {
      const catalog = catalogs[id];
      const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(catalog, key));
      assert.deepEqual(missing, [], id);
    }

    const localeDir = join(root, "src/locales");
    const localeFiles = readdirSync(localeDir).filter((name) => name.endsWith(".js"));
    assert.deepEqual(localeFiles.map((name) => name.replace(/\.js$/, "")).sort(), [...catalogIds].sort());
    for (const name of localeFiles) {
      const catalog = readFileSync(join(localeDir, name), "utf8");
      const defined = [...catalog.matchAll(/^\s*(?:"((?:\\.|[^"\\])*)"|([A-Za-z_][A-Za-z0-9_]*))\s*:/gm)].map(
        (match) => match[1] ?? match[2],
      );
      const seen = new Set();
      const duplicates = defined.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
      assert.deepEqual(duplicates, [], name);
    }
  });

});

describe("panel paths and failures", () => {
  it("keeps the built client under the application directory when that directory is /app", () => {
    assert.equal(posix.dirname("/app/"), "/");
    assert.equal(posix.join(posix.dirname("/app/"), "views"), "/views");
    assert.equal(panelRoot("/app/src/app.js", posix), "/app");
    assert.equal(posix.join(panelRoot("/app/src/app.js", posix), "dist"), "/app/dist");
    assert.equal(posix.join(posix.dirname("/app/"), "dist"), "/dist");
  });

  it("turns known failures into a fixed sentence and hides the rest", () => {
    const down = Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:3306"), { code: "ECONNREFUSED" });
    assert.equal(failureFor(down).message, "The database is unreachable.");
    assert.equal(failureFor(down).message.includes("10.1.2.3"), false);
    assert.equal(
      failureFor(down, { startup: true }).message,
      "The database is unreachable. Restart the panel once the database is up.",
    );
    assert.equal(
      failureFor(Object.assign(new Error("denied"), { code: "ER_ACCESS_DENIED_ERROR" })).message,
      "The database rejected the panel login.",
    );
    assert.equal(
      failureFor(Object.assign(new Error("missing"), { code: "ER_BAD_DB_ERROR" })).message,
      "The panel database does not exist.",
    );
    const wrapped = new Error("aggregate");
    wrapped.errors = [Object.assign(new Error("lookup"), { code: "ENOTFOUND" })];
    assert.equal(failureFor(wrapped).message, "The database is unreachable.");
    const missing = Object.assign(new Error('Failed to lookup view "login" in views directory "/views"'), {
      view: { name: "login" },
    });
    assert.equal(failureFor(missing).message, "The page template {name} is missing.");
    assert.deepEqual(failureFor(missing).params, { name: "login" });
    assert.equal(
      failureFor(new Error("Migration 2 changed after it was applied."), { startup: true }).message,
      "The database schema does not match this panel.",
    );
    assert.equal(
      failureFor(new Error("Database has migration history through 008_bot_template and this panel cannot finish it."), {
        startup: true,
      }).message,
      "The database schema does not match this panel.",
    );
    assert.equal(failureFor(new HttpError("Bot not found", 404)).message, "Bot not found");
    assert.equal(failureFor(new Ts3ApiError("Bot API is unreachable")).status, 502);
    assert.equal(failureFor(new Error("password=secret SELECT * FROM users")), null);
  });

  it("returns German phrases for the client and reports a database outage", async () => {
    const login = createApp();
    const loginServer = await new Promise((resolve) => {
      const server = login.listen(0, "127.0.0.1", () => resolve(server));
    });
    try {
      const port = loginServer.address().port;
      const page = await fetch(`http://127.0.0.1:${port}/api/session`, {
        headers: { "accept-language": "de", accept: "application/json" },
      });
      const body = await page.json();
      assert.equal(page.status, 200);
      assert.equal(body.phrases["Sign in"], "Anmelden");
      assert.equal(body.lang, "de");
      assert.equal(body.choice, "auto");
      assert.equal(body.user, null);
      const forced = await fetch(`http://127.0.0.1:${port}/api/session`, {
        headers: { "accept-language": "de", cookie: "ts3panel-lang=en", accept: "application/json" },
      });
      const forcedBody = await forced.json();
      assert.equal(forced.status, 200);
      assert.equal(forcedBody.lang, "en");
      assert.equal(forcedBody.choice, "en");
      assert.equal(forcedBody.phrases["Sign in"], undefined);
      assert.equal(forcedBody.languages.map((item) => item.id).join(","), "en,de");
      const health = await fetch(`http://127.0.0.1:${port}/healthz`);
      assert.equal(health.status, 503);
      assert.match(await health.text(), /database is unreachable/i);
    } finally {
      await new Promise((resolve) => loginServer.close(resolve));
    }

    const outage = createApp({
      startupError: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3306"), { code: "ECONNREFUSED" }),
    });
    const outageServer = await new Promise((resolve) => {
      const server = outage.listen(0, "127.0.0.1", () => resolve(server));
    });
    try {
      const port = outageServer.address().port;
      const page = await fetch(`http://127.0.0.1:${port}/`, { headers: { "accept-language": "de" } });
      const html = await page.text();
      assert.equal(page.status, 503);
      assert.match(html, /Die Datenbank ist nicht erreichbar/);
      assert.equal(html.includes("127.0.0.1"), false);
      const health = await fetch(`http://127.0.0.1:${port}/healthz`);
      assert.equal(health.status, 503);
      assert.match(await health.text(), /Restart the panel once the database is up/);
    } finally {
      await new Promise((resolve) => outageServer.close(resolve));
    }
  });
});
