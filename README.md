# TS3AudioBot-Docker

Docker image for [TS3AudioBot](https://github.com/Splamy/TS3AudioBot) and an optional web panel.

Agent rules are in [`AGENTS.md`](AGENTS.md). Panel work also follows [`panel/AGENTS.md`](panel/AGENTS.md). Grok loads both by filename, Claude loads `CLAUDE.md`, and Cursor loads `.cursor/rules/project.mdc`.

There are three Compose files. Each one starts on its own.

| | Bot only | Bot, panel, MariaDB | Bot, panel, external MariaDB |
|---|---|---|---|
| File | `docker-compose.yml` | `docker-compose.panel.yml` | `docker-compose.panel-external-db.yml` |
| Start | `docker compose up -d` | `make compose-panel-up` | `make compose-panel-external-up` |
| UI | none | http://localhost:8080 | http://localhost:8080 |
| Bot API port 58913 | not reachable from outside | panel only, on the internal network | panel only, on the internal network |

The panel and the bot are separate containers. In `docker-compose.panel.yml` MariaDB is a third container and cannot see the bot API.

## Start the bot and the panel

```bash
git clone https://github.com/CookieCr2nk/TS3AudioBot-Docker.git
cd TS3AudioBot-Docker
cp panel/.env.example .env
```

Set at least these two values in the `.env` at the repo root:

- `PANEL_DB_PASSWORD` — password of the panel database
- `PANEL_ADMIN_PASSWORD` — at least 10 characters, or the first start writes a random password once into the panel logs

Then:

```bash
make compose-panel-up
```

Open http://localhost:8080 and sign in. Add a bot. On the Compose network the API address is `http://ts3audiobot:58913`. Leave the UID and token empty.

The UI is English. When the browser prefers German, the panel uses `panel/src/locales/de.js`.

Bot files live in the named volume `ts3audiobot-data`, mounted at `/data`. The first start copies `config/` from the image into an empty volume. Put the TeamSpeak server in `bots/default/bot.toml` on that volume (`address`, then restart the bot). The bot creates its identity on the first connection attempt.

Logs: `make compose-panel-logs` and `docker compose -f docker-compose.panel.yml logs -f ts3audiobot`

Stop: `make compose-panel-down`

## External MariaDB

`docker-compose.panel-external-db.yml` starts the bot and the panel and does not start a MariaDB container. Host, port, user, password, and database name come only from `.env`.

```bash
# in the .env at the repo root
PANEL_DB_HOST=db.example.com
PANEL_DB_PORT=3306
PANEL_DB_NAME=ts3panel
PANEL_DB_USER=ts3panel
PANEL_DB_PASSWORD=change-me
```

When MariaDB runs on the same machine as Docker, set `PANEL_DB_HOST=host.docker.internal`. `127.0.0.1` would be the panel container itself.

The database and user must already exist and must accept connections from the Docker bridge. The panel creates its tables on startup.

Schema changes are numbered files in `panel/sql/migrations/`. Each new file runs once and is stored in `schema_migrations` with a checksum. A file that has already been applied must not change. The next change is a new file with the next number, for example `003_name.sql`. The SQL statements must be safe to run again if the process stops between two statements.

```bash
make compose-panel-external-up
```

Stop with `make compose-panel-external-down`. The external database is left as it is.

## Radio and connection

Radio stations are stored in the panel database, not in the bot files. Under Radio, every user who can control a bot can save private stations. An administrator can publish a station for everyone and can also see private stations. A shared station remains when the account that created it is deleted. Play and append use the bot that is open. The same address remains when the bot volume is replaced.

Under Instances, an administrator writes the nickname, default channel, server password, channel password, bitrate, and whether the bot connects when the process starts into the bot template. Empty fields stay unchanged. Passwords are sent to the bot and are not stored in the panel database. A TeamSpeak privilege key is sent once to the instance that currently controls playback and is not stored in the panel.

## Why there is no API token

The bot API listens on port 58913 inside the container. Compose does not publish that port. In the panel setup only the bot and the panel are on the `botapi` network. MariaDB is on a second network, `paneldb`, with no route to the internet.

`rights.toml` on the bot volume therefore allows every API call (`isapi = true`). That is safe as long as port 58913 is not mapped to the host. There is no fixed container IP, because it changes with the Docker install.

If `rights.toml` is left from an older start, set `isapi = true` on the admin rule, remove old panel IPs, and restart the bot.

An API token in the panel is required only when the bot is deliberately outside this network.

## Start the bot only

```bash
docker compose up -d
```

There is no web UI. The API stays inside the container. Publishing port 58913 anyway makes everyone who can reach the port a bot admin. Remove `isapi = true` from `rights.toml` on the bot volume before doing that.

## Configuration

The image copies `config/` to `/data`. Compose mounts the named volume `ts3audiobot-data` there. Docker fills the volume from the image only while it is empty. A later image update does not change an existing volume. `make init-data` copies `config/` to a host directory `data/` and does not update this volume.

| File on the volume | Contents |
|---|---|
| `bots/default/bot.toml` | TeamSpeak address, name, identity |
| `ts3audiobot.toml` | Global defaults, web API on port 58913 |
| `rights.toml` | Who may run which commands |

Options: [TS3AudioBot Wiki](https://github.com/Splamy/TS3AudioBot/wiki)

## Build the images

```bash
docker build -t ts3audiobot-docker:local .
docker build -t ts3audiobot-panel:local ./panel
```

`BOT_RELEASE` must be a [release tag](https://github.com/Splamy/TS3AudioBot/releases), not a branch name. The default is `0.12.0`.

Images from GitHub: `ghcr.io/cookiecr2nk/ts3audiobot-docker:master` and `:develop`, and the panel as `ghcr.io/cookiecr2nk/ts3audiobot-docker-panel:master` and `:develop`.

## CI

Two workflows:

- `.github/workflows/ci.yml` checks the config and the panel tests on every push and pull request, builds both images, and starts the stack. The run passes only when the panel is healthy, the bot API answers from the panel, and port 58913 is not bound on the host.
- `.github/workflows/docker-publish.yml` builds the bot image for `linux/amd64`, `linux/arm64`, and `linux/arm/v7`, and the panel image for `linux/amd64` and `linux/arm64`, on `master` and `develop`, and pushes them to GHCR. `develop` gets the tag `:develop`. `master` keeps `:master` and the bot release tag. The images are scanned and signed.

Locally: `make test` and `make panel-test`.

## Security

The bot runs as user `ts3audiobot` (UID 9999), with a read-only root filesystem and no Linux capabilities. Details and reports: [SECURITY.md](SECURITY.md).

## License

MIT, see [LICENSE](LICENSE). TS3AudioBot itself is GPLv3.
