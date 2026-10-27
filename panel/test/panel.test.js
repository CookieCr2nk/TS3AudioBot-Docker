import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { after, describe, it } from "node:test";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, panelRoot } from "../src/app.js";
import { pool } from "../src/db.js";
import { HttpError, Ts3ApiError, failureFor } from "../src/errors.js";
import { actions, buildActionRequest, hostingCalls, liveRenameParts, parseBulk, templateIsConnected } from "../src/actions.js";
import { decrypt, encrypt, tokensEqual } from "../src/crypto.js";
import { clientJson, languageFromHeader, translate, translator } from "../src/i18n.js";
import de from "../src/locales/de.js";
import { displayStreamUrl, presentBotList, presentHistory, presentPlaylists, presentSearch, presentStatus } from "../src/present.js";
import { applyMigrations, loadMigrations, migrationFromSource } from "../src/schema.js";
import { apiHeaders, buildApiPath, scope, statusParts } from "../src/ts3ab.js";
import {
  assertBaseUrl,
  parseBotLimit,
  parseHostingSettings,
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
    assert.deepEqual(parseBulk({ op: "pause", ids: [1, "2", 2] }), { op: "pause", ids: [1, 2] });
    assert.equal(parseBulk({ op: "volume", ids: [4], volume: 30 }).op, "volume");
    assert.equal(parseBulk({ op: "play", ids: [3], resource: "https://example.com/a.mp3" }).ids[0], 3);
    assert.throws(() => parseBulk({ op: "disconnect", ids: [1], instanceId: "1" }), /Unknown action/);
    assert.throws(() => parseBulk({ op: "bot-setup", ids: [1], key: "abcdefgh" }), /Unknown action/);
    assert.throws(() => parseBulk({ op: "pause", ids: [] }), /at least one/);
    assert.throws(() => parseBulk({ op: "play", ids: [1] }), /Link is missing/);
    assert.throws(() => parseBulk({ op: "pause", ids: ["nope"] }), /invalid/);
    assert.throws(() => parseBulk({ op: "pause", ids: Array.from({ length: 26 }, (_, index) => index + 1) }), /at most/);
    assert.throws(() => parseBulk({ op: "play", ids: Array.from({ length: 11 }, (_, index) => index + 1), resource: "https://example.com/a" }), /at most/);
  });

  it("blocks playback without control and hosting actions for users", () => {
    assert.throws(() => buildActionRequest(templateBot, "play", { resource: "https://example.com/a" }, reader), /control rights/);
    assert.throws(() => buildActionRequest(templateBot, "disconnect", { instanceId: "1" }, user), /Administrators only/);
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
    assert.throws(() => buildActionRequest(templateBot, "template-hosting", { name: "lobby" }, admin), /at least one/);
    assert.throws(() => buildActionRequest(templateBot, "template-hosting", { name: "lobby", nickname: "Music" }, user), /Administrators only/);
    const stream = buildActionRequest(
      templateBot,
      "template-hosting",
      { name: "lobby", startup: "https://user:pass@example.com/a'b(!quit)" },
      admin,
    );
    assert.equal(JSON.stringify(stream.action.detail(stream.args)).includes("pass"), false);
    assert.equal(stream.args.startupCommand, "!play 'https://user:pass@example.com/a\\'b(!quit)'");
    const stored = buildApiPath(hostingCalls(stream.args)[0]);
    assert.equal(stored.includes("quit)"), false);
    assert.equal(decodeURIComponent(stored).includes(stream.args.startupCommand), true);
    const cleared = parseHostingSettings({ name: "lobby", clearStartup: "on" });
    assert.deepEqual(hostingCalls(cleared), [["settings", "bot", "set", "lobby", "events.onconnect"]]);
    assert.throws(() => parseHostingSettings({ name: "lobby", startup: "https://example.com/a", clearStartup: "on" }), /Clear the startup/);
    assert.equal(buildApiPath(liveRenameParts("lobby", "A(B)")), "/bot/template/lobby/(/bot/name/A%28B%29)");
    assert.equal(templateIsConnected([{ Name: "lobby", Status: 2 }], "lobby"), true);
    assert.equal(templateIsConnected([{ Name: "lobby", Status: "Offline" }], "lobby"), false);

    const setup = buildActionRequest(templateBot, "bot-setup", { key: "abcdefgh" }, admin);
    assert.equal(buildApiPath(setup.parts), "/bot/template/default/(/bot/setup/abcdefgh)");
    assert.equal(JSON.stringify(setup.action.detail(setup.args)).includes("abcdefgh"), false);
    assert.throws(() => buildActionRequest(templateBot, "bot-setup", { key: "abcdefgh" }, user), /Administrators only/);
  });

  it("requires an explicit confirm before deleting a playlist", () => {
    assert.throws(() => buildActionRequest(templateBot, "list-delete", { listId: "mix" }, user), /confirmed/);
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

  it("loads ordered migrations and refuses a changed or unknown version", async () => {
    const migrations = loadMigrations();
    assert.deepEqual(migrations.map((migration) => migration.version), [
      "001_baseline",
      "002_radio_streams",
      "003_hosting",
      "004_drop_legacy_bots",
      "005_bot_limit",
    ]);
    const creates = migrations[0].statements.filter((statement) => /^CREATE TABLE/i.test(statement));
    assert.equal(creates.length, 5);
    assert.equal(migrations[0].statements.some((statement) => /MODIFY api_token_enc/i.test(statement)), true);
    assert.equal(migrations[1].statements.some((statement) => /CREATE TABLE IF NOT EXISTS radio_streams/i.test(statement)), true);
    assert.equal(migrations[2].statements.some((statement) => /CREATE TABLE IF NOT EXISTS instances/i.test(statement)), true);
    assert.equal(migrations[2].statements.some((statement) => /ADD COLUMN IF NOT EXISTS suspended/i.test(statement)), true);
    assert.equal(migrations[2].statements.some((statement) => /FOREIGN KEY IF NOT EXISTS \(instance_id\)/i.test(statement)), true);
    assert.equal(migrations[3].statements.some((statement) => /DROP TABLE IF EXISTS bots/i.test(statement)), true);
    assert.equal(migrations[4].statements.some((statement) => /ADD COLUMN IF NOT EXISTS bot_limit/i.test(statement)), true);
    const crlf = migrationFromSource("009_sample", "SELECT 1;\r\n");
    const lf = migrationFromSource("009_sample", "SELECT 1;\n");
    assert.equal(crlf.checksum, lf.checksum);

    const applied = [];
    const calls = [];
    const pool = {
      async query(sql, params) {
        calls.push(String(sql));
        if (/FROM schema_migrations/i.test(sql)) return [applied.map((row) => ({ ...row }))];
        if (/INSERT INTO schema_migrations/i.test(sql)) {
          applied.push({ version: params[0], checksum: params[1] });
        }
        return [{ affectedRows: 1 }];
      },
    };
    await applyMigrations(pool, migrations);
    await applyMigrations(pool, migrations);
    const inserts = calls.filter((sql) => /INSERT INTO schema_migrations/i.test(sql));
    assert.equal(inserts.length, migrations.length);
    assert.equal(applied.length, 5);

    const changed = migrations.map((migration, index) =>
      index === 0 ? { ...migration, checksum: "0".repeat(64) } : migration,
    );
    await assert.rejects(() => applyMigrations(pool, changed), /changed after it was applied/);
    await assert.rejects(
      () => applyMigrations(pool, migrations.slice(1)),
      /does not include/,
    );
  });
});

describe("language", () => {
  it("follows the browser language and keeps English as the fallback", () => {
    assert.equal(languageFromHeader("de-DE,de;q=0.9,en;q=0.8"), "de");
    assert.equal(languageFromHeader("en-US,en;q=0.9,de;q=0.8"), "en");
    assert.equal(languageFromHeader("de,en"), "de");
    assert.equal(languageFromHeader("en,de"), "en");
    assert.equal(languageFromHeader("fr-FR,fr;q=0.9"), "en");
    assert.equal(languageFromHeader("*"), "en");
    assert.equal(languageFromHeader(""), "en");
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

  it("keeps every panel phrase in the German catalog", () => {
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
    const missing = new Set();
    const pattern = /(?:^|[^\w])t\(\s*"((?:\\.|[^"\\])*)"|new (?:Http|Validation|Ts3Api)Error\(\s*"((?:\\.|[^"\\])*)"/g;
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(pattern)) {
        const key = (match[1] || match[2]).replace(/\\"/g, '"');
        if (!Object.prototype.hasOwnProperty.call(de, key)) missing.add(`${key} (${path})`);
      }
    }
    assert.deepEqual([...missing], []);

    const catalog = readFileSync(join(root, "src/locales/de.js"), "utf8");
    const keys = [...catalog.matchAll(/^\s*(?:"((?:\\.|[^"\\])*)"|([A-Za-z_][A-Za-z0-9_]*))\s*:/gm)].map(
      (match) => match[1] ?? match[2],
    );
    const seen = new Set();
    const duplicates = keys.filter((key) => (seen.has(key) ? true : (seen.add(key), false)));
    assert.deepEqual(duplicates, []);
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
      assert.equal(body.user, null);
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
