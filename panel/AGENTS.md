# AGENTS.md

Read this file before changing anything under `panel/`. Repository rules are in `../AGENTS.md`.

## What the panel is

Hosting UI for the TS3AudioBot web API. Node.js 26, ESM, Express, MariaDB through `mysql2`. The browser UI is a Vite and React app in `client/`. The server sends JSON under `/api` and, after `npm run build`, serves `dist/`. Start the API with `node src/index.js`. During development, run `npm run client` as well. Vite proxies `/api` to port 8080.

The repository language rule is in `../AGENTS.md`. The UI source strings are English. `src/i18n.js` lists the languages. English is the source and has no catalog. German is `src/locales/de.js`. Automatic follows `Accept-Language`. A saved choice in the cookie `ts3panel-lang` overrides it. The flag button sits to the right of the panel name and on the sign-in page. To add a language, add `src/locales/<id>.js` and one entry in `languages` and `catalogs`. Every new `t("...")` string and every `HttpError`, `ValidationError`, or `Ts3ApiError` with a fixed English sentence needs an entry in every catalog. Otherwise `keeps every panel phrase in each translation catalog` fails. Do not add a catalog unless the user asks for that language.

## Layout

```
src/index.js          startup: migrations, admin account, HTTP
src/app.js            Express, Helmet, sessions, errors
src/actions.js        allowed bot commands
src/ts3ab.js          bot API paths
src/db.js             queries
src/schema.js         apply migrations
src/api.js            JSON API used by the client
src/locales/<id>.js   translation catalogs. English has none
client/               React UI, English source strings
sql/migrations/       NNN_name.sql, in order
test/panel.test.js    node:test, no database
```

The shell in `client/src/app.jsx` stays mounted while the open bot changes page. A save posts JSON and stays on the current route. Do not replace that with a full document load. Playback stays in the bar at the bottom of that shell, and only while a bot page is open. Bots is a separate page. It lists every bot the account can open. The bulk bar under that list only starts or stops the selected bots. It is open only while at least one bot is selected. A finished start or stop clears the selection, so the bar closes. The outcome is a notice. A failed bot is named in that notice.

Commands to the bot go only through `actions.js`. There is no free-form command from the client. `quit`, `eval`, `rights`, `system`, and `api` stay blocked. A new command is an entry with a parser, a path, and a right (`control` or `admin`), plus a test.

## Map

Read this section before changing a page. The human guide is `../README.md`. This section is the code map.

### Browser routes

`client/src/app.jsx` keeps one shell mounted. Bot pages do not remount when the id in `/bots/:id` changes. `useLoad` drops the previous payload when its path changes. A page that keeps its own state, such as a search box, must reset that state when the id changes.

| Route | Page | Who |
|---|---|---|
| `/` | Overview. Instance, bot, and account status, then the instance table | Signed in. A non-admin count includes only assigned bots. Account counts are administrators only |
| `/bots` | Bot table, filter, pages, bulk start and stop | Signed in. Rows come from `listAccessibleBots` |
| `/instances/:id` | Create, attach, and, for an administrator, edit or delete the instance | Signed in if the instance is visible. Settings are admin |
| `/bots/:id` | Playback, search, queue | Anyone who can open that bot |
| `/bots/:id/streams` | Radio stations | Same, plus delete on stations they may delete |
| `/bots/:id/connection` | Server address and connect first, then nickname, channel, passwords, bitrate, volume, start, stream | Same. Saving does not require `canManage` |
| `/users`, `/audit` | Accounts and the audit log. Audit can delete entries older than 24 hours | Administrator. The page also checks the role |
| `/account` | Own password and bot limit | Signed in |

The playback bar is `client/src/player.jsx`. It is empty until a bot route is open. Notices render inline on the login page and through `#toast-dock`, above that bar, everywhere else. Do not put them back at the top of the page.

The bot table ellipsizes only the Now playing column. The server address and the Volume heading stay fully visible. List tables open with that column order. A Columns control on the table can hide or reorder the other columns. The choice is stored in this browser under `ts3panel-columns` and is not written to the database. The select column and the row actions stay put. At least one other column stays visible. Reset columns restores the default. A bot row shows the connected server name while that bot is online, and `ts_bots.connect_address` while it is offline. The bot switcher (`BotSwitch` in `client/src/app.jsx`) is a menu the panel renders itself. It groups bots by instance, shows the name with the saved address below it, marks the open bot, offers a search above six bots, and works with the arrow keys, Enter, and Escape. Start, stop, and disconnect do not ask the browser to confirm.

### Client files

| File | Role |
|---|---|
| `client/src/api.js` | `fetch` wrapper. Sends the CSRF header and the session cookie |
| `client/src/auth.jsx` | Session user, `t()`, and the saved language |
| `client/src/language.jsx` | Language select. Options come from the session |
| `client/src/pages.jsx` | Every page. `useLoad(path)` is the GET helper |
| `client/src/columns.js` | Saved column order and visibility. Browser storage only |
| `client/src/columns.jsx` | Columns menu and the shared table renderer |
| `client/src/hostingForm.js` | Diff for Connection. The server applies that patch |
| `client/src/player.jsx` | Bottom bar. It reads the shell player context |

Styling lives in `client/src/styles.css`. Colours, radii, and shadows are tokens on `:root`. Reuse the layout classes before adding new ones: `.card` with `.card-head` and `.card-foot`, `.facts` for label and value rows, `.field-grid` for form fields, `.toolbar` above a table, `Pager` under a table, `.pair` and `.page-grid` for two columns, `.hint` for help text, and `.empty` for an empty list. Paragraphs have no margin. Cards space their children with `gap`.

A submit handler must read `event.currentTarget` and `FormData` before the first `await`. After that, React may clear the event. Do not build a choice with `<datalist>`, the `list` attribute, or the browser's suggestion popup. Use a `<select>` or another control the panel renders itself.

### JSON API

`src/api.js` mounts these groups. Writes need the session and `X-CSRF-Token`. The router answers only JSON. A signed-out request gets 401, never a redirect, and `client/src/api.js` then returns the UI to sign-in. Sign out clears the local session even when the request fails.

- `/session`, `/login`, `/logout`, `/account`, `/account/password`
- `/overview`, `/instances`, `/instances/:id`
- `/instances/:id/bots`, `/bots/attach`, `/bots/delete`
- `/bots`, `/bots/:id`, `/bots/:id/status`, `/bots/:id/label`, `/bots/:id/assignee`, `/bots/bulk`
- `/bots/:id/action` runs one entry from `actions.js`
- `/bots/:id/search`, `/streams`, `/connection`, `/whisper`. Connection polls `/whisper` every 10 seconds while the bot is on a server, because clients get a new id when they reconnect
- `/admin/instances`, `/admin/users`, `/admin/audit`, `/admin/audit/trim`

`/bots?status=0` is the shell roster. It skips the live playback lookup and does not decrypt API tokens. The bot list page uses `/bots` with playback. The shell loads that roster once while a bot page stays open.

### Who can do what

`accessToBot` in `src/db.js` is the check. An administrator can open, edit, and delete every bot. Anyone else can open a bot only when `ts_bots.assignee_user_id` is their id. Owning the instance does not reveal the other bots. The assignee can delete that bot. `canManage` is true for that assignee only when they also own the instance. The Add bot button is shown for an administrator, an instance owner, or an account with `users.can_create_bots`. That flag lets the account create a new bot on any enabled instance. Attaching a template that already exists is only for an administrator or the instance owner. A name that is already registered is not returned to an account that cannot open that bot. A user account must have at least one `instance_grants` row. An administrator may have none. An existing user with no grant can still sign in until an administrator saves them.

Passwords are not stored in the panel database. A new account may have no password and cannot sign in until one is set. Login is limited to 8 attempts per 15 minutes per `login:${ip}:${username}`. Changing the own password allows the same 8 attempts per 15 minutes per `password:${userId}`. Do not change those limits unless the user asks.

### Connection save

`hostingChanges` sends only fields that differ. Empty nickname or default channel becomes null and clears the bot setting. Empty password, bitrate, or volume does not. Stream on connect is a `<select>`: Not set clears it, a saved station sends `streamId` so the server copies the real URL, and Other address sends `startup`. Do not send the station URL from the browser when a station id is available. The visible station address has no credentials.

## Database

Schema changes are new files `sql/migrations/002_name.sql`. Do not edit a file that is already recorded in `schema_migrations`. `001_schema.sql` creates the current tables. Startup replaces rows `001_baseline` through `012_bot_address` with `001_schema` when those rows are present and their checksums still match. A database from release 1.0 has rows through `010_drop_bot_admins`. Startup adds the connection columns from the old `011` and `012` files, then replaces that history. The same happens when `011_bot_settings` is recorded and `012_bot_address` is missing. A history that stops before `010_drop_bot_admins` stays unchanged and startup refuses it. Startup also refuses a different checksum and a version this image does not know.

`users.bot_limit` caps how many bots count for an account. NULL means unlimited. `users.password_hash` may be null. `users.can_create_bots` lets that account create bots. `ts_bots.assignee_user_id` is the account a bot is assigned to. `ts_bots.label` is the panel display name. `ts_bots.template` stores the TS3AudioBot template as a UUID. `ts_bots.name` is the panel name and can repeat. A normal account sees only bots assigned to that account. An instance owner does not see the other bots on that instance. The connection columns on `ts_bots` store the nickname, channel, bitrate, volume, start on launch, and the stream address without credentials. Password columns record only that a password was sent. `connect_address` stores the TeamSpeak address the panel last saved. The panel does not mount the bot volume and does not write `rights.toml`.

Statements must be safe to run again. MariaDB commits DDL one statement at a time. The version row is inserted only after the last statement. Startup logs when the process starts, when it is ready, and when it stops. A failed startup still listens and logs that it is not ready. It also logs each migration it applies, and logs when the schema is already current. `001_schema.sql` is the schema. Do not add a second schema file.

One Docker container is one row in `instances` (address, encrypted token, owner, enabled). TeamSpeak bots inside that process are rows in `ts_bots`, unique by instance and template name. `instance_grants` lets other accounts control those bots. Administrators can create and delete bots. The owner can create bots on that instance. A granted user can create bots only when `users.can_create_bots` is on. Otherwise an administrator assigns the bot (`ts_bots.assignee_user_id`). The assignee can open and delete that bot. A user account must be assigned to at least one instance. An administrator does not have to be. `users.bot_limit` counts bots assigned to the account, and unassigned bots count for the instance owner. NULL means unlimited. An instance with no owner has no limit. The panel does not start containers. `users.suspended` blocks sign-in and the suspend action deletes that account's sessions. An account with no password hash cannot sign in.

Radio stations live in `radio_streams`, not in the bot files. `shared = 1` is the catalog everyone can see. A private station is visible to its owner. Administrators see all of them. Deleting an account keeps a shared station (`owner_user_id` becomes NULL). The URL shown in the list has no credentials. The stored URL the bot plays still does.

## Hosting fields

On Connection, anyone who can open the bot can save it. The bot list can start and stop those same bots. A save sends only fields that differ from the stored values. Clearing the nickname or the default channel resets that value on the bot and in the panel. An empty password, bitrate, or volume does not clear it. An empty stream address removes the stream on connect. `template-hosting` writes nickname, channel, server password, channel password, bitrate, default volume (`audio.volume.default`), start-on-launch, and an optional HTTP or HTTPS stream into the bot template. The stream is stored as a quoted `!play` command on `events.onconnect`. The panel builds that command. Stream on connect is a list of saved stations or another address. Not set removes the stream. Choosing a saved station sends the station id, and the panel copies that station's address. The same save writes the non-secret fields back to `ts_bots` so the form can show them. A connected bot also receives `bot name` so the nickname changes without a reconnect, and `bot move` so it enters the saved channel. `move` changes only the current channel and does not write `connect.channel`. `bot move` takes only a numeric channel id, while `connect.channel` takes `/id` or a path. The panel turns `/id` into the id and looks a path up in `server tree` before it calls `bot move`. Passwords are not stored in the panel database and are not written into the audit text. A user can disconnect only the live id of that bot. Channel commander is saved in `events.onconnect` as `!bot commander on`, together with a startup stream when one is set, and is also applied to the connected bot. Whisper is `audio.send_mode`. Whisper plays only for subscribed clients. Voice plays in the current channel. The panel saves that choice and, when the bot is connected, runs `whisper subscription` or `whisper off`. Turning whisper on also subscribes the bot's current channel. While the bot is connected, Connection reads `server tree` and lists channels and clients. The default channel and Move now offer that list, and still accept `/id` or a path such as `Home/Lobby`. An empty list keeps the text field. Whisper can subscribe or remove clients and channels from the list or by id. The client list leaves out the bot's own client. Subscribing a client first checks `server tree` and refuses an id that is no longer on the server. It then runs `subscribe client` or `subscribe channel`, then `whisper subscription`, then saves `audio.send_mode` as whisper. It reads `whisper list` back and repeats the subscription once when a target is missing. The bot drops a client subscription when that client leaves. Removing a target runs `unsubscribe client` or `unsubscribe channel`. Connection reads `bot info client` and shows the TeamSpeak ID. Creating a bot calls `settings/create` on the instance and inserts a `ts_bots` row only after the API accepts it. Attaching an existing template name, such as `default`, inserts the row without calling the API.

## Security

- CSRF header `X-CSRF-Token` on writes. The session cookie is `ts3panel`. Do not add a session cookie without the same protection. `ts3panel-lang` is only the language choice (`auto` or a language id), SameSite=Lax, and not a login.
- Content-Security-Policy: scripts only from the panel origin. No inline script, no third-party CDN.
- API tokens are stored only encrypted with `TOKEN_KEY`. Do not log them, put them in notices, or write them to the audit log. A token that cannot be decrypted marks that row `tokenUnreadable`. Lists still load, and only calls to that bot API fail with the TOKEN_KEY message.
- Bot API URLs are host and port only. No credentials, no query, no metadata address.
- Resources and stream addresses sent to the bot stay HTTP or HTTPS. For a saved station the client sends the id, not the URL.

## Checks

From `panel/`: `node --test`. From the repo: `make panel-test`. `npm run build` writes `dist/`.

The tests do not need MariaDB. They check the command allow-list, the schema, that every `t("...")` string in `src/` and `client/` is in each translation catalog, and that no catalog keeps an entry the source no longer uses. The tests do not compile JSX, so run `npm run build` after a client change.

The panel targets Node 26. The tests also pass on Node 22. Say which version ran, and do not treat a missing `node` on `PATH` as a pass.
