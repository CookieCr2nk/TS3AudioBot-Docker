import { createApp } from "./app.js";
import { config, runtimeWarnings } from "./config.js";
import { ensureAdmin, migrate, pool } from "./db.js";

console.log("[panel] Starting");

for (const warning of runtimeWarnings()) console.warn(`[panel] ${warning}`);

let startupError = null;
try {
  await migrate();
  const created = await ensureAdmin();
  if (created.created) {
    console.warn(`[panel] Created admin account. User: ${created.username}`);
    if (created.generatedPassword) {
      console.warn(`[panel] Password: ${created.generatedPassword}`);
      console.warn("[panel] Change it under Account after signing in.");
    }
  }
} catch (err) {
  startupError = err;
  console.error("[panel] Startup failed:", err.message);
}

const app = createApp({ startupError });
const server = app.listen(config.port, "0.0.0.0", () => {
  if (startupError) {
    console.error(`[panel] Listening on :${config.port}. Not ready: ${startupError.message}`);
    return;
  }
  console.log(`[panel] Ready on :${config.port}`);
});

function shutdown() {
  console.log("[panel] Stopping");
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
