# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Web panel (`panel/`) for the TS3AudioBot Web API, with MariaDB accounts and bot assignments (`docker-compose.panel.yml`)
- Compose file for an external MariaDB (`docker-compose.panel-external-db.yml`)
- Pushes to `develop` publish both images to GHCR with the tag `:develop`

### Changed
- The web panel is English. `panel/src/locales/de.js` is used when the browser prefers German
- The panel calls the bot API without `!api token`. Port 58913 is not published, and `rights.toml` allows every API caller (`isapi = true`)
- Trimmed documentation and removed unused tooling added during an automated refactor
- Simplified `docker-compose.yml` volume setup (bind mount to `./data`)
- Rewrote README and SECURITY.md without compliance marketing language

### Fixed
- Bot `/tmp` tmpfs is 256 MiB and executable. The .NET single-file host extracts about 68 MiB there and maps `libhostfxr.so` from it. 64 MiB failed the write, and Docker's default `noexec` then failed the map
- Install Ubuntu 22.04 `libicu70` next to Debian 12's `libicu72`. .NET Core 3.1 only probes ICU through version 70, so the bot exited before the API listened
- Install Debian 11 `libssl1.1` next to Bookworm's OpenSSL 3. .NET Core 3.1 only loads `libssl.so.1.1`
- `validate-config.sh` now checks the actual `bots/default/bot.toml` fields

## Previous work (2026-04)

- Pinned TS3AudioBot to GitHub release `0.12.0` via `BOT_RELEASE` build arg
- Switched entrypoint to the self-contained `TS3AudioBot` binary
- Installed per-arch self-contained `yt-dlp` binaries (dropped `linux/arm/v7`)
- CI: Trivy SARIF upload, cosign signing, SBOM artifacts