# AGENTS.md

Read this file before changing anything under `panel/`. Repository rules are in `../AGENTS.md`.

## What the panel is

Hosting UI for the TS3AudioBot web API. Node.js 22, ESM, Express, EJS, MariaDB through `mysql2`. No bundler. Start with `node src/index.js`.

The UI source language is English. When the browser prefers German, strings come from `src/locales/de.js`. Every new `t("...")` string and every `HttpError`, `ValidationError`, or `Ts3ApiError` with a fixed English sentence needs an entry there. Otherwise `keeps every panel phrase in the German catalog` fails. Do not add a second catalog file.

## Layout

```
src/index.js          startup: migrations, admin account, HTTP
src/app.js            Express, Helmet, sessions, errors
src/actions.js        allowed bot commands
src/ts3ab.js          bot API paths
src/db.js             queries
src/schema.js         apply migrations
src/routes/           auth, panel, admin
src/locales/de.js     German UI strings
sql/migrations/       NNN_name.sql, in order
views/                EJS, English
public/               CSS and client.js, no inline script
test/panel.test.js    node:test, no database
```

Commands to the bot go only through `actions.js`. There is no free-form command from the client. `quit`, `eval`, `rights`, `system`, and `api` stay blocked. A new command is an entry with a parser, a path, and a right (`control` or `admin`), plus a test.

## Database

Schema changes are new files `sql/migrations/003_name.sql`. Do not edit a file that is already recorded in `schema_migrations`. Startup refuses a different checksum and a version this image no longer ships.

Statements must be safe to run again. MariaDB commits DDL one statement at a time. The version row is inserted only after the last statement. `001_baseline.sql` is the old `schema.sql`. Do not bring that file back as a second source.

Radio stations live in `radio_streams`, not in the bot files. `shared = 1` is the catalog everyone can see. A private station is visible to its owner. Administrators see all of them. Deleting an account keeps a shared station (`owner_user_id` becomes NULL). The URL shown in the list has no credentials. The stored URL the bot plays still does.

## Hosting fields

On Instances, `template-hosting` writes nickname, channel, server password, channel password, bitrate, and start-on-launch into the bot template. Empty fields stay as they are. Passwords and the privilege key are not stored in the panel database and are not written into the audit text. `bot setup` applies to the instance that currently controls playback.

## Security

- CSRF on forms that write. Session cookie. Do not add a cookie without the same protection.
- Content-Security-Policy: scripts only from the panel origin. No inline script, no third-party CDN.
- API tokens are stored only encrypted with `TOKEN_KEY`. Do not log them, put them in flash messages, or write them to the audit log.
- Bot API URLs are host and port only. No credentials, no query, no metadata address.
- Resources and stream addresses sent to the bot stay HTTP or HTTPS. For a saved station the client sends the id, not the URL.

## Checks

From `panel/`: `node --test`. From the repo: `make panel-test`.

The tests do not need MariaDB. They render every EJS view. A new view needs the fields passed as locals in `test/panel.test.js`, or `renders the English templates` fails.

Node is often missing from `PATH` on this Windows checkout. Run the tests with a Node 22 binary, and do not treat a missing `node` on `PATH` as a pass.
