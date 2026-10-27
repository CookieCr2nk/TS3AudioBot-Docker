# AGENTS.md

Read this file before changing anything under `panel/`. Repository rules are in `../AGENTS.md`.

## What the panel is

Hosting UI for the TS3AudioBot web API. Node.js 22, ESM, Express, MariaDB through `mysql2`. The browser UI is a Vite and React app in `client/`. The server sends JSON under `/api` and, after `npm run build`, serves `dist/`. Start the API with `node src/index.js`. During development, run `npm run client` as well. Vite proxies `/api` to port 8080.

The repository language rule is in `../AGENTS.md`: everything is English except translation catalogs. The UI source strings are English. When the browser prefers German, those strings are looked up in `src/locales/de.js`. Every new `t("...")` string and every `HttpError`, `ValidationError`, or `Ts3ApiError` with a fixed English sentence needs an entry there. Otherwise `keeps every panel phrase in the German catalog` fails. Do not add a second catalog unless the user asks for another language.

## Layout

```
src/index.js          startup: migrations, admin account, HTTP
src/app.js            Express, Helmet, sessions, errors
src/actions.js        allowed bot commands
src/ts3ab.js          bot API paths
src/db.js             queries
src/schema.js         apply migrations
src/api.js            JSON API used by the client
src/locales/de.js     German UI strings
client/               React UI, English source strings
sql/migrations/       NNN_name.sql, in order
test/panel.test.js    node:test, no database
```

The shell in `client/src/app.jsx` stays mounted while the open bot changes page. A save posts JSON and stays on the current route. Do not replace that with a full document load. Playback stays in the bar at the bottom of that shell. Bots is a separate page: it lists every bot the account can open, and one playback action can apply to the selected bots. That action is only pause, resume, stop, previous, next, clear, volume, play, or add.

Commands to the bot go only through `actions.js`. There is no free-form command from the client. `quit`, `eval`, `rights`, `system`, and `api` stay blocked. A new command is an entry with a parser, a path, and a right (`control` or `admin`), plus a test.

## Database

Schema changes are new files `sql/migrations/007_name.sql`. Do not edit a file that is already recorded in `schema_migrations`. `005_bot_limit.sql` adds `users.bot_limit`. `006_bot_access.sql` makes `users.password_hash` nullable, adds `users.can_create_bots`, and adds `ts_bots.assignee_user_id`. Startup refuses a different checksum and a version this image no longer ships.

Statements must be safe to run again. MariaDB commits DDL one statement at a time. The version row is inserted only after the last statement. Startup logs when the process starts, when it is ready, and when it stops. A failed startup still listens and logs that it is not ready. It also logs each migration it applies, and logs when the schema is already current. `001_baseline.sql` is the old `schema.sql`. Do not bring that file back as a second source.

One Docker container is one row in `instances` (address, encrypted token, owner, enabled). TeamSpeak bots inside that process are rows in `ts_bots`, unique by instance and template name. `instance_grants` lets other accounts control those bots. The owner and administrators can create and delete bots. A granted user can create bots only when `users.can_create_bots` is on. Otherwise an administrator assigns the bot (`ts_bots.assignee_user_id`). The assignee can open that bot. `users.bot_limit` counts bots assigned to the account, and unassigned bots count for the instance owner. NULL means unlimited. An instance with no owner has no limit. The panel does not start containers. `users.suspended` blocks sign-in and the suspend action deletes that account's sessions. An account with no password hash cannot sign in.

`003_hosting.sql` copies old `bots` rows and is safe to run again until it is recorded. `004_drop_legacy_bots.sql` drops `bots` and `bot_grants` after that copy.

Radio stations live in `radio_streams`, not in the bot files. `shared = 1` is the catalog everyone can see. A private station is visible to its owner. Administrators see all of them. Deleting an account keeps a shared station (`owner_user_id` becomes NULL). The URL shown in the list has no credentials. The stored URL the bot plays still does.

## Hosting fields

On Connection, `template-hosting` writes nickname, channel, server password, channel password, bitrate, default volume (`audio.volume.default`), start-on-launch, and an optional HTTP or HTTPS stream into the bot template. The stream is stored as a quoted `!play` command on `events.onconnect`. The panel builds that command. Empty fields stay as they are. A connected bot also receives `bot name` so the nickname changes without a reconnect. Passwords are not stored in the panel database and are not written into the audit text. Channel commander is saved in `events.onconnect` as `!bot commander on`, together with a startup stream when one is set, and is also applied to the connected bot. Connection reads `bot info client` and shows the TeamSpeak ID. Creating a bot calls `settings/create` on the instance and inserts a `ts_bots` row only after the API accepts it. Attaching an existing template name, such as `default`, inserts the row without calling the API.

## Security

- CSRF header `X-CSRF-Token` on writes. The session cookie is `ts3panel`. Do not add a cookie without the same protection.
- Content-Security-Policy: scripts only from the panel origin. No inline script, no third-party CDN.
- API tokens are stored only encrypted with `TOKEN_KEY`. Do not log them, put them in flash messages, or write them to the audit log.
- Bot API URLs are host and port only. No credentials, no query, no metadata address.
- Resources and stream addresses sent to the bot stay HTTP or HTTPS. For a saved station the client sends the id, not the URL.

## Checks

From `panel/`: `node --test`. From the repo: `make panel-test`. `npm run build` writes `dist/`.

The tests do not need MariaDB. They check the command allow-list, the schema, and that every `t("...")` string in `src/` and `client/` is in the German catalog.

Node is often missing from `PATH` on this Windows checkout. Run the tests with a Node 22 binary, and do not treat a missing `node` on `PATH` as a pass.
