import { readFileSync } from "node:fs";

export function statementsFromSchema(sql) {
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  return withoutComments
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function loadSchemaSql() {
  return readFileSync(new URL("../sql/schema.sql", import.meta.url), "utf8");
}

export async function applySchema(pool) {
  const statements = statementsFromSchema(loadSchemaSql());
  for (const statement of statements) {
    await pool.query(statement);
  }
}
