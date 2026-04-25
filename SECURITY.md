# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in TS3AudioBot-Docker, please **do not** open a public GitHub issue. Instead, please report it responsibly by emailing **noa@joder.li** with:

- Description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact
- Suggested fix (if you have one)

We take all security concerns seriously and will respond within 48 hours. We will work with you to understand the issue and develop a fix.

## Security Features

This image implements industry-leading security hardening:

### Container Security
- **Rootless Execution**: Container runs as unprivileged `ts3audiobot` user (UID 9999)
- **No Shell Access**: User shell is set to `/usr/sbin/nologin` preventing shell escapes
- **Dropped Capabilities**: All Linux capabilities (`--cap-drop=ALL`) to prevent privilege escalation
- **Read-Only Filesystem**: Root filesystem mounted read-only with tmpfs for temporary data
- **No New Privileges**: `security-opt no-new-privileges:true` prevents privilege escalation in child processes
- **Resource Limits**: PID limit of 100 to prevent fork bombs

### Binary Security
- **W^X Principle**: Bot executable and dependencies owned by root, readable/executable by bot user only
- **SUID/SGID Stripped**: All privilege escalation vectors removed at build time
- **Immutable Binaries**: Prevents runtime self-tampering or code injection

### Dependency Security
- **Minimal Base Image**: Debian 12 bookworm-slim reduces attack surface
- **Vulnerability Scanning**: Trivy automatically scans images for known CVEs
- **SBOM Generated**: Software Bill of Materials provided for transparency
- **Pinned Versions**: Critical dependencies pinned for reproducibility
- **Image Signing**: Published images are signed with cosign for verification

### Network Security
- **Restricted Ports**: Only port 58913 exposed for bot communication
- **Health Checks**: Built-in health check monitors process availability

### Compliance
- **SOC 2 Ready**: Hardened according to SOC 2 security requirements
- **PCI-DSS Compliant**: Logging configuration supports centralized audit trails
- **SLSA L3 Provenance**: Build provenance tracked for supply chain integrity

## Security Best Practices for Users

1. **Keep the image updated**: Regularly pull the latest image to receive security patches
2. **Configure centralized logging**: Set up syslog or SIEM integration for audit trails
3. **Use read-only filesystems**: Always run with `--read-only` and proper tmpfs configuration
4. **Restrict network access**: Use Docker networks to isolate the container
5. **Monitor health checks**: Configure alerting on health check failures
6. **Regular vulnerability scanning**: Use `trivy` or similar tools to scan your running images
7. **Rotate credentials**: Change bot authentication tokens regularly
8. **Backup configuration**: Keep encrypted backups of bot configuration files

## Known Security Limitations

- The bot requires outbound HTTPS access for music streaming and updates
- Configuration files should be treated as secrets and protected appropriately
- The health check uses HTTP (127.0.0.1 only) as it's localhost-only

## Version Support

We maintain security patches for:
- **Latest release**: Full support
- **Previous release**: Security patches only (3 months)
- **Older releases**: No support

## Dependency Disclosure

This project depends on:
- TS3AudioBot (upstream): See https://github.com/TS3Audiobot/TS3Audiobot/security
- yt-dlp: See https://github.com/yt-dlp/yt-dlp/security
- .NET 9.0: See https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core

For CVEs affecting these dependencies, we will release patched images within 24 hours.

## Security Audit Trail

All image builds are automatically validated with:
- Hadolint (Dockerfile best practices)
- Trivy (vulnerability scanning)
- SLSA provenance generation
- cosign image signing

Audit logs are available in GitHub Actions workflow runs.

## Questions?

For security questions or clarifications, contact: noa@joder.li
