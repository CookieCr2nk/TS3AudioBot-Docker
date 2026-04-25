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

## 📝 PCI-DSS Logging & Auditing (Requirement 10)
To comply with PCI-DSS centralized logging requirements, all container output is natively streamlined to `STDOUT/STDERR`. You must configure your Docker Daemon or `docker-compose` to ship these logs to a dedicated SIEM or Log Aggregator (e.g., Splunk, ELK, or remote Syslog).

Example config to add to your `docker-compose.yml`:
```yaml
    logging:
      driver: syslog
      options:
        syslog-address: "tcp://192.168.1.100:514"
        tag: "ts3audiobot-audit"
```

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

---

## 📖 Documentation

- **[Configuration Guide](CONFIG.md)** - Complete configuration reference for `ts3audiobot.toml` and `rights.toml`
- **[Security Policy](SECURITY.md)** - Security features, best practices, and vulnerability reporting
- **[Changelog](CHANGELOG.md)** - Version history and notable changes

---

## 🛠️ Building the Image

### Standard Build
```bash
docker build -t ghcr.io/cookiecr2nk/ts3audiobot-docker:master .
```

### Build Specific Branch
```bash
docker build --build-arg BOT_BRANCH=develop -t ts3audiobot-docker:develop .
```

### Multi-Architecture Build (requires buildx)
```bash
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t ghcr.io/cookiecr2nk/ts3audiobot-docker:master .
```

---

## 🚀 Development

### Using Make
```bash
make help          # Show available commands
make build         # Build Docker image locally
make test          # Run tests and validation
make compose-up    # Start with docker-compose
make compose-down  # Stop and remove containers
make logs          # View container logs
```

### Local Testing
```bash
# Create docker-compose.override.yml for local testing
cp docker-compose.override.example.yml docker-compose.override.yml

# Edit as needed (e.g., mount local config)
nano docker-compose.override.yml

# Test changes
docker-compose up
```

### Pre-commit Hooks
Install pre-commit hooks to validate changes before committing:
```bash
pip install pre-commit
pre-commit install
```

This will run YAML validation, secret detection, and trailing whitespace cleanup automatically.

---

## 🔧 Troubleshooting

### Bot won't start
1. **Check logs**: `docker-compose logs ts3audiobot`
2. **Verify TeamSpeak server**: Ensure server is running and accessible
3. **Check identity**: Confirm identity is added to TeamSpeak whitelist
4. **Validate config**: Review `CONFIG.md` for required settings

### No audio output
- Verify audio plugin is enabled in `ts3audiobot.toml`
- Check TeamSpeak user permissions for the bot
- Test with `make logs` to see audio subsystem output

### Permission errors
- Ensure volume is created: `docker volume ls | grep ts3audiobot`
- Verify config file ownership: `docker exec ts3audiobot ls -la /data`
- Recreate volume if corrupted: `docker volume rm ts3audiobot-data`

### Web interface not responding
- Verify port mapping: `docker port ts3audiobot`
- Check firewall: `telnet localhost 58913`
- Verify service is running: `docker-compose ps`

For more help, see [Troubleshooting in CONFIG.md](CONFIG.md#troubleshooting)

---

## 📦 Image Verification

Published images include:
- **SBOM**: Software Bill of Materials for transparency
- **Image Signatures**: Signed with cosign - verify with:
  ```bash
  cosign verify --key cosign.pub ghcr.io/cookiecr2nk/ts3audiobot-docker:master
  ```
- **Provenance**: SLSA L3 provenance attestation
- **Vulnerability Reports**: Trivy vulnerability scan results

---

## 🔐 Security Disclosure

For reporting security vulnerabilities, **please do not open a public issue**. Instead, see [SECURITY.md](SECURITY.md#reporting-a-vulnerability).

---

## 🛠️ Architecture

### Multi-Architecture Support
- `linux/amd64` - Intel/AMD 64-bit
- `linux/arm64` - ARM 64-bit (Raspberry Pi 4+, Apple Silicon)
- `linux/arm/v7` - 32-bit ARM (older Raspberry Pi)

### Layer Structure
```
Base Image (mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim)
  ↓
Runtime Dependencies (ffmpeg, libopus0)
  ↓
TS3AudioBot Binary
  ↓
Configuration & Entry Point
```

---

## 📊 Performance

- **Minimal footprint**: ~400MB image size
- **Fast startup**: <10 seconds typical startup time
- **Low memory**: ~100MB base memory usage
- **Configurable limits**: Set PID limit, memory limit, CPU quota in docker-compose

---

## 🤝 Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Before submitting, ensure:
- `make test` passes
- Pre-commit hooks run without errors
- Configuration validation works

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

TS3AudioBot is licensed under GPLv3 - see https://github.com/TS3Audiobot/TS3Audiobot/blob/master/LICENSE

---

## 🔗 Related Projects

- [TS3AudioBot](https://github.com/TS3Audiobot/TS3Audiobot) - The underlying bot
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Audio downloader
- [.NET 9.0](https://dotnet.microsoft.com/) - Runtime

---

## Version Information
- Base: **Debian 12 (Bookworm Slim)**
- Runtime: **.NET 9.0**
- TS3AudioBot: **master** (latest nightly)
- Last Updated: **2026-04-25**
