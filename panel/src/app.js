import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { ping, setFlash } from "./db.js";
import { Ts3ApiError } from "./errors.js";
import { csrfProtect, loadSession, requireAdmin, requireUser, safeReferrer, wantsJson, wrap } from "./http.js";
import { clientJson, errorText, languageFromHeader, translator } from "./i18n.js";
import { formatTime, safeHttpUrl } from "./present.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { panelRouter } from "./routes/panel.js";

const root = dirname(fileURLToPath(new URL("..", import.meta.url)));

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.set("query parser", "simple");
  app.set("view engine", "ejs");
  app.set("views", join(root, "views"));

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
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const lang = languageFromHeader(req.get("accept-language"));
    const t = translator(lang);
    req.lang = lang;
    req.t = t;
    res.set("Vary", "Accept-Language");
    res.locals.lang = lang;
    res.locals.t = t;
    res.locals.clientJson = clientJson(lang);
    res.locals.plain = false;
    res.locals.title = "TS3 Panel";
    res.locals.active = "";
    res.locals.tab = "";
    res.locals.encode = encodeURIComponent;
    res.locals.formatTime = (value) => formatTime(value, lang);
    res.locals.safeHttpUrl = safeHttpUrl;
    next();
  });

  app.get(
    "/healthz",
    wrap(async (req, res) => {
      await ping();
      res.type("text").send("ok");
    }),
  );

  app.use(express.static(join(root, "public"), { index: false }));
  app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(loadSession);
  app.use(csrfProtect);
  app.use(installRenderer);

  app.use(authRouter);
  app.use(requireUser);
  app.use(panelRouter);
  app.use("/admin", requireAdmin, adminRouter);

  app.use((req, res) => {
    const say = req.t || ((message) => message);
    res.status(404).render("error", { title: say("Not found"), message: say("That page does not exist.") });
  });

  app.use((err, req, res, next) => {
    Promise.resolve(renderError(err, req, res)).catch(next);
  });

  return app;
}

function installRenderer(req, res, next) {
  const render = res.render.bind(res);
  res.render = (view, options = {}, callback) => {
    const done =
      callback ||
      ((err, html) => {
        if (err) return next(err);
        res.send(html);
      });
    const locals = { ...res.locals, ...options };
    if (view === "layout") return render(view, locals, done);
    return render(view, locals, (err, html) => {
      if (err) return done(err);
      return render("layout", { ...locals, body: html }, done);
    });
  };
  next();
}

async function renderError(err, req, res) {
  if (res.headersSent) return;
  const status = err.status || 500;
  const safe = (err.status && err.status < 500) || err instanceof Ts3ApiError;
  const say = typeof req.t === "function" ? req.t : (message) => message;
  const message = safe ? errorText(err, say) : say("Internal error");
  if (!safe) console.error(err);
  else if (status >= 500) console.error(`[panel] ${err.message}`);

  if (wantsJson(req)) {
    res.status(status).json({ ok: false, error: message });
    return;
  }
  if (req.sessionId && req.method !== "GET" && req.method !== "HEAD") {
    await setFlash(req.sessionId, "error", message);
    res.redirect(safeReferrer(req));
    return;
  }
  res.status(status).render("error", { title: say("Error"), message }, (renderErr, html) => {
    if (renderErr || !html) {
      res.status(status).type("text").send(message);
      return;
    }
    res.status(status).send(html);
  });
}
