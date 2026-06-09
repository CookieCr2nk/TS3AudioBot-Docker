# Changelog

All notable changes to TS3AudioBot-Docker will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Docker build no longer downloads from non-existent `master`/`develop` release
  tags; pinned to upstream release `0.12.0` via the `BOT_RELEASE` build arg
- Container entrypoint now runs the self-contained `TS3AudioBot` binary instead
  of the non-existent `TS3AudioBot.dll`
- yt-dlp now installs the self-contained per-arch binary (`yt-dlp_linux` /
  `yt-dlp_linux_aarch64`) so it works without a `python3` interpreter
- Pull request CI no longer fails on the Trivy scan (image is now loaded locally)
- Replaced the no-op `trivy` CLI step with a real failing severity gate
- Stopped tracking/baking runtime artifacts (`ts3audiobot.db`, `ts3audiobot.log`)
- Fixed the inverted CHANGELOG pre-commit hook that blocked all commits

### Changed
- Dropped 32-bit `linux/arm/v7` builds (no self-contained armv7 yt-dlp binary
  exists); images are now `linux/amd64` and `linux/arm64`

### Added
- SBOM (Software Bill of Materials) generation in CI/CD
- Image signing with cosign for supply chain security
- SLSA L3 provenance generation
- Hadolint Dockerfile linting in CI/CD
- Pre-commit hooks for development
- Renovate configuration for automated dependency updates
- Configuration validation script
- Makefile for common development tasks
- docker-compose.override.yml template for local development
- Comprehensive configuration documentation
- Troubleshooting guide in README
- Pre-commit hook configuration file

### Changed
- Pinned dependency versions for reproducibility
- Enhanced health check configuration options
- Improved Trivy scanning (now runs on PRs and pushes)
- Refactored configuration files as templates

### Improved
- Documentation completeness
- Development experience
- CI/CD pipeline robustness
- Dependency management

## [v1.0.0] - 2026-04-25

### Added
- Initial Docker image with SOC2 hardening
- Multi-architecture builds (amd64, arm64, arm/v7)
- Docker Compose configuration with security settings
- Rootless execution with unprivileged user
- Read-only filesystem support
- Dropped Linux capabilities (CAP_DROP=ALL)
- SUID/SGID stripping
- Binary immutability (W^X principle)
- VS Code devcontainer setup
- Health check monitoring
- Trivy vulnerability scanning
- PCI-DSS logging configuration

### Security
- SOC2-ready hardening
- PCI-DSS compliance features
- GitHub Actions workflow with security validations

---

## Version History

### v0.9.x Series
- Pre-release versions with SOC2 optimization
- Multi-stage Docker build implementation
- .NET 9.0 base image with Debian Bookworm
- Docker multi-arch build system

### v0.8.x Series
- Initial Docker containerization
- Basic security hardening

---

## Upgrade Guide

### From v0.x to v1.0.0

1. **Backup Configuration**: Save your current `config/` directory
2. **Pull Latest Image**: `docker pull ghcr.io/cookiecr2nk/ts3audiobot-docker:master`
3. **Recreate Container**: Follow the Quick Start section in README
4. **Validate Configuration**: Check that all settings were preserved

No breaking changes in the v1.0.0 release.

---

## Security Policy

For reporting security vulnerabilities, please see [SECURITY.md](SECURITY.md).

## Contributing

For contribution guidelines, please see the main README.md.
