import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

process.env.TOKEN_KEY = "test-token-key-value";

const { createServer } = await import("node:http");
const { LOGIN_PER_IP, auditFailedLogin, readConnectionLive, searchStillOwn, startWhisperReads, whisperListsFrom } = await import("../src/api.js");
const { untrustedProxyHeader } = await import("../src/app.js");
const { cookieSecureSetting, weakTokenKey } = await import("../src/config.js");
const { SESSION_MAX_MS, pool, sessionDeadline, sessionIdleMs, userBotAccess } = await import("../src/db.js");
const { secureCookie } = await import("../src/http.js");
const { displayStreamUrl, presentStatus } = await import("../src/present.js");
const { assertStreamTarget, parseInstanceForm, parseStreamUrl } = await import("../src/validate.js");

after(() => pool.end());

describe("stream targets", () => {
  it("refuses loopback, the bot API port, and registered API hosts", () => {
    for (const url of [
      "http://127.0.0.1:58913/api/quit",
      "http://127.8.9.1/stream",
      "http://localhost/stream",
      "http://radio.localhost/stream",
      "http://[::1]/stream",
      "http://[::ffff:127.0.0.1]/stream",
      "http://2130706433/stream",
      "http://radio.example.com:58913/stream",
    ]) {
      assert.throws(() => parseStreamUrl(url), /not allowed/, url);
    }
    assert.equal(parseStreamUrl("http://192.168.1.5:8000/live"), "http://192.168.1.5:8000/live");
    assert.equal(parseStreamUrl("https://radio.example.com/live"), "https://radio.example.com/live");
    assert.throws(() => assertStreamTarget("http://ts3audiobot:8000/live", ["ts3audiobot"]), /not allowed/);
    assert.throws(() => assertStreamTarget("http://TS3AudioBot./live", ["ts3audiobot"]), /not allowed/);
    assert.equal(assertStreamTarget("http://radio:8000/live", ["ts3audiobot"]), "http://radio:8000/live");
  });

  it("hides credentials and secret query values in every shown address", () => {
    const shown = displayStreamUrl("https://user:pass@radio.example.com/live?token=abc&format=mp3&Key=1");
    assert.equal(shown.includes("user"), false);
    assert.equal(shown.includes("pass"), false);
    assert.equal(shown.includes("abc"), false);
    assert.match(shown, /format=mp3/);
    assert.match(shown, /token=\*\*\*/);
    assert.equal(displayStreamUrl("https://radio.example.com/live?format=mp3"), "https://radio.example.com/live?format=mp3");
    // Comparing two cleaned forms still matches the same station.
    assert.equal(displayStreamUrl(shown), shown);
  });

  it("strips station credentials from the status the bot reports", () => {
    const secret = "http://dj:hunter2@radio.example.com/live?pass=x";
    const status = presentStatus([
      { Title: secret, Source: secret, Length: 0, Position: 3 },
      40,
      0,
      false,
      { Title: "Queue", Items: [{ Link: secret }] },
    ]);
    assert.equal(status.song.sourceHref, null);
    for (const value of [status.song.title, status.song.source, status.queue.items[0].title, status.queue.items[0].link]) {
      assert.equal(value.includes("hunter2"), false, value);
      assert.equal(value.includes("dj:"), false, value);
      assert.equal(value.includes("pass=x"), false, value);
    }
    assert.equal(presentStatus([{ Title: "Song", Source: "https://youtu.be/x" }, 1, 0, false, null]).song.title, "Song");
  });
});

describe("bot access", () => {
  const owner = { id: 4, role: "user" };
  const bot = { enabled: true, assigneeUserId: 4, ownerUserId: 4 };
  const granted = { enabled: true, assigneeUserId: 4, ownerUserId: 9 };

  it("needs assignment and ownership or a grant", () => {
    assert.deepEqual(userBotAccess(owner, bot, null), { canControl: true, canManage: true, canDelete: true });
    assert.equal(userBotAccess(owner, granted, null), null);
    assert.deepEqual(userBotAccess(owner, granted, { canControl: true }), { canControl: true, canManage: false, canDelete: true });
    assert.equal(userBotAccess(owner, { ...granted, assigneeUserId: 5 }, { canControl: true }), null);
    assert.equal(userBotAccess(owner, { ...granted, enabled: false }, { canControl: true }), null);
  });

  it("makes a grant without control read only", () => {
    assert.deepEqual(userBotAccess(owner, granted, { canControl: false }), { canControl: false, canManage: false, canDelete: false });
    assert.deepEqual(userBotAccess({ id: 1, role: "admin" }, { ...granted, enabled: false }, null), { canControl: true, canManage: true, canDelete: true });
  });
});

describe("sessions and cookies", () => {
  it("moves the idle deadline forward without passing seven days", () => {
    const created = Date.UTC(2026, 0, 1);
    const idle = sessionIdleMs();
    assert.equal(sessionDeadline(created, created + idle, created + 60_000), null);
    const later = created + 2 * 60 * 60 * 1000;
    assert.equal(sessionDeadline(created, created + idle, later).getTime(), later + idle);
    const nearEnd = created + SESSION_MAX_MS - 60 * 60 * 1000;
    const capped = sessionDeadline(created, nearEnd - idle, nearEnd);
    assert.equal(capped.getTime(), created + SESSION_MAX_MS);
  });

  it("marks the cookie secure on HTTPS when the setting is auto", () => {
    assert.equal(cookieSecureSetting(undefined), "auto");
    assert.equal(cookieSecureSetting("true"), true);
    assert.equal(cookieSecureSetting("false"), false);
    assert.equal(secureCookie({ secure: true }, "auto"), true);
    assert.equal(secureCookie({ secure: false }, "auto"), false);
    assert.equal(secureCookie({ secure: false }, true), true);
    assert.equal(secureCookie({ secure: true }, false), false);
  });

  it("refuses a new API token with a weak key and keeps the rest", () => {
    assert.equal(weakTokenKey("dev-only-token-key"), true);
    assert.equal(weakTokenKey("short"), true);
    assert.equal(weakTokenKey("a-long-random-production-key"), false);
    const body = { name: "Main", baseUrl: "http://ts3audiobot:58913", apiUser: "uid", apiToken: "secret" };
    assert.throws(() => parseInstanceForm(body, { weakKey: true }), /TOKEN_KEY/);
    assert.equal(parseInstanceForm(body, { weakKey: false }).apiToken, "secret");
    assert.equal(parseInstanceForm({ ...body, apiUser: "", apiToken: "" }, { weakKey: true }).apiToken, "");
  });
});

describe("sign-in limits", () => {
  it("audits known accounts always and unknown names within a budget", () => {
    assert.equal(LOGIN_PER_IP, 30);
    const now = Date.UTC(2030, 0, 1);
    assert.equal(auditFailedLogin({ id: 1 }, now), true);
    let written = 0;
    for (let index = 0; index < 150; index += 1) if (auditFailedLogin(null, now)) written += 1;
    assert.equal(written, 100);
    assert.equal(auditFailedLogin({ id: 1 }, now), true);
  });

  it("warns about a proxy header only while the proxy is not trusted", () => {
    const req = (value) => ({ get: (name) => (name === "x-forwarded-for" ? value : undefined) });
    assert.equal(untrustedProxyHeader(req("203.0.113.5"), false), true);
    assert.equal(untrustedProxyHeader(req("203.0.113.5"), 1), false);
    assert.equal(untrustedProxyHeader(req(undefined), false), false);
  });

  it("lets only the last account that searched pick a result", () => {
    const searches = new Map([[7, 3]]);
    assert.equal(searchStillOwn(searches, 7, 3), true);
    assert.equal(searchStillOwn(searches, 7, 4), false);
    assert.equal(searchStillOwn(searches, 8, 3), false);
  });
});

describe("connection reads", () => {
  it("asks for the server tree before the bot list has answered", { timeout: 5000 }, async () => {
    let treeAsked;
    const treeSeen = new Promise((resolve) => { treeAsked = resolve; });
    const server = createServer(async (req, res) => {
      const path = decodeURIComponent(req.url);
      res.setHeader("content-type", "application/json");
      // The bot list answers only after the server tree was requested. Reading them one after the other would hang.
      if (path === "/api/bot/list") {
        await treeSeen;
        return res.end(JSON.stringify([{ Id: 4, Name: "default", Server: "ts.example.com", Status: "Connected" }]));
      }
      if (path.includes("server/tree")) {
        treeAsked();
        return res.end(JSON.stringify({
          Channels: { 1: { Id: 1, Name: "Home", Parent: 0 } },
          Clients: [{ Id: 3, Name: "Ann", Channel: 1, ClientType: 0 }, { Id: 9, Name: "bot", Channel: 1, ClientType: 0 }],
        }));
      }
      if (path.includes("whisper/list")) return res.end(JSON.stringify({ SendMode: "Whisper", WhisperClients: [3] }));
      if (path.includes("bot/info/client")) return res.end(JSON.stringify({ Uid: "abc=", ClientId: 9 }));
      return res.end(JSON.stringify({ Value: "" }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const bot = { baseUrl: `http://127.0.0.1:${server.address().port}`, useInstance: true, instanceMode: "template", instanceRef: "default" };
      const live = await readConnectionLive(bot, (key) => key);
      assert.equal(live.connection.status, "connected");
      assert.equal(live.whisper, "whisper");
      assert.deepEqual(live.whisperClients, [3]);
      assert.deepEqual(live.channels.map((item) => item.id), [1]);
      assert.deepEqual(live.clients.map((item) => item.id), [3]);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("turns a bot without an instance name into two errors instead of a thrown request", async () => {
    const results = await startWhisperReads({ baseUrl: "http://127.0.0.1:1", useInstance: true, instanceMode: "template", instanceRef: "" });
    assert.deepEqual(results.map((item) => item.status), ["rejected", "rejected"]);
    const lists = whisperListsFrom(results, (key) => key, null);
    assert.ok(lists.whisperError);
    assert.ok(lists.treeError);
    assert.deepEqual(lists.clients, []);
  });
});
