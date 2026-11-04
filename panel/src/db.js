import mysql from "mysql2/promise";
import { config, databaseConfig } from "./config.js";
import { decrypt, encrypt, randomToken } from "./crypto.js";
import { HttpError } from "./errors.js";
import { hashPassword } from "./passwords.js";
import { applyMigrations } from "./schema.js";
import { parsePassword, parseUsername } from "./validate.js";

export const pool = mysql.createPool({
  ...databaseConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: "utf8mb4",
  timezone: "Z",
  decimalNumbers: true,
});

pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'", () => {});
});

export async function ping() {
  await pool.query("SELECT 1");
}

export async function waitForDatabase(attempts = 30) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await ping();
      return;
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw last;
}

export async function migrate() {
  await waitForDatabase();
  await applyMigrations(pool);
  await pool.query("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)");
}

// A token that cannot be decrypted fails only the calls to that bot API, not every list that shows it.
function readToken(row, token) {
  if (!token || !row.api_token_enc) return { apiToken: null, tokenUnreadable: false };
  try {
    return { apiToken: decrypt(row.api_token_enc), tokenUnreadable: false };
  } catch {
    return { apiToken: null, tokenUnreadable: true };
  }
}

export function mapBot(row, { token = false } = {}) {
  const { apiToken, tokenUnreadable } = readToken(row, token);
  return {
    id: Number(row.id),
    name: row.name,
    label: row.label || "",
    baseUrl: row.base_url,
    instanceId: Number(row.instance_id),
    instanceName: row.instance_name || "",
    instanceMode: row.instance_mode,
    instanceRef: row.instance_ref,
    useInstance: row.instance_mode !== "none",
    apiUser: row.api_user || "",
    apiToken,
    tokenUnreadable,
    hasToken: Boolean(row.api_token_enc),
    enabled: Boolean(row.enabled),
    notes: row.notes || "",
    assigneeUserId: row.assignee_user_id == null ? null : Number(row.assignee_user_id),
    assigneeName: row.assignee_name || "",
    ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
    ownerName: row.owner_name || "",
    createdAt: row.created_at,
    connectNickname: row.connect_nickname || "",
    connectChannel: row.connect_channel || "",
    connectBitrate: row.connect_bitrate == null ? null : Number(row.connect_bitrate),
    connectVolume: row.connect_volume == null ? null : Number(row.connect_volume),
    connectRun: row.connect_run == null ? null : Number(row.connect_run) === 1,
    connectStartup: row.connect_startup || "",
    connectAddress: row.connect_address || "",
    hasServerPassword: Boolean(row.connect_server_password),
    hasChannelPassword: Boolean(row.connect_channel_password),
  };
}

export function publicBot(bot, { admin = false } = {}) {
  return {
    id: bot.id,
    name: bot.label || bot.name,
    template: bot.instanceRef || bot.name,
    enabled: bot.enabled,
    notes: bot.notes,
    instanceId: bot.instanceId,
    instanceName: bot.instanceName,
    instanceMode: bot.instanceMode,
    instanceRef: bot.instanceRef,
    baseUrl: admin ? bot.baseUrl : null,
    address: bot.connectAddress || "",
    ownerName: bot.assigneeName || bot.ownerName || "",
    instanceOwnerName: bot.ownerName || "",
    assigneeUserId: admin ? bot.assigneeUserId : null,
  };
}

function clip(value) {
  if (!value) return null;
  return String(value).replace(/[\r\n]+/g, " ").slice(0, 500);
}

export async function ensureAdmin() {
  const [rows] = await pool.query("SELECT id FROM users LIMIT 1");
  if (rows.length) return { created: false };

  let username = "admin";
  try {
    username = parseUsername(config.adminUser);
  } catch {
    console.warn("[panel] ADMIN_USER is invalid, using 'admin'.");
  }

  let password = config.adminPassword;
  let generatedPassword = null;
  try {
    password = parsePassword(password);
  } catch {
    generatedPassword = randomToken(18);
    password = generatedPassword;
    if (config.adminPassword) {
      console.warn("[panel] ADMIN_PASSWORD is shorter than 10 characters. Generated a random password.");
    }
  }

  await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')", [
    username,
    await hashPassword(password),
  ]);
  return { created: true, username, generatedPassword };
}

export async function findUserByUsername(username) {
  const [rows] = await pool.query(
    "SELECT id, username, password_hash, role, suspended, can_create_bots FROM users WHERE username = ? LIMIT 1",
    [username],
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  const [rows] = await pool.query(
    "SELECT id, username, password_hash, role, suspended, bot_limit, can_create_bots FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] || null;
}

export async function listUsers() {
  const [rows] = await pool.query(
    `SELECT id, username, role, suspended, bot_limit, can_create_bots,
            password_hash IS NOT NULL AS has_password, created_at, last_login_at
     FROM users ORDER BY username`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    username: row.username,
    role: row.role,
    suspended: Boolean(row.suspended),
    botLimit: row.bot_limit == null ? null : Number(row.bot_limit),
    canCreateBots: Boolean(row.can_create_bots),
    hasPassword: Boolean(row.has_password),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }));
}

export async function createUser({ username, passwordHash, role, botLimit = null, canCreateBots = false }) {
  try {
    const [result] = await pool.query(
      "INSERT INTO users (username, password_hash, role, bot_limit, can_create_bots) VALUES (?, ?, ?, ?, ?)",
      [username, passwordHash, role, botLimit, canCreateBots ? 1 : 0],
    );
    return Number(result.insertId);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new HttpError("Username is already taken", 400);
    throw err;
  }
}

export async function setBotLimit(id, botLimit) {
  await pool.query("UPDATE users SET bot_limit = ? WHERE id = ?", [botLimit, id]);
}

export async function setCanCreateBots(id, allowed) {
  await pool.query("UPDATE users SET can_create_bots = ? WHERE id = ?", [allowed ? 1 : 0, id]);
}

export async function countOwnedBots(userId, exceptBotId = null) {
  const params = [userId];
  let extra = "";
  if (exceptBotId != null) {
    extra = " AND t.id <> ?";
    params.push(exceptBotId);
  }
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM ts_bots t
     JOIN instances i ON i.id = t.instance_id
     WHERE COALESCE(t.assignee_user_id, i.owner_user_id) = ?${extra}`,
    params,
  );
  return Number(rows[0].total);
}

export async function setPassword(id, passwordHash) {
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, id]);
}

export async function deleteSessionsForUser(userId) {
  await pool.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export async function setRole(id, role) {
  await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);
}

export async function setSuspended(id, suspended) {
  await pool.query("UPDATE users SET suspended = ? WHERE id = ?", [suspended ? 1 : 0, id]);
}

export async function deleteUser(id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "UPDATE radio_streams SET owner_user_id = NULL WHERE owner_user_id = ? AND shared = 1",
      [id],
    );
    await connection.query("DELETE FROM users WHERE id = ?", [id]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function countActiveAdmins() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND suspended = 0",
  );
  return Number(rows[0].total);
}

export async function touchLogin(id) {
  await pool.query("UPDATE users SET last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?", [id]);
}

export async function createSession({ id, userId, csrf, expiresAt }) {
  await pool.query("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)");
  await pool.query("INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)", [
    id,
    userId,
    csrf,
    expiresAt,
  ]);
}

export async function getSession(id) {
  const [rows] = await pool.query(
    `SELECT s.csrf_token, u.id AS user_id, u.username, u.role, u.can_create_bots
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP(3) AND u.suspended = 0
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  return {
    csrf: rows[0].csrf_token,
    userId: Number(rows[0].user_id),
    username: rows[0].username,
    role: rows[0].role,
    canCreateBots: Boolean(rows[0].can_create_bots),
  };
}

export async function deleteSession(id) {
  await pool.query("DELETE FROM sessions WHERE id = ?", [id]);
}

export async function deleteOtherSessions(userId, keepId) {
  await pool.query("DELETE FROM sessions WHERE user_id = ? AND id <> ?", [userId, keepId]);
}

const INSTANCE_COLUMNS = `i.id, i.name, i.base_url, i.owner_user_id, i.api_user, i.api_token_enc, i.enabled, i.notes, i.created_at`;

const TS_BOT_COLUMNS = `t.id, t.name, t.label, t.template, i.base_url, 'template' AS instance_mode, IFNULL(t.template, t.name) AS instance_ref,
            i.api_user, i.api_token_enc, i.enabled, i.notes, t.created_at,
            t.connect_nickname, t.connect_channel, t.connect_bitrate, t.connect_volume, t.connect_run, t.connect_startup, t.connect_address,
            t.connect_server_password, t.connect_channel_password,
            i.id AS instance_id, i.name AS instance_name, i.owner_user_id, t.assignee_user_id,
            au.username AS assignee_name, ou.username AS owner_name`;

const TS_BOT_FROM = `ts_bots t
     JOIN instances i ON i.id = t.instance_id
     LEFT JOIN users au ON au.id = t.assignee_user_id
     LEFT JOIN users ou ON ou.id = i.owner_user_id`;

function mapInstance(row, { token = false } = {}) {
  const { apiToken, tokenUnreadable } = readToken(row, token);
  return {
    id: Number(row.id),
    name: row.name,
    baseUrl: row.base_url,
    ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
    ownerName: row.owner_name || "",
    apiUser: row.api_user || "",
    apiToken,
    tokenUnreadable,
    hasToken: Boolean(row.api_token_enc),
    enabled: Boolean(row.enabled),
    notes: row.notes || "",
    botCount: Number(row.bot_count || 0),
    grantCount: Number(row.grant_count || 0),
    createdAt: row.created_at,
  };
}

export function instanceClient(instance) {
  return {
    id: instance.id,
    name: instance.name,
    baseUrl: instance.baseUrl,
    instanceMode: "none",
    instanceRef: "",
    useInstance: false,
    apiUser: instance.apiUser,
    apiToken: instance.apiToken,
    tokenUnreadable: Boolean(instance.tokenUnreadable),
  };
}

export async function listInstances({ token = false } = {}) {
  const [rows] = await pool.query(
    `SELECT ${INSTANCE_COLUMNS}, u.username AS owner_name,
            (SELECT COUNT(*) FROM ts_bots t WHERE t.instance_id = i.id) AS bot_count,
            (SELECT COUNT(*) FROM instance_grants g WHERE g.instance_id = i.id) AS grant_count
     FROM instances i
     LEFT JOIN users u ON u.id = i.owner_user_id
     ORDER BY i.name`,
  );
  return rows.map((row) => mapInstance(row, { token }));
}

export async function listInstancesForUser(userId, { token = false } = {}) {
  const [rows] = await pool.query(
    `SELECT ${INSTANCE_COLUMNS}, u.username AS owner_name,
            (SELECT COUNT(*) FROM ts_bots t WHERE t.instance_id = i.id AND t.assignee_user_id = ?) AS bot_count,
            (SELECT COUNT(*) FROM instance_grants g2 WHERE g2.instance_id = i.id) AS grant_count,
            CASE WHEN i.owner_user_id = ? THEN 1 ELSE IFNULL(g.can_control, 0) END AS can_control
     FROM instances i
     LEFT JOIN users u ON u.id = i.owner_user_id
     LEFT JOIN instance_grants g ON g.instance_id = i.id AND g.user_id = ?
     WHERE i.enabled = 1 AND (i.owner_user_id = ? OR g.user_id = ?)
     ORDER BY i.name`,
    [userId, userId, userId, userId, userId],
  );
  return rows.map((row) => ({ ...mapInstance(row, { token }), canControl: Boolean(row.can_control) }));
}

export async function getInstanceRow(id) {
  const [rows] = await pool.query(
    `SELECT ${INSTANCE_COLUMNS}, u.username AS owner_name,
            (SELECT COUNT(*) FROM ts_bots t WHERE t.instance_id = i.id) AS bot_count
     FROM instances i
     LEFT JOIN users u ON u.id = i.owner_user_id
     WHERE i.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapInstance(rows[0], { token: true }) : null;
}

export async function accessToInstance(user, instanceId) {
  const instance = await getInstanceRow(instanceId);
  if (!instance) return null;
  if (user.role === "admin") return { instance, canControl: true, canManage: true };
  if (!instance.enabled) return null;
  if (instance.ownerUserId === user.id) return { instance, canControl: true, canManage: true };
  const grant = await getGrant(instance.id, user.id);
  if (!grant) return null;
  return { instance, canControl: Boolean(grant.canControl), canManage: false };
}

export async function insertInstance(fields) {
  const [result] = await pool.query(
    `INSERT INTO instances (name, base_url, owner_user_id, api_user, api_token_enc, enabled, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.name,
      fields.baseUrl,
      fields.ownerUserId,
      fields.apiToken ? fields.apiUser : null,
      fields.apiToken ? encrypt(fields.apiToken) : null,
      fields.enabled ? 1 : 0,
      fields.notes || null,
    ],
  );
  return Number(result.insertId);
}

export async function updateInstanceRecord(id, fields) {
  const params = [fields.name, fields.baseUrl, fields.ownerUserId, fields.enabled ? 1 : 0, fields.notes || null];
  let sql = `UPDATE instances
     SET name = ?, base_url = ?, owner_user_id = ?, enabled = ?, notes = ?`;
  if (fields.apiToken === "") {
    sql += ", api_user = NULL, api_token_enc = NULL";
  } else if (fields.apiToken) {
    sql += ", api_user = ?, api_token_enc = ?";
    params.push(fields.apiUser, encrypt(fields.apiToken));
  } else if (fields.apiToken === null && fields.apiUser) {
    sql += ", api_user = ?";
    params.push(fields.apiUser);
  }
  sql += " WHERE id = ?";
  params.push(id);
  await pool.query(sql, params);
}

export async function deleteInstance(id) {
  await pool.query("DELETE FROM instances WHERE id = ?", [id]);
}

export function canDeleteBot(user, bot) {
  if (!user || !bot) return false;
  if (user.role === "admin") return true;
  return bot.assigneeUserId != null && Number(bot.assigneeUserId) === Number(user.id);
}

export async function listAccessibleBots(user, { token = true } = {}) {
  if (user.role === "admin") {
    const [rows] = await pool.query(
      `SELECT ${TS_BOT_COLUMNS}
       FROM ${TS_BOT_FROM}
       ORDER BY i.name, t.name`,
    );
    return rows.map((row) => ({ bot: mapBot(row, { token }), canControl: true, canManage: true, canDelete: true }));
  }
  const [rows] = await pool.query(
    `SELECT ${TS_BOT_COLUMNS}
     FROM ${TS_BOT_FROM}
     WHERE i.enabled = 1 AND t.assignee_user_id = ?
     ORDER BY i.name, t.name`,
    [user.id],
  );
  return rows.map((row) => {
    const bot = mapBot(row, { token });
    return {
      bot,
      canControl: true,
      canManage: bot.ownerUserId != null && bot.ownerUserId === user.id,
      canDelete: canDeleteBot(user, bot),
    };
  });
}

export async function getTsBotRow(id) {
  const [rows] = await pool.query(
    `SELECT ${TS_BOT_COLUMNS}
     FROM ${TS_BOT_FROM}
     WHERE t.id = ?
     LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

export async function findTsBotId(instanceId, template) {
  const [rows] = await pool.query(
    "SELECT id FROM ts_bots WHERE instance_id = ? AND template = ? LIMIT 1",
    [instanceId, template],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function ensureTsBot(instanceId, template, displayName, assigneeUserId = null) {
  const existing = await findTsBotId(instanceId, template);
  if (existing) return existing;
  const display = displayName || template;
  const name = String(display).slice(0, 64);
  try {
    const [result] = await pool.query(
      "INSERT INTO ts_bots (instance_id, name, label, template, assignee_user_id) VALUES (?, ?, ?, ?, ?)",
      [instanceId, name, display, template, assigneeUserId],
    );
    return Number(result.insertId);
  } catch (err) {
    if (err.code !== "ER_DUP_ENTRY") throw err;
    return findTsBotId(instanceId, template);
  }
}

export async function deleteTsBotByName(instanceId, template) {
  await pool.query("DELETE FROM ts_bots WHERE instance_id = ? AND template = ?", [instanceId, template]);
}

export async function setBotAssignee(botId, userId) {
  await pool.query("UPDATE ts_bots SET assignee_user_id = ? WHERE id = ?", [userId, botId]);
}

export async function setBotLabel(botId, label) {
  await pool.query("UPDATE ts_bots SET label = ? WHERE id = ?", [label || null, botId]);
}

export async function saveBotSettings(botId, patch) {
  const columns = {
    nickname: "connect_nickname",
    channel: "connect_channel",
    bitrate: "connect_bitrate",
    volume: "connect_volume",
    run: "connect_run",
    startup: "connect_startup",
    address: "connect_address",
    serverPassword: "connect_server_password",
    channelPassword: "connect_channel_password",
  };
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    sets.push(`${column} = ?`);
    params.push(patch[key]);
  }
  if (!sets.length) return;
  params.push(botId);
  await pool.query(`UPDATE ts_bots SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function listGrantIds() {
  const [rows] = await pool.query("SELECT user_id, instance_id FROM instance_grants");
  return rows.map((row) => ({ userId: Number(row.user_id), instanceId: Number(row.instance_id) }));
}

export async function replaceUserGrants(userId, instanceIds) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM instance_grants WHERE user_id = ?", [userId]);
    for (const instanceId of instanceIds) {
      await connection.query(
        "INSERT INTO instance_grants (instance_id, user_id, can_control) VALUES (?, ?, 1)",
        [instanceId, userId],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function accessToBot(user, botId) {
  const row = await getTsBotRow(botId);
  if (!row) return null;
  const bot = mapBot(row, { token: true });
  if (user.role === "admin") return { bot, canControl: true, canManage: true, canDelete: true };
  if (!row.enabled) return null;
  if (!canDeleteBot(user, bot)) return null;
  return {
    bot,
    canControl: true,
    canManage: bot.ownerUserId != null && bot.ownerUserId === user.id,
    canDelete: true,
  };
}

export async function getGrant(instanceId, userId) {
  const [rows] = await pool.query(
    "SELECT can_control FROM instance_grants WHERE instance_id = ? AND user_id = ? LIMIT 1",
    [instanceId, userId],
  );
  return rows[0] ? { canControl: Boolean(rows[0].can_control) } : null;
}

export async function listGrants(instanceId) {
  const [rows] = await pool.query(
    "SELECT user_id, can_control FROM instance_grants WHERE instance_id = ?",
    [instanceId],
  );
  return rows.map((row) => ({ userId: Number(row.user_id), canControl: Boolean(row.can_control) }));
}

export async function replaceGrants(instanceId, grants) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM instance_grants WHERE instance_id = ?", [instanceId]);
    for (const grant of grants) {
      await connection.query(
        "INSERT INTO instance_grants (instance_id, user_id, can_control) VALUES (?, ?, ?)",
        [instanceId, grant.userId, grant.canControl ? 1 : 0],
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function addAudit({ userId = null, botId = null, instanceId = null, action, detail = null }) {
  await pool.query(
    "INSERT INTO audit_log (user_id, bot_id, instance_id, action, detail) VALUES (?, ?, ?, ?, ?)",
    [userId, botId, instanceId, String(action).slice(0, 64), clip(detail)],
  );
}

function mapStream(row) {
  return {
    id: Number(row.id),
    name: row.name,
    url: row.url,
    notes: row.notes || "",
    shared: Boolean(row.shared),
    ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
    ownerName: row.owner_name || "",
    createdAt: row.created_at,
  };
}

export async function listStreams(user) {
  const admin = user.role === "admin" ? 1 : 0;
  const [rows] = await pool.query(
    `SELECT r.id, r.name, r.url, r.notes, r.shared, r.owner_user_id, r.created_at, u.username AS owner_name
     FROM radio_streams r
     LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE r.shared = 1 OR r.owner_user_id = ? OR ? = 1
     ORDER BY r.shared DESC, r.name, r.id`,
    [user.id, admin],
  );
  return rows.map(mapStream);
}

export async function getStream(id, user) {
  const admin = user.role === "admin" ? 1 : 0;
  const [rows] = await pool.query(
    `SELECT r.id, r.name, r.url, r.notes, r.shared, r.owner_user_id, r.created_at, u.username AS owner_name
     FROM radio_streams r
     LEFT JOIN users u ON u.id = r.owner_user_id
     WHERE r.id = ? AND (r.shared = 1 OR r.owner_user_id = ? OR ? = 1)
     LIMIT 1`,
    [id, user.id, admin],
  );
  return rows[0] ? mapStream(rows[0]) : null;
}

export async function insertStream({ name, url, notes, shared, ownerUserId }) {
  try {
    const [result] = await pool.query(
      "INSERT INTO radio_streams (name, url, notes, shared, owner_user_id) VALUES (?, ?, ?, ?, ?)",
      [name, url, notes || null, shared ? 1 : 0, ownerUserId],
    );
    return Number(result.insertId);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new HttpError("This stream is already saved", 400);
    throw err;
  }
}

export async function deleteStream(id, user) {
  const admin = user.role === "admin" ? 1 : 0;
  const [result] = await pool.query(
    "DELETE FROM radio_streams WHERE id = ? AND (owner_user_id = ? OR ? = 1)",
    [id, user.id, admin],
  );
  return result.affectedRows > 0;
}

export async function trimAuditLog() {
  const [result] = await pool.query(
    "DELETE FROM audit_log WHERE created_at < (CURRENT_TIMESTAMP(3) - INTERVAL 1 DAY)",
  );
  return Number(result.affectedRows) || 0;
}

export async function listAudit(limit = 200) {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit)) || 200));
  const [rows] = await pool.query(
    `SELECT a.created_at, a.action, a.detail, u.username, i.name AS instance_name, COALESCE(t.label, t.name) AS bot_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN instances i ON i.id = a.instance_id
     LEFT JOIN ts_bots t ON t.id = a.bot_id
     ORDER BY a.id DESC
     LIMIT ${safeLimit}`,
  );
  return rows.map((row) => ({
    createdAt: row.created_at,
    action: row.action,
    detail: row.detail || "",
    username: row.username || "",
    botName: [row.instance_name, row.bot_name].filter(Boolean).join(" / "),
  }));
}

const INVITE_COLUMNS = `t.id, t.label, t.created_at, t.expires_at, t.max_uses, t.use_count, t.revoked_at,
            t.can_create_bots, t.bot_limit, u.username AS created_by_name`;

function mapInvite(row, instanceIds) {
  return {
    id: Number(row.id),
    label: row.label || "",
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxUses: Number(row.max_uses),
    useCount: Number(row.use_count),
    revokedAt: row.revoked_at,
    canCreateBots: Boolean(row.can_create_bots),
    botLimit: row.bot_limit == null ? null : Number(row.bot_limit),
    instanceIds,
  };
}

export async function listInvites() {
  const [rows] = await pool.query(
    `SELECT ${INVITE_COLUMNS} FROM invite_tokens t LEFT JOIN users u ON u.id = t.created_by_user_id
     ORDER BY t.created_at DESC, t.id DESC`,
  );
  const [links] = await pool.query("SELECT token_id, instance_id FROM invite_token_instances");
  const byToken = new Map();
  for (const link of links) {
    const id = Number(link.token_id);
    if (!byToken.has(id)) byToken.set(id, []);
    byToken.get(id).push(Number(link.instance_id));
  }
  return rows.map((row) => mapInvite(row, byToken.get(Number(row.id)) || []));
}

export async function getInvite(id) {
  const [rows] = await pool.query(
    `SELECT ${INVITE_COLUMNS} FROM invite_tokens t LEFT JOIN users u ON u.id = t.created_by_user_id WHERE t.id = ? LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  const [links] = await pool.query("SELECT instance_id FROM invite_token_instances WHERE token_id = ?", [id]);
  return mapInvite(rows[0], links.map((link) => Number(link.instance_id)));
}

export async function insertInvite({ tokenHash, label, createdByUserId, expiresAt, maxUses, canCreateBots, botLimit, instanceIds }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO invite_tokens (token_hash, label, created_by_user_id, expires_at, max_uses, can_create_bots, bot_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tokenHash, label, createdByUserId, expiresAt, maxUses, canCreateBots ? 1 : 0, botLimit],
    );
    const id = Number(result.insertId);
    for (const instanceId of instanceIds) {
      await connection.query("INSERT INTO invite_token_instances (token_id, instance_id) VALUES (?, ?)", [id, instanceId]);
    }
    await connection.commit();
    return id;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function revokeInvite(id) {
  await pool.query("UPDATE invite_tokens SET revoked_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND revoked_at IS NULL", [id]);
}

export async function deleteInvite(id) {
  await pool.query("DELETE FROM invite_tokens WHERE id = ?", [id]);
}

// One transaction. The conditional UPDATE locks the token row, so concurrent use cannot pass max_uses.
export async function registerWithInvite({ tokenHash, username, passwordHash }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [updated] = await connection.query(
      `UPDATE invite_tokens SET use_count = use_count + 1
       WHERE token_hash = ? AND revoked_at IS NULL AND use_count < max_uses
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP(3))`,
      [tokenHash],
    );
    if (updated.affectedRows !== 1) throw new HttpError("This invite token is not valid.", 400);
    const [tokens] = await connection.query(
      "SELECT id, label, can_create_bots, bot_limit FROM invite_tokens WHERE token_hash = ? LIMIT 1",
      [tokenHash],
    );
    const invite = tokens[0];
    const [links] = await connection.query(
      `SELECT l.instance_id FROM invite_token_instances l JOIN instances i ON i.id = l.instance_id WHERE l.token_id = ?`,
      [invite.id],
    );
    if (!links.length) throw new HttpError("This invite token is not valid.", 400);
    let userId;
    try {
      const [result] = await connection.query(
        "INSERT INTO users (username, password_hash, role, bot_limit, can_create_bots) VALUES (?, ?, 'user', ?, ?)",
        [username, passwordHash, invite.bot_limit == null ? null : Number(invite.bot_limit), invite.can_create_bots ? 1 : 0],
      );
      userId = Number(result.insertId);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw new HttpError("Username is already taken", 400);
      throw err;
    }
    for (const link of links) {
      await connection.query("INSERT INTO instance_grants (instance_id, user_id, can_control) VALUES (?, ?, 1)", [
        Number(link.instance_id),
        userId,
      ]);
    }
    await connection.commit();
    return { userId, inviteId: Number(invite.id), label: invite.label || "" };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
