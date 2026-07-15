# TS3AudioBot-Docker

Docker image for [TS3AudioBot](https://github.com/Splamy/TS3AudioBot) on Debian 12 (Bookworm) with .NET 9.

Published images: `ghcr.io/cookiecr2nk/ts3audiobot-docker:master`

## Quick start

```bash
git clone https://github.com/CookieCr2nk/TS3AudioBot-Docker.git
cd TS3AudioBot-Docker
make init-data
docker compose run --rm ts3audiobot
```

Stop the container with `Ctrl+C` once the config files are written, then edit `data/bots/default/bot.toml` (TeamSpeak address, identity, password). Start the bot in the background:

```bash
docker compose up -d
```

Logs: `docker compose logs -f ts3audiobot`

## Configuration

Config lives in the `./data` volume (mounted at `/data` in the container):

| File | Purpose |
|------|---------|
| `data/bots/default/bot.toml` | Connection settings for the default bot |
| `data/ts3audiobot.toml` | Global bot defaults and tool paths |
| `data/rights.toml` | Command permissions |

On first run the bot generates an identity key. Add it to your TeamSpeak server's identity whitelist before connecting.

Full option reference: [TS3AudioBot Wiki](https://github.com/Splamy/TS3AudioBot/wiki)

## Security

The image and `docker-compose.yml` run the bot as an unprivileged user with a read-only root filesystem, dropped capabilities, and no new privileges. See [SECURITY.md](SECURITY.md) for details and how to report vulnerabilities.

## Manual `docker run`

```bash
docker volume create ts3audiobot-data

# First run — generates config, then stop with Ctrl+C
docker run --rm -it -v ts3audiobot-data:/data ghcr.io/cookiecr2nk/ts3audiobot-docker:master

docker run -d --name ts3audiobot \
  -p 58913:58913 \
  -v ts3audiobot-data:/data \
  --read-only \
  --tmpfs /tmp:mode=1777,size=64m \
  --cap-drop=ALL \
  --security-opt no-new-privileges:true \
  ghcr.io/cookiecr2nk/ts3audiobot-docker:master
```

## Building

Default build (TS3AudioBot `0.12.0`):

```bash
docker build -t ts3audiobot-docker:local .
```

Another upstream release:

```bash
docker build --build-arg BOT_RELEASE=0.11.0 -t ts3audiobot-docker:0.11.0 .
```

`BOT_RELEASE` must be a real [GitHub release tag](https://github.com/Splamy/TS3AudioBot/releases), not a branch name.

Multi-arch (needs buildx):

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t ts3audiobot-docker:local .
```

## Development

```bash
make help            # list targets
make build           # local image
make validate-config # check bot.toml before starting
make compose-up      # start stack
make compose-logs    # follow logs
```

Optional pre-commit hooks:

```bash
pip install pre-commit
pre-commit install
```

## CI

Pushes to `master` build `linux/amd64` and `linux/arm64` images, run Trivy scans, and publish SBOM artifacts. Images are signed with cosign (keyless via GitHub OIDC).

## License

MIT — see [LICENSE](LICENSE). TS3AudioBot itself is GPLv3.