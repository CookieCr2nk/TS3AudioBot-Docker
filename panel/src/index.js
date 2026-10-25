import { createApp } from "./app.js";
import { config, runtimeWarnings } from "./config.js";
import { ensureAdmin, migrate, pool } from "./db.js";

for (const warning of runtimeWarnings()) console.warn(`[panel] ${warning}`);

try {
  await migrate();
  const created = await ensureAdmin();
  if (created.created) {
    console.warn(`[panel] Admin-Zugang angelegt. Benutzer: ${created.username}`);
    if (created.generatedPassword) {
      console.warn(`[panel] Passwort: ${created.generatedPassword}`);
      console.warn("[panel] Bitte nach dem Login unter Konto ändern.");
    }
  }
} catch (err) {
  console.error("[panel] Start fehlgeschlagen:", err.message);
  process.exit(1);
}

const app = createApp();
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`[panel] listening on :${config.port}`);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
