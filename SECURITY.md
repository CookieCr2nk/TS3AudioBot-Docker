# Security Policy

## Reporting a vulnerability

Please do not open a public GitHub issue for security problems. Email **noa@joder.li** with a description, steps to reproduce, and expected impact. I aim to respond within a few days.

## What this image does

- Runs as user `ts3audiobot` (UID 9999) with `/usr/sbin/nologin`
- Bot binaries and `yt-dlp` are owned by root; the app user cannot modify them
- SUID/SGID bits are stripped from the base image at build time
- `docker-compose.yml` enables read-only root, `cap_drop: ALL`, `no-new-privileges`, and a PID limit
- Health check hits `http://127.0.0.1:58913/` from inside the container

## What you should do

- Pull image updates regularly
- Treat `bot.toml` identity keys and passwords as secrets
- Restrict who can reach port 58913 if the web API is enabled
- Back up the `data/` directory before upgrades

## Dependencies

Security issues in upstream components should also be reported to their maintainers:

- [TS3AudioBot](https://github.com/Splamy/TS3AudioBot)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [.NET](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)