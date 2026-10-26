import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE_RE = /^(\d{3}_[a-z0-9_]+)\.sql$/;

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

export async function applyMigrations(pool, migrations = loadMigrations()) {
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

  await pool.query(BOOTSTRAP);
  const [rows] = await pool.query("SELECT version, checksum FROM schema_migrations");
  const applied = new Map(rows.map((row) => [row.version, row.checksum]));
  for (const version of applied.keys()) {
    if (!seen.has(version)) {
      throw new Error(`Database has migration ${version} which this panel does not include.`);
    }
  }

  for (const migration of migrations) {
    const checksum = applied.get(migration.version);
    if (checksum) {
      if (checksum !== migration.checksum) {
        throw new Error(`Migration ${migration.version} changed after it was applied.`);
      }
      continue;
    }
    for (const statement of migration.statements) {
      await pool.query(statement);
    }
    await pool.query("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)", [
      migration.version,
      migration.checksum,
    ]);
  }
}
