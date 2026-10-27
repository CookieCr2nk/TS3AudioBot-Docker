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

export function mapBot(row, { token = false } = {}) {
  let apiToken = null;
  if (token && row.api_token_enc) {
    try {
      apiToken = decrypt(row.api_token_enc);
    } catch {
      throw new HttpError("Cannot read the API token. Check TOKEN_KEY.", 422);
    }
  }
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
    hasToken: Boolean(row.api_token_enc),
    enabled: Boolean(row.enabled),
    notes: row.notes || "",
    assigneeUserId: row.assignee_user_id == null ? null : Number(row.assignee_user_id),
    assigneeName: row.assignee_name || "",
    ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
    ownerName: row.owner_name || "",
    createdAt: row.created_at,
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
    ownerName: bot.assigneeName || bot.ownerName || "",
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
    "SELECT id, username, password_hash, role, suspended FROM users WHERE username = ? LIMIT 1",
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

export async function countAdmins() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'");
  return Number(rows[0].total);
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

export async function setFlash(id, type, message) {
  await pool.query("UPDATE sessions SET flash_type = ?, flash_message = ? WHERE id = ?", [
    type,
    clip(message),
    id,
  ]);
}

export async function takeFlash(id) {
  const [rows] = await pool.query("SELECT flash_type, flash_message FROM sessions WHERE id = ? LIMIT 1", [id]);
  if (!rows[0]?.flash_message) return null;
  await pool.query("UPDATE sessions SET flash_type = NULL, flash_message = NULL WHERE id = ?", [id]);
  return { type: rows[0].flash_type || "info", message: rows[0].flash_message };
}

const INSTANCE_COLUMNS = `i.id, i.name, i.base_url, i.owner_user_id, i.api_user, i.api_token_enc, i.enabled, i.notes, i.created_at`;

const TS_BOT_JOIN = `t.id, t.name, t.label, t.template, i.base_url, 'template' AS instance_mode, IFNULL(t.template, t.name) AS instance_ref,
            i.api_user, i.api_token_enc, i.enabled, i.notes, t.created_at,
            i.id AS instance_id, i.name AS instance_name, i.owner_user_id, t.assignee_user_id,
            (SELECT au.username FROM users au WHERE au.id = t.assignee_user_id) AS assignee_name,
            (SELECT ou.username FROM users ou WHERE ou.id = i.owner_user_id) AS owner_name`;

function mapInstance(row, { token = false } = {}) {
  let apiToken = null;
  if (token && row.api_token_enc) {
    try {
      apiToken = decrypt(row.api_token_enc);
    } catch {
      throw new HttpError("Cannot read the API token. Check TOKEN_KEY.", 422);
    }
  }
  return {
    id: Number(row.id),
    name: row.name,
    baseUrl: row.base_url,
    ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id),
    ownerName: row.owner_name || "",
    apiUser: row.api_user || "",
    apiToken,
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
  };
}

export async function listInstances() {
  const [rows] = await pool.query(
    `SELECT ${INSTANCE_COLUMNS}, u.username AS owner_name,
            (SELECT COUNT(*) FROM ts_bots t WHERE t.instance_id = i.id) AS bot_count,
            (SELECT COUNT(*) FROM instance_grants g WHERE g.instance_id = i.id) AS grant_count
     FROM instances i
     LEFT JOIN users u ON u.id = i.owner_user_id
     ORDER BY i.name`,
  );
  return rows.map((row) => mapInstance(row));
}

export async function listInstancesForUser(userId) {
  const [rows] = await pool.query(
    `SELECT ${INSTANCE_COLUMNS}, u.username AS owner_name,
            (SELECT COUNT(*) FROM ts_bots t WHERE t.instance_id = i.id) AS bot_count,
            (SELECT COUNT(*) FROM instance_grants g2 WHERE g2.instance_id = i.id) AS grant_count,
            CASE WHEN i.owner_user_id = ? THEN 1 ELSE IFNULL(g.can_control, 0) END AS can_control
     FROM instances i
     LEFT JOIN users u ON u.id = i.owner_user_id
     LEFT JOIN instance_grants g ON g.instance_id = i.id AND g.user_id = ?
     WHERE i.enabled = 1 AND (i.owner_user_id = ? OR g.user_id = ?)
     ORDER BY i.name`,
    [userId, userId, userId, userId],
  );
  return rows.map((row) => ({ ...mapInstance(row), canControl: Boolean(row.can_control) }));
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
  }
  sql += " WHERE id = ?";
  params.push(id);
  await pool.query(sql, params);
}

export async function deleteInstance(id) {
  await pool.query("DELETE FROM instances WHERE id = ?", [id]);
}

export async function listAccessibleBots(user) {
  if (user.role === "admin") {
    const [rows] = await pool.query(
      `SELECT ${TS_BOT_JOIN}
       FROM ts_bots t
       JOIN instances i ON i.id = t.instance_id
       ORDER BY i.name, t.name`,
    );
    return rows.map((row) => ({ bot: mapBot(row, { token: true }), canControl: true, canManage: true }));
  }
  const [rows] = await pool.query(
    `SELECT ${TS_BOT_JOIN}, 1 AS can_control
     FROM ts_bots t
     JOIN instances i ON i.id = t.instance_id
     WHERE i.enabled = 1 AND (i.owner_user_id = ? OR t.assignee_user_id = ?)
     ORDER BY i.name, t.name`,
    [user.id, user.id],
  );
  return rows.map((row) => ({
    bot: mapBot(row, { token: true }),
    canControl: Boolean(row.can_control),
    canManage: row.owner_user_id != null && Number(row.owner_user_id) === user.id,
  }));
}

export async function listTsBots(instanceId) {
  const [rows] = await pool.query(
    `SELECT ${TS_BOT_JOIN}
     FROM ts_bots t
     JOIN instances i ON i.id = t.instance_id
     WHERE t.instance_id = ?
     ORDER BY t.name`,
    [instanceId],
  );
  return rows;
}

export async function getTsBotRow(id) {
  const [rows] = await pool.query(
    `SELECT ${TS_BOT_JOIN}
     FROM ts_bots t
     JOIN instances i ON i.id = t.instance_id
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
  const name = displayName || template;
  try {
    const [result] = await pool.query(
      "INSERT INTO ts_bots (instance_id, name, template, assignee_user_id) VALUES (?, ?, ?, ?)",
      [instanceId, name, template, assigneeUserId],
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
  if (user.role === "admin") return { bot, canControl: true, canManage: true };
  if (!row.enabled) return null;
  if (row.owner_user_id != null && Number(row.owner_user_id) === user.id) {
    return { bot, canControl: true, canManage: true };
  }
  if (row.assignee_user_id != null && Number(row.assignee_user_id) === user.id) {
    return { bot, canControl: true, canManage: false };
  }
  return null;
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

export async function listAudit(limit = 200) {
  const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit)) || 200));
  const [rows] = await pool.query(
    `SELECT a.created_at, a.action, a.detail, u.username, i.name AS instance_name, t.name AS bot_name
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
