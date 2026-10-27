# AGENTS.md

Read this file before changing anything in this repository. If the change is under `panel/`, read `panel/AGENTS.md` next. For panel code, the panel file wins when the two disagree.

`README.md` is the human guide. This file is the rules for edits. Do not copy the README into comments or into new Markdown files.

## Language

Write everything in English. That includes docs, commit messages, code, comments, UI source strings, SQL comments, and Compose comments. The only German text is a translation catalog, currently `panel/src/locales/de.js`. Add another catalog only when the user asks for another language. Do not put German into views, routes, or error messages. Those stay English keys, and the catalog maps them.

## What this repo is

Docker image for [TS3AudioBot](https://github.com/Splamy/TS3AudioBot) and an optional web panel. Remote is `https://github.com/CookieCr2nk/TS3AudioBot-Docker`.

`main` is the default branch. `develop` is the other long-lived branch. A push to `main` publishes the GHCR tag `:main`. A push to `develop` publishes `:develop`. Compose reads `IMAGE_TAG` and defaults to `main`. Do not hardcode `:main` or `:develop` in the Compose files. `BOT_REF` is a git ref of Splamy/TS3AudioBot. The default is `develop`.

Three Compose files. Each one is a complete stack and starts on its own:

| File | Contents |
|---|---|
| `docker-compose.yml` | bot only |
| `docker-compose.panel.yml` | bot, panel, MariaDB 11.4 |
| `docker-compose.panel-external-db.yml` | bot, panel, external MariaDB |

Images: `ghcr.io/cookiecr2nk/ts3audiobot-docker:${IMAGE_TAG:-main}` and `ghcr.io/cookiecr2nk/ts3audiobot-docker-panel:${IMAGE_TAG:-main}`. After a publish, the workflow deletes older GHCR versions. It keeps `main`, `develop`, `master`, release tags, the three newest `sha-` tags, and the untagged platform manifests those kept images reference.

## Bot image

The bot is built in the image from the latest `develop` commit of Splamy/TS3AudioBot. Upstream does not publish that build. The README command is `dotnet build --framework net10.0 --configuration Release TS3AudioBot`, and the process is `dotnet TS3AudioBot.dll`. Do not break these limits:

- `/tmp` is a tmpfs of 256 MiB with `exec`. The root filesystem is read-only, so temporary files go there.
- The runtime stage is `mcr.microsoft.com/dotnet/runtime:10.0` (Ubuntu 24.04). The builder is `mcr.microsoft.com/dotnet/sdk:10.0`. Do not set invariant globalization. Do not go back to the 0.12 single-file tarball. That binary is .NET Core 3.1 and exits when it cannot load the host ICU.
- The image needs a `libopus.so` link to `libopus.so.0`.
- The process runs as `ts3audiobot` (UID 9999), with a read-only root filesystem and no Linux capabilities.
- `yt-dlp` is a self-contained binary per architecture. `linux/arm/v7` uses `yt-dlp_linux_armv7l.zip` and keeps its `_internal` directory next to the binary. Download it in the builder and do not execute it there. The builder is the host architecture, so an arm64 binary fails with `ld-linux-aarch64.so.1` missing. The bot image is published for `linux/amd64`, `linux/arm64`, and `linux/arm/v7`. The panel image stays `linux/amd64` and `linux/arm64`.

## Config and runtime data

`config/` is the seed. The image copies it to `/data`. Compose mounts the named volume `ts3audiobot-data` there. Docker fills that volume from the image only while the volume is empty. After that, only the volume counts. `make init-data` still copies `config/` to the gitignored host directory `data/` and does not change the volume.

The TeamSpeak address, name, and identity live in `/data/bots/<name>/bot.toml` on that volume. The identity stays a file. The panel does not write it.

## Network and rights

Port 58913 is not published on the host. In the panel setup only the bot and the panel share the `botapi` network. MariaDB is on `paneldb` and cannot see the bot API.

`config/rights.toml` sets `isapi = true` on the admin rule, so every API caller is an admin. That stays safe only while 58913 is not published. Do not remove that line and do not map the port unless the user asks for it and the rights are tightened first.

An API token in the panel is required only when the bot sits outside this network. On the Compose network leave the UID and token empty.

## Panel hosting

One Docker container is one panel instance. One instance can hold several TeamSpeak bots. The panel does not create containers. An administrator registers the API address and can set an owner. The owner can create and delete bots on that instance. Other accounts get control through grants. They can create bots only when `users.can_create_bots` is on. Otherwise an administrator assigns bots to them from Bots. `users.bot_limit` caps how many bots count for that account: the assignee, or the instance owner when nobody is assigned. NULL means unlimited. An instance with no owner has no limit. A suspended account cannot sign in. There is no billing and no ticket system. Passwords are not stored in the panel database. A new account may be created with no password and cannot sign in until one is set.

## Checks

- `make test` checks the config and the Compose and workflow YAML, and runs the panel tests when `node` is on `PATH`.
- `make panel-test` is the panel tests only.
- This Windows checkout often has no `node` and no `docker`. A missing binary is not a passing test. Panel tests are described in `panel/AGENTS.md`.

## Commits

Do not commit and do not push unless the user asks.

Commit subjects match the existing ones: `feat:`, `fix:`, or `chore:`, English, lowercase after the colon. Update `CHANGELOG.md` under `[Unreleased]` when user-visible behavior changes.
