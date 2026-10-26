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
    baseUrl: row.base_url,
    instanceMode: row.instance_mode,
    instanceRef: row.instance_ref,
    useInstance: row.instance_mode !== "none",
    apiUser: row.api_user || "",
    apiToken,
    hasToken: Boolean(row.api_token_enc),
    enabled: Boolean(row.enabled),
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

export function publicBot(bot, { admin = false } = {}) {
  return {
    id: bot.id,
    name: bot.name,
    enabled: bot.enabled,
    notes: bot.notes,
    instanceMode: bot.instanceMode,
    instanceRef: bot.instanceRef,
    baseUrl: admin ? bot.baseUrl : null,
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
    "SELECT id, username, password_hash, role FROM users WHERE username = ? LIMIT 1",
    [username],
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  const [rows] = await pool.query("SELECT id, username, password_hash, role FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

export async function listUsers() {
  const [rows] = await pool.query(
    "SELECT id, username, role, created_at, last_login_at FROM users ORDER BY username",
  );
  return rows.map((row) => ({
    id: Number(row.id),
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }));
}

export async function createUser({ username, passwordHash, role }) {
  try {
    const [result] = await pool.query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [
      username,
      passwordHash,
      role,
    ]);
    return Number(result.insertId);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new HttpError("Username is already taken", 400);
    throw err;
  }
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
    `SELECT s.csrf_token, u.id AS user_id, u.username, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP(3)
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  return {
    csrf: rows[0].csrf_token,
    userId: Number(rows[0].user_id),
    username: rows[0].username,
    role: rows[0].role,
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

const BOT_COLUMNS = `id, name, base_url, instance_mode, instance_ref, api_user, api_token_enc, enabled, notes, created_at`;

export async function listBots() {
  const [rows] = await pool.query(`SELECT ${BOT_COLUMNS} FROM bots ORDER BY name`);
  return rows;
}

export async function listBotsForUser(userId) {
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.base_url, b.instance_mode, b.instance_ref, b.api_user, b.api_token_enc,
            b.enabled, b.notes, b.created_at, g.can_control
     FROM bots b
     JOIN bot_grants g ON g.bot_id = b.id
     WHERE g.user_id = ? AND b.enabled = 1
     ORDER BY b.name`,
    [userId],
  );
  return rows;
}

export async function listBotSummaries() {
  const [rows] = await pool.query(
    `SELECT b.id, b.name, b.enabled, b.instance_mode, b.instance_ref, b.base_url,
            (SELECT COUNT(*) FROM bot_grants g WHERE g.bot_id = b.id) AS grant_count
     FROM bots b
     ORDER BY b.name`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    enabled: Boolean(row.enabled),
    instanceMode: row.instance_mode,
    instanceRef: row.instance_ref,
    baseUrl: row.base_url,
    grantCount: Number(row.grant_count),
  }));
}

export async function getBotRow(id) {
  const [rows] = await pool.query(`SELECT ${BOT_COLUMNS} FROM bots WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function accessToBot(user, botId) {
  const row = await getBotRow(botId);
  if (!row) return null;
  if (user.role === "admin") return { bot: mapBot(row, { token: true }), canControl: true };
  if (!row.enabled) return null;
  const grant = await getGrant(botId, user.id);
  if (!grant) return null;
  return { bot: mapBot(row, { token: true }), canControl: Boolean(grant.can_control) };
}

export async function insertBot(fields) {
  const [result] = await pool.query(
    `INSERT INTO bots (name, base_url, instance_mode, instance_ref, api_user, api_token_enc, enabled, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.name,
      fields.baseUrl,
      fields.instanceMode,
      fields.instanceRef,
      fields.apiToken ? fields.apiUser : null,
      fields.apiToken ? encrypt(fields.apiToken) : null,
      fields.enabled ? 1 : 0,
      fields.notes || null,
    ],
  );
  return Number(result.insertId);
}

export async function updateBot(id, fields) {
  const params = [
    fields.name,
    fields.baseUrl,
    fields.instanceMode,
    fields.instanceRef,
    fields.enabled ? 1 : 0,
    fields.notes || null,
  ];
  let sql = `UPDATE bots
     SET name = ?, base_url = ?, instance_mode = ?, instance_ref = ?, enabled = ?, notes = ?`;
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

export async function updateInstance(id, instance) {
  await pool.query("UPDATE bots SET instance_mode = ?, instance_ref = ? WHERE id = ?", [
    instance.mode,
    instance.ref,
    id,
  ]);
}

export async function deleteBot(id) {
  await pool.query("DELETE FROM bots WHERE id = ?", [id]);
}

export async function getGrant(botId, userId) {
  const [rows] = await pool.query(
    "SELECT can_control FROM bot_grants WHERE bot_id = ? AND user_id = ? LIMIT 1",
    [botId, userId],
  );
  return rows[0] || null;
}

export async function listGrants(botId) {
  const [rows] = await pool.query(
    "SELECT user_id, can_control FROM bot_grants WHERE bot_id = ?",
    [botId],
  );
  return rows.map((row) => ({ userId: Number(row.user_id), canControl: Boolean(row.can_control) }));
}

export async function replaceGrants(botId, grants) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM bot_grants WHERE bot_id = ?", [botId]);
    for (const grant of grants) {
      await connection.query("INSERT INTO bot_grants (bot_id, user_id, can_control) VALUES (?, ?, ?)", [
        botId,
        grant.userId,
        grant.canControl ? 1 : 0,
      ]);
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function addAudit({ userId = null, botId = null, action, detail = null }) {
  await pool.query("INSERT INTO audit_log (user_id, bot_id, action, detail) VALUES (?, ?, ?, ?)", [
    userId,
    botId,
    String(action).slice(0, 64),
    clip(detail),
  ]);
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
    `SELECT a.created_at, a.action, a.detail, u.username, b.name AS bot_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN bots b ON b.id = a.bot_id
     ORDER BY a.id DESC
     LIMIT ${safeLimit}`,
  );
  return rows.map((row) => ({
    createdAt: row.created_at,
    action: row.action,
    detail: row.detail || "",
    username: row.username || "",
    botName: row.bot_name || "",
  }));
}
