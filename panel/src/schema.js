import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE_RE = /^(\d{3}_[a-z0-9_]+)\.sql$/;
// Migration history recorded by panel images before 001_schema existed. This panel does not convert it.
const OLD_HISTORY = "001_baseline";

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
  if (applied.has(OLD_HISTORY)) {
    throw new Error(
      `Database has the migration history of an older panel (${OLD_HISTORY}). This panel no longer converts it. Back up the database and start with an empty one, or run an older panel image once to convert it.`,
    );
  }
  const known = new Set(migrations.map((migration) => migration.version));
  for (const version of applied.keys()) {
    if (!known.has(version)) {
      throw new Error(`Database has migration ${version} which this panel does not include.`);
    }
  }
}

export async function applyMigrations(pool, migrations = loadMigrations()) {
  validateMigrations(migrations);
  await pool.query(BOOTSTRAP);
  const [rows] = await pool.query("SELECT version, checksum FROM schema_migrations");
  const applied = new Map(rows.map((row) => [row.version, row.checksum]));
  assertKnownVersions(applied, migrations);

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
