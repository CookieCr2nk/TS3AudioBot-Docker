# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
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

### Changed
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