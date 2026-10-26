# AGENTS.md

Read this file before changing anything in this repository. If the change is under `panel/`, read `panel/AGENTS.md` next. For panel code, the panel file wins when the two disagree.

`README.md` is the human guide. This file is the rules for edits. Do not copy the README into comments or into new Markdown files.

## Language

Write everything in English. That includes docs, commit messages, code, comments, UI source strings, SQL comments, and Compose comments. The only German text is a translation catalog, currently `panel/src/locales/de.js`. Add another catalog only when the user asks for another language. Do not put German into views, routes, or error messages. Those stay English keys, and the catalog maps them.

## What this repo is

Docker image for [TS3AudioBot](https://github.com/Splamy/TS3AudioBot) `0.12.0` and an optional web panel. Remote is `https://github.com/CookieCr2nk/TS3AudioBot-Docker`.

`master` and `develop` are the long-lived branches. This panel and the GHCR tags `:develop` belong to `develop`. `BOT_RELEASE` is a release tag, not a branch name.

Three Compose files. Each one is a complete stack and starts on its own:

| File | Contents |
|---|---|
| `docker-compose.yml` | bot only |
| `docker-compose.panel.yml` | bot, panel, MariaDB 11.4 |
| `docker-compose.panel-external-db.yml` | bot, panel, external MariaDB |

Images on `develop`: `ghcr.io/cookiecr2nk/ts3audiobot-docker:develop` and `ghcr.io/cookiecr2nk/ts3audiobot-docker-panel:develop`.

## Bot image

The bot is a .NET Core 3.1 single-file binary. Do not break these limits:

- `/tmp` is a tmpfs of 256 MiB with `exec`. 64 MiB or `noexec` exits the process before the API listens.
- The image sets `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1` and `COMPlus_System_Globalization_Invariant=1`. .NET Core 3.1 only loads ICU through version 70, and Debian 12 ships ICU 72. The 3.1 host checks the `COMPlus_` switch before the `DOTNET_` variable.
- The image needs `libssl.so.1.1` and a `libopus.so` link to `libopus.so.0`.
- The process runs as `ts3audiobot` (UID 9999), with a read-only root filesystem and no Linux capabilities.
- `yt-dlp` is a self-contained binary per architecture. There is no `linux/arm/v7`.

## Config and runtime data

`config/` is the seed. The image copies it to `/data`. Compose mounts the named volume `ts3audiobot-data` there. Docker fills that volume from the image only while the volume is empty. After that, only the volume counts. `make init-data` still copies `config/` to the gitignored host directory `data/` and does not change the volume.

The TeamSpeak address, name, and identity live in `/data/bots/<name>/bot.toml` on that volume. The identity stays a file. The panel does not write it.

## Network and rights

Port 58913 is not published on the host. In the panel setup only the bot and the panel share the `botapi` network. MariaDB is on `paneldb` and cannot see the bot API.

`config/rights.toml` sets `isapi = true` on the admin rule, so every API caller is an admin. That stays safe only while 58913 is not published. Do not remove that line and do not map the port unless the user asks for it and the rights are tightened first.

An API token in the panel is required only when the bot sits outside this network. On the Compose network leave the UID and token empty.

## Checks

- `make test` checks the config and the Compose and workflow YAML, and runs the panel tests when `node` is on `PATH`.
- `make panel-test` is the panel tests only.
- This Windows checkout often has no `node` and no `docker`. A missing binary is not a passing test. Panel tests are described in `panel/AGENTS.md`.

## Commits

Do not commit and do not push unless the user asks.

Commit subjects match the existing ones: `feat:`, `fix:`, or `chore:`, English, lowercase after the colon. Update `CHANGELOG.md` under `[Unreleased]` when user-visible behavior changes.
