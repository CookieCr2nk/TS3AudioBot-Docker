import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE_RE = /^(\d{3}_[a-z0-9_]+)\.sql$/;
const BASELINE_VERSION = "001_schema";

// Checksums of the migration files shipped before 001_schema.
// Release 1.0 recorded the first ten. Images after that also recorded 011 and 012.
// A database at 010 or later is finished here. Anything shorter has no upgrade path.
const LEGACY = [
  { version: "001_baseline", checksum: "5f20be8d7a40ffbbb0da753cc316b6835fe74f3f31680438fa3f57b584001cdf", statements: [] },
  { version: "002_radio_streams", checksum: "2bcf7698fe793d3712063595415ff907d7570b8521a0c5a9dc21f9df66eaba32", statements: [] },
  { version: "003_hosting", checksum: "43812584c1a32fc2452fa692b0dc2270040c1b6ee7e740b1abf35055a3ad3e24", statements: [] },
  { version: "004_drop_legacy_bots", checksum: "0bfb87741a93580131781db6ef74602f65777ac2f268d85c78658542955b1b50", statements: [] },
  { version: "005_bot_limit", checksum: "5cb04c3a1cedaa1e88c8f6c15033f98050d9f4046f9c61dd14003df4defc5696", statements: [] },
  { version: "006_bot_access", checksum: "53411ea16d90980f6f17876de5303e92803d308a99b04b120781b60f3877a72a", statements: [] },
  { version: "007_bot_label", checksum: "28291370ba2c4f2daf8b1262bdc429a150bf88ff825793d47a098cda1f949216", statements: [] },
  { version: "008_bot_template", checksum: "4b8e55f16789cfb9860ca402bbaa1989c8363700c41b92dc14eddbbae104916e", statements: [] },
  { version: "009_bot_admins", checksum: "702e14886530ddedaaf4561cbb46a15bf4d3c6acf93d908bfb9f9856b3b690db", statements: [] },
  { version: "010_drop_bot_admins", checksum: "5d334e0a7ac000fc08d1c3390a4ad93945bb070107459002badce5e2dcfa14d2", statements: [] },
  {
    version: "011_bot_settings",
    checksum: "f205d3e0ef8d6765506cd310b816c99a7a2d29ca95eb6cadbba0dfa05b2610d0",
    statements: [
      "ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_nickname VARCHAR(30) NULL",
      "ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_channel VARCHAR(200) NULL",
      "ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_bitrate SMALLINT NULL",
      "ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_volume SMALLINT NULL",
      "ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_run TINYINT NULL",
      "ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_startup VARCHAR(500) NULL",
      "ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_server_password TINYINT NOT NULL DEFAULT 0",
      "ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_channel_password TINYINT NOT NULL DEFAULT 0",
    ],
  },
  {
    version: "012_bot_address",
    checksum: "b9f0c2adf881566b906efc68c2cf8ce1c6f73722eb9b09135ac84b75c2b1c470",
    statements: ["ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_address VARCHAR(200) NULL"],
  },
];
const LEGACY_SQUASH_LENGTH = 10;

const BOOTSTRAP = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export function normalizeSql(sql) {
  return String(sql).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function statementsFromSchema(sql) {
  const withoutComments = normalizeSql(sql).replace(/--[^\n]*/g, "");
  return withoutComments
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function migrationFromSource(version, sql) {
  const normalized = normalizeSql(sql);
  return {
    version,
    checksum: createHash("sha256").update(normalized, "utf8").digest("hex"),
    statements: statementsFromSchema(normalized),
  };
}

export function legacyMigrations() {
  return LEGACY.map((item) => ({ ...item, statements: [...item.statements] }));
}

export function loadMigrations(directory = new URL("../sql/migrations/", import.meta.url)) {
  const dir = directory instanceof URL ? fileURLToPath(directory) : directory;
  const names = readdirSync(dir)
    .filter((name) => FILE_RE.test(name))
    .sort();
  return names.map((name) => migrationFromSource(name.slice(0, -4), readFileSync(join(dir, name), "utf8")));
}

function validateMigrations(migrations) {
  if (!migrations.length) throw new Error("No database migrations found.");
  const seen = new Set();
  let previous = "";
  for (const migration of migrations) {
    if (!FILE_RE.test(`${migration.version}.sql`)) {
      throw new Error(`Migration ${migration.version} has an invalid name.`);
    }
    if (seen.has(migration.version) || migration.version <= previous) {
      throw new Error(`Migration ${migration.version} is out of order.`);
    }
    if (!migration.statements.length) throw new Error(`Migration ${migration.version} has no statements.`);
    seen.add(migration.version);
    previous = migration.version;
  }
}

function assertKnownVersions(applied, migrations) {
  const known = new Set(LEGACY.map((item) => item.version));
  for (const migration of migrations) known.add(migration.version);
  for (const version of applied.keys()) {
    if (!known.has(version)) {
      throw new Error(`Database has migration ${version} which this panel does not include.`);
    }
  }
}

function legacyPrefix(applied) {
  let length = 0;
  while (length < LEGACY.length && applied.has(LEGACY[length].version)) length += 1;
  for (let index = length; index < LEGACY.length; index += 1) {
    if (applied.has(LEGACY[index].version)) {
      throw new Error(`Database has migration ${LEGACY[index].version} without the earlier panel migrations.`);
    }
  }
  if (length === 0) return 0;
  if (length < LEGACY_SQUASH_LENGTH) {
    throw new Error(
      `Database has migration history through ${LEGACY[length - 1].version} and this panel cannot finish it.`,
    );
  }
  for (let index = 0; index < length; index += 1) {
    const item = LEGACY[index];
    if (applied.get(item.version) !== item.checksum) {
      throw new Error(`Migration ${item.version} changed after it was applied.`);
    }
  }
  return length;
}

async function applyLegacyTail(pool, fromLength) {
  for (let index = fromLength; index < LEGACY.length; index += 1) {
    const item = LEGACY[index];
    if (!item.statements.length) continue;
    const total = item.statements.length;
    console.log(
      `[panel] Applying database migration ${item.version} (${total} ${total === 1 ? "statement" : "statements"})`,
    );
    for (const statement of item.statements) await pool.query(statement);
    console.log(`[panel] Applied database migration ${item.version}`);
  }
}

async function withTransaction(pool, run) {
  if (typeof pool.getConnection !== "function") {
    await run(pool);
    return;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await run(connection);
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The original error is the one startup should report.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function writeCollapsedHistory(pool, applied, baseline) {
  const legacyVersions = LEGACY.map((item) => item.version).filter((version) => applied.has(version));
  const placeholders = legacyVersions.map(() => "?").join(", ");
  await withTransaction(pool, async (db) => {
    if (!applied.has(baseline.version)) {
      await db.query("INSERT IGNORE INTO schema_migrations (version, checksum) VALUES (?, ?)", [
        baseline.version,
        baseline.checksum,
      ]);
    }
    await db.query(`DELETE FROM schema_migrations WHERE version IN (${placeholders})`, legacyVersions);
  });
  for (const version of legacyVersions) applied.delete(version);
  applied.set(baseline.version, baseline.checksum);
}

export async function applyMigrations(pool, migrations = loadMigrations()) {
  validateMigrations(migrations);
  await pool.query(BOOTSTRAP);
  const [rows] = await pool.query("SELECT version, checksum FROM schema_migrations");
  const applied = new Map(rows.map((row) => [row.version, row.checksum]));
  assertKnownVersions(applied, migrations);

  const prefix = legacyPrefix(applied);
  if (prefix > 0) {
    const baseline = migrations.find((migration) => migration.version === BASELINE_VERSION);
    if (!baseline) throw new Error(`Migration ${BASELINE_VERSION} is missing.`);
    const recorded = applied.get(baseline.version);
    if (recorded && recorded !== baseline.checksum) {
      throw new Error(`Migration ${baseline.version} changed after it was applied.`);
    }
    await applyLegacyTail(pool, prefix);
    await writeCollapsedHistory(pool, applied, baseline);
    console.log(`[panel] Replaced applied migration history with ${BASELINE_VERSION}`);
  }

  let appliedCount = 0;
  for (const migration of migrations) {
    const checksum = applied.get(migration.version);
    if (checksum) {
      if (checksum !== migration.checksum) {
        throw new Error(`Migration ${migration.version} changed after it was applied.`);
      }
      continue;
    }
    const total = migration.statements.length;
    console.log(
      `[panel] Applying database migration ${migration.version} (${total} ${total === 1 ? "statement" : "statements"})`,
    );
    for (const statement of migration.statements) await pool.query(statement);
    await pool.query("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)", [
      migration.version,
      migration.checksum,
    ]);
    applied.set(migration.version, migration.checksum);
    appliedCount += 1;
    console.log(`[panel] Applied database migration ${migration.version}`);
  }
  if (appliedCount === 0) {
    console.log("[panel] Database schema is current");
  } else {
    console.log(`[panel] Applied ${appliedCount} database ${appliedCount === 1 ? "migration" : "migrations"}`);
  }
}
