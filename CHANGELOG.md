# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Agent guides in `AGENTS.md` and `panel/AGENTS.md`, in English, loaded at session start through those filenames plus `CLAUDE.md`, `.grok/rules/start.md`, and `.cursor/rules/project.mdc`
- README is English. The panel UI stays English and still follows the browser when it prefers German
- Numbered panel database migrations in `panel/sql/migrations`, recorded with a checksum in `schema_migrations`. Startup refuses a migration that changed after it was applied
- Radio stations stored in MariaDB. Users keep private stations, and an administrator can publish a station to everyone
- Hosting fields on a bot template: nickname, default channel, server password, channel password, bitrate, start on launch, and a one-time TeamSpeak privilege key
- Web panel (`panel/`) for the TS3AudioBot Web API, with MariaDB accounts and bot assignments (`docker-compose.panel.yml`)
- Compose file for an external MariaDB (`docker-compose.panel-external-db.yml`)
- Pushes to `develop` publish both images to GHCR with the tag `:develop`

### Changed
- Each Compose file is a complete stack: `docker-compose.yml` is the bot only, `docker-compose.panel.yml` is the bot, the panel, and MariaDB, and `docker-compose.panel-external-db.yml` is the bot and the panel against an external MariaDB
- The web panel is English. `panel/src/locales/de.js` is used when the browser prefers German
- The panel calls the bot API without `!api token`. Port 58913 is not published, and `rights.toml` allows every API caller (`isapi = true`)
- Trimmed documentation and removed unused tooling added during an automated refactor
- Simplified `docker-compose.yml` volume setup (bind mount to `./data`)
- Rewrote README and SECURITY.md without compliance marketing language

### Fixed
- Bot `/tmp` tmpfs is 256 MiB and executable. The .NET single-file host extracts about 68 MiB there and maps `libhostfxr.so` from it. 64 MiB failed the write, and Docker's default `noexec` then failed the map
- Install Ubuntu 22.04 `libicu70` next to Debian 12's `libicu72`. .NET Core 3.1 only probes ICU through version 70, so the bot exited before the API listened
- Install Debian 11 `libssl1.1` next to Bookworm's OpenSSL 3. .NET Core 3.1 only loads `libssl.so.1.1`
- Link `libopus.so` to `libopus.so.0`. The bot imports `libopus`, and the `libopus0` package only ships the versioned soname
- `validate-config.sh` now checks the actual `bots/default/bot.toml` fields

## Previous work (2026-04)

- Pinned TS3AudioBot to GitHub release `0.12.0` via `BOT_RELEASE` build arg
- Switched entrypoint to the self-contained `TS3AudioBot` binary
- Installed per-arch self-contained `yt-dlp` binaries (dropped `linux/arm/v7`)
- CI: Trivy SARIF upload, cosign signing, SBOM artifacts