# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed
- The bot switcher at the top right is a structured menu: bots are grouped by instance, each shows its name and saved server, the open bot is marked, and a search appears when there are more than six bots
- Whisper on Connection: the Clients and Channels columns line up. Each is a panel with its count, its subscribed targets, a list of the same height (or an empty-state box), the id field, and the buttons. On a narrow screen the panels stack
- Move now and a saved default channel move the connected bot again. The panel sent "/509" to `bot move`, which only takes the number, and failed with "Could not convert to UInt64". A channel path such as Home/Lobby is looked up on the server
- Whisper: the client list on Connection refreshes every 10 seconds and has a Refresh list button, so clients who joined or reconnected after the page opened show up. The bot's own client is no longer listed
- Whisper: subscribing a client works on the first save. The panel adds the targets before it turns whisper on, reads the targets back, and repeats once if the bot did not take them. An id from an outdated list is refused with the client named
- Attaching an existing bot is limited to an administrator or the instance owner. An account that can create bots cannot claim a template that is already on the instance
- Play and add no longer copy a stream password into the audit log
- A link-local address written as IPv6 is rejected, including an IPv4 address inside IPv6
- A password longer than 72 bytes is rejected. bcrypt would otherwise treat it as its first 72 bytes
- The overview meter can set its width. Style attributes are allowed, and scripts stay limited to the panel
- An instance whose API token cannot be decrypted no longer breaks the overview, the bot list, or its bot pages. Only calls to that bot API report the TOKEN_KEY problem
- An expired session returns the panel to sign-in. Sign out works even when the server session is already gone
- Changing the own password is limited to 8 attempts per 15 minutes
- A signed-out API request gets a JSON 401 instead of a redirect
- A bitrate outside 8 to 98 always names that range
- Create a bot no longer flashes "You cannot create bots" while the instance list loads
- `make build-multiarch` also builds linux/arm/v7, like the published bot image

### Added
- Connection lists the server's channels for the default channel and for Move now. A channel id or a path such as Home/Lobby can still be typed
- Whisper can subscribe and remove clients and channels, from that list or by id
- The overview shows how many instances answer, how many bots are running, and, for an administrator, how many accounts can sign in
- List tables keep their current columns until the browser changes them. Columns can hide or reorder the other fields, and that choice stays in the browser
- A flag button to the right of the panel name, and on the sign-in page, follows the browser or picks English or German. Another translation is a catalog registered in one list
- The protocol page can delete audit entries older than 24 hours and keep the last day
- Anyone who can open a bot can change its connection settings. The panel remembers the nickname, channel, bitrate, volume, start-on-launch choice, and stream address. Passwords stay on the bot.
- Connection can move a connected bot into a channel without saving that channel as the default
- Connection can use a saved radio station as the stream that plays when the bot connects
- Connection can switch a bot between whisper and voice. The choice is saved, applied to a connected bot, and used again when the next song starts

### Changed
- Help text on the panel pages states what a field does and what leaving it empty does
- The panel database schema is one migration file. A database from release 1.0, or one that already applied the older migration files, is upgraded when the panel starts
- Bot lists and the player ask the database for less work. Built files stay cached, and authenticated API responses are not stored by the browser. A password longer than 200 characters cannot be used to sign in
- Stop on the playback page no longer asks for confirmation. A bot name can be 120 characters. A failed owner change stays on the previous user. A search result does not appear on another bot. The panel name in the sidebar opens the overview without reloading the page. Starting or stopping several bots counts against the action limit only when the whole batch fits
- A stream address with parentheses stays one play command. An unreadable connect script is rejected instead of rewritten. Play and add accept only http and https. Unknown server errors stay off the API response. Changing the API UID keeps the saved token. The assignee list names the instance owner. Add bot follows the open bot's instance. Two stations with the same visible address are not collapsed. The audit log uses the current bot name. A failed bot page shows the error. Sign-out failures are shown. The volume and seek sliders still apply when the pointer is released outside them. Saving a user no longer depends on the password length
- The sidebar, the sign-in page, and the browser title use the name TS-Bot Panel
- The bot list shortens only the current title. The server address and the volume heading stay fully visible
- The bot list and the bot switcher show the saved TeamSpeak address, including while the bot is offline
- Start, stop, and disconnect no longer ask the browser to confirm
- Starting or stopping the selected bots clears that selection and closes the start and stop bar. The outcome stays in a notice
- A user account must be assigned to at least one instance. Administrators do not
- Accounts other than administrators see only bots assigned to them
- Connection chooses the stream on connect from a saved station or another address. Not set removes it
- Notices sit at the bottom right, above the playback bar
- The name field for a new bot shows bot as the example
- Saving a default channel moves a connected bot into that channel
- The playback bar stays empty until a bot page is open
- The bot list is paged like the user list, and each bot stays on one line
- Connection, disconnect, and the form for an existing bot use clearer wording
- The panel image uses the Node.js LTS tag `lts-bookworm-slim`, which is Node.js 26.13.0. CI runs that same version

### Fixed
- An open bot page shows offline instead of an error while that template is not running
- A wrong password on a suspended account returns the same error as any other wrong password
- After sign-in, Add bot follows users.can_create_bots without a reload
- The playback queue lists the playlist from the start, up to 20 songs
- German wording for play, an empty instance list, the bot-name rule, and a few form hints
- Switching bots clears the previous bot's connection form and playback search
- Connection shows the TeamSpeak server, the address, and connect or disconnect at the top of the page
- The account a bot is assigned to can delete that bot
- Clearing the nickname or the default channel on Connection saves that reset
- Saving connection settings sends only the fields that changed, so a connected bot is not moved again
- Start and stop on the bot list work for anyone who can control that bot
- The connection page still shows the saved settings when the bot API cannot be reached. The panel also remembers the TeamSpeak address

### Removed
- Playlists. The panel no longer lists or plays them
- History. The panel no longer lists or plays the bot play log. An old history link opens playback

## [1.0] - 2026-11-01

### Added
- User management lists accounts in pages of 10, with 25, 50, or 100 per page. Edit opens one account at a time
- The bot list shows the TeamSpeak server next to the status while that bot is online
- The overview shows a dashboard with instance, online, offline, and bot counts
- An administrator can allow an account to create bots, or assign each bot to a user from Bots. The list shows that user. A new account can be created without a password and cannot sign in until one is set
- Connection can turn the channel commander on or off for a bot
- Connection can store an HTTP or HTTPS stream that the bot plays when it connects. Clear it on the same form
- Each panel account can create unlimited bots or a fixed number. An administrator sets the number. It counts the bots on instances that account owns. An instance with no owner has no limit
- The panel sidebar links to the GitHub repository
- The panel is a host for TS3AudioBot. One Docker container is one instance, and one instance can hold several TeamSpeak bots. Administrators register containers, assign an owner, and grant other users. The owner can create and delete bots. Granted users can control playback. Accounts can be suspended. There is no billing and no ticket system
- Agent guides in `AGENTS.md` and `panel/AGENTS.md`, in English, loaded at session start through those filenames plus `CLAUDE.md`, `.grok/rules/start.md`, and `.cursor/rules/project.mdc`
- README is English. The panel UI stays English and still follows the browser when it prefers German
- Numbered panel database migrations in `panel/sql/migrations`, recorded with a checksum in `schema_migrations`. Startup refuses a migration that changed after it was applied
- Radio stations stored in MariaDB. Users keep private stations, and an administrator can publish a station to everyone
- Hosting fields on a bot template: nickname, default channel, server password, channel password, bitrate, start on launch, and a one-time TeamSpeak privilege key
- Web panel (`panel/`) for the TS3AudioBot Web API, with MariaDB accounts and bot assignments (`docker-compose.panel.yml`)
- Compose file for an external MariaDB (`docker-compose.panel-external-db.yml`)
- Pushes to `main` publish both images as `:main`. Pushes to `develop` publish both images as `:develop`

### Removed
- TeamSpeak UID whitelist. The panel talks to the bot only through the API and does not mount the bot volume
### Fixed
- Radio stations keep long names and addresses on their own line, with the buttons beside them
- A YouTube or other http address in playback is sent as play, so the bot no longer asks for a TeamSpeak user session
- Migration `008_bot_template` can drop the old bot-name index. MariaDB kept it for the instance foreign key
### Changed
- Selecting several bots only offers start and stop
- A new bot is created on TS3AudioBot under a UUID, so panel names can repeat. A normal account sees only bots assigned to that account, or every bot on an instance it owns. Users and instance access are chosen from lists
- A bot has a panel display name separate from the TeamSpeak nickname. An account with Can create bots can pick any enabled instance. Other accounts open the instances checked on Users
- Bots and the overview have a plus button to add a bot or an instance. A bot's connection page edits only that bot. Volume changes are not written to the audit log
- Connection can store a default volume on the bot. The Bots table assigns an owner from one compact list
- Channel commander is saved on the bot and turns on again each time that bot connects. Saving a startup stream keeps that setting
- The instance page no longer lists bots. Create and attach stay there. Delete is on Bots. A bot limit counts assigned bots. A bot with nobody assigned counts for the instance owner
- The panel logs when it starts, when it is ready, and when it stops. A failed startup still listens and says it is not ready. Each applied database migration is logged, and so is a schema that is already current
- The panel keeps playback in a bar at the bottom of the page. Bots is its own section and lists every bot you can open. Select several bots to pause, play, stop, or set the volume on all of them. Bot pages use a tab row, and the main menu stays in the same place
- The panel UI is a React page with a fixed sidebar. Saving a setting sends JSON and stays on the same screen. The menu no longer jumps back to the top
- GHCR drops image versions that are no longer current. `main`, `develop`, `master`, release tags, and the three newest commit tags stay. Untagged platform manifests of those images stay
- Seed `ts3audiobot.toml` uses Opus bitrate 96, a user volume cap of 80, and shows the song title and cover. The bundled WebInterface stays off because this image does not build it. `rights.toml` grants help, now-playing, and playback to everyone in TeamSpeak, and keeps `isapi = true` on the admin rule. `cmd.eval`, `cmd.xecute`, and `cmd.json.*` stay on that admin rule
- The panel database replaces `bots` with `instances` and `ts_bots`. An existing bot row becomes one instance and one TeamSpeak bot. `bots` and `bot_grants` are dropped after the copy
- Compose pulls both GHCR images with `${IMAGE_TAG:-main}`. The default tag is `main`. Set `IMAGE_TAG=develop` to pull the develop images. The Compose files stay the same on `main` and `develop`
- Compose no longer sets a PID limit on the bot or the panel
- Bot data in every Compose file is the named volume `ts3audiobot-data` mounted at `/data`. An empty volume is filled from the image copy of `config/`
- Each Compose file is a complete stack: `docker-compose.yml` is the bot only, `docker-compose.panel.yml` is the bot, the panel, and MariaDB, and `docker-compose.panel-external-db.yml` is the bot and the panel against an external MariaDB
- The web panel is English. `panel/src/locales/de.js` is used when the browser prefers German
- The panel calls the bot API without `!api token`. Port 58913 is not published, and `rights.toml` allows every API caller (`isapi = true`)
- Trimmed documentation and removed unused tooling added during an automated refactor
- Rewrote README and SECURITY.md without compliance marketing language

### Removed
- The privilege key field is gone. Connection shows the bot's TeamSpeak ID while the bot is connected

### Fixed
- Saving a radio station no longer shows an error after the server has stored it. The same applies to the other forms that clear themselves after a request
- Saving a nickname updates the name of a connected bot. The template still keeps that name for the next start. An offline bot uses the new name when it connects
- The GHCR cleanup step passes the workflow token and the repository owner. Without them the job stopped before it deleted old image versions
- The multi-arch build no longer runs `yt-dlp` inside the builder. That stage is the host architecture, so the arm64 binary exited because `ld-linux-aarch64.so.1` was missing
- Build TS3AudioBot from the latest `develop` commit inside the image with the .NET 10 SDK, then run `dotnet TS3AudioBot.dll` on `mcr.microsoft.com/dotnet/runtime:10.0`. Upstream does not publish this build. Release 0.12 is .NET Core 3.1 and exited because it could not load the host ICU. `yt-dlp` stays the per-architecture binary
- Report vulnerabilities as a GitHub issue. The previous contact address is gone
- The panel finds its pages under the application directory. In the image that is `/app/views`. The previous lookup used `/views`, so opening the panel failed before the page rendered
- When the database is down, the login is rejected, the database is missing, or the schema does not match, the panel states that on the page. It keeps listening after a failed startup so the message is visible, and `/healthz` stays unhealthy
- Bot `/tmp` tmpfs stays 256 MiB and executable. The root filesystem is read-only, so temporary files go there
- Link `libopus.so` to `libopus.so.0`. The bot imports `libopus`, and the `libopus0` package only ships the versioned soname
- `validate-config.sh` now checks the actual `bots/default/bot.toml` fields

## Previous work (2026-04)

- Pinned TS3AudioBot to GitHub release `0.12.0` via `BOT_RELEASE` build arg
- Switched entrypoint to the self-contained `TS3AudioBot` binary
- Installed per-arch self-contained `yt-dlp` binaries (dropped `linux/arm/v7`)
- CI: Trivy SARIF upload, cosign signing, SBOM artifacts