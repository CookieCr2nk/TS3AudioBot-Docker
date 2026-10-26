import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { api, apiError } from "./api.js";
import { config } from "./config.js";
import { ping } from "./db.js";
import { failureFor } from "./errors.js";
import { loadSession, wantsJson, wrap } from "./http.js";
import { errorText, languageFromHeader, translator } from "./i18n.js";

// dirname("/app/") is "/" on Linux. Resolve from this file, which lives in src/.
export function panelRoot(moduleFile, pathApi = path) {
  return pathApi.join(pathApi.dirname(moduleFile), "..");
}

const root = panelRoot(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

export function createApp({ startupError = null } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.set("query parser", "simple");

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const lang = languageFromHeader(req.get("accept-language"));
    req.lang = lang;
    req.t = translator(lang);
    res.set("Vary", "Accept-Language");
    next();
  });

  app.get(
    "/healthz",
    wrap(async (req, res) => {
      if (startupError) {
        respondWithFailure(req, res, startupError, { startup: true });
        return;
      }
      try {
        await ping();
      } catch (err) {
        const failure = failureFor(err);
        console.error(`[panel] ${err.code || ""} ${err.message}`.trim());
        res.status(failure ? failure.status : 500).type("text").send(failure ? failure.message : "error");
        return;
      }
      res.type("text").send("ok");
    }),
  );

  if (startupError) {
    app.use((req, res) => {
      respondWithFailure(req, res, startupError, { startup: true });
    });
    return app;
  }

  app.use(loadSession);
  app.use("/api", api);
  app.use("/api", apiError);

  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path === "/healthz" || req.path.startsWith("/api")) return next();
      res.set("Cache-Control", "no-store");
      res.sendFile(join(dist, "index.html"));
    });
  }

  app.use((req, res) => {
    const say = req.t || ((message) => message);
    const message = say("That page does not exist.");
    if (wantsJson(req) || req.path.startsWith("/api")) {
      res.status(404).json({ ok: false, error: message });
      return;
    }
    res.status(404).type("text").send(message);
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    respondWithFailure(req, res, err);
  });

  return app;
}

function respondWithFailure(req, res, err, options = {}) {
  if (res.headersSent) return;
  const failure = failureFor(err, options);
  const status = failure?.status || err.status || 500;
  const say = typeof req.t === "function" ? req.t : (message) => message;
  const message = failure ? errorText(failure, say) : say("Internal error");
  if (!failure) console.error(err);
  else if (status >= 500) console.error(`[panel] ${err.code || ""} ${err.message}`.trim());

  if (wantsJson(req) || req.path.startsWith("/api")) {
    res.status(status).json({ ok: false, error: message });
    return;
  }
  res.status(status).type("text").send(message);
}
