# TS3AudioBot-Docker 🔒

![Debian Bookworm](https://img.shields.io/badge/Debian-12%20Bookworm-A81D33?style=for-the-badge&logo=debian)
![.NET 9.0](https://img.shields.io/badge/.NET-9.0-5C2D91?style=for-the-badge&logo=dotnet)
![SOC2 Hardened](https://img.shields.io/badge/Security-SOC2%20Ready-brightgreen?style=for-the-badge&logo=security)

A lightweight, highly secure Docker container for TS3AudioBot based on Debian 12 (Bookworm) and .NET 9.0. This image has been specifically hardened following industry best practices to meet SOC 2 security requirements.

## 🛡️ Security Features
- **Rootless Execution & No-Login Shell**: The bot runs entirely as the unprivileged `ts3audiobot` user without shell access (`/usr/sbin/nologin`).
- **Binary Immutability**: The bot executable and dependencies (`yt-dlp`) are owned by `root` and only readable/executable by the bot, preventing self-tampering (W^X principle).
- **SUID/SGID Stripped**: All privilege escalation vectors via SUID/SGID bits in the base system are removed.
- **Docker Healthcheck**: Includes a built-in healthcheck to monitor the TS3AudioBot process state.
- **Ready for Read-Only FS**: Designed to run securely with the Docker `--read-only` and `--cap-drop=ALL` flags.

---

## 🚀 Quick Start (Docker Compose - Recommended)

For maximum security and easy management, we provide a standard `docker-compose.yml` that automatically enforces the required SOC 2 security policies:

1. Download the `docker-compose.yml` file.
2. Run the initialization if this is your first time (this creates the config files):
   ```bash
   docker-compose run --rm ts3audiobot
   ```
3. Stop the process with `CTRL+C` once the configurations have been generated, and adapt them to your TeamSpeak server.
4. Start the service in the background:
   ```bash
   docker-compose up -d
   ```

---

## 🐳 Manual Docker Run

If you prefer using the CLI or need to do the initial setup manually:

### 1. Create Volume
```bash
docker volume create ts3audiobot-data
```

### 2. Initial Setup
Run the initial setup to generate all configuration files into your volume:
```bash
docker run --rm -it -v ts3audiobot-data:/data ghcr.io/cookiecr2nk/ts3audiobot-docker:master
```
*Stop the server with `CTRL-C` once generation is complete, and edit your config located in `/var/lib/docker/volumes/ts3audiobot-data/_data/bots/default/bot.toml`.*

### 3. Run Secure Daemon
Run the container using secure flags (`--read-only` and `--cap-drop=ALL`):
```bash
docker run --name ts3audiobot -d \
  -p 58913:58913 \
  -v ts3audiobot-data:/data \
  --read-only \
  --cap-drop=ALL \
  --security-opt no-new-privileges:true \
  ghcr.io/cookiecr2nk/ts3audiobot-docker:master
```

---

## 🛠️ Building the Image
```bash
docker build -t ghcr.io/cookiecr2nk/ts3audiobot-docker:master .
```

## 🤝 Contribution
Feel free to open an issue or pull request!

## Version Information
- Base: **Debian 12 (Bookworm Slim)**
- Runtime: **.NET 9.0**
- TS3AudioBot: **master** (latest nightly)
