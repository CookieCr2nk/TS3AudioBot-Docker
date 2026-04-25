# Development Guide

This guide covers setting up a local development environment for contributing to TS3AudioBot-Docker.

## Prerequisites

- Docker (with buildx for multi-architecture builds)
- Docker Compose
- Make (optional but recommended)
- `hadolint` for Dockerfile linting (optional)
- `pre-commit` for git hooks (optional)

## Quick Setup

### 1. Clone the Repository
```bash
git clone https://github.com/CookieCr2nk/TS3AudioBot-Docker.git
cd TS3AudioBot-Docker
```

### 2. Initialize Configuration
```bash
make config-init
```

This creates config files from templates. Edit them as needed:
```bash
nano config/ts3audiobot.toml
nano config/rights.toml
```

### 3. Install Pre-commit Hooks (Optional but Recommended)
```bash
make pre-commit-install
```

This ensures code quality checks run before commits:
- Hadolint validates Dockerfile
- YAML validation
- Secret detection
- Trailing whitespace cleanup

## Development Workflow

### Building Locally

**Single architecture:**
```bash
make build
```

**Multi-architecture (requires `docker buildx`):**
```bash
make build-multiarch
```

### Running Tests & Validation

```bash
# Run all tests
make test

# Just Hadolint
make lint

# Validate configuration
make validate-config
```

### Local Testing with Docker Compose

```bash
# Start services in background
make compose-up

# View logs
make compose-logs

# Restart after changes
make compose-restart

# Stop services
make compose-down
```

### Custom Configuration for Local Testing

Create `docker-compose.override.yml`:
```bash
cp docker-compose.override.example.yml docker-compose.override.yml
nano docker-compose.override.yml
```

Example overrides:
```yaml
services:
  ts3audiobot:
    # Mount local config for quick testing
    volumes:
      - ./config:/data

    # Enable debug logging
    environment:
      - TS3_LOG_LEVEL=debug
```

## Making Changes

### Dockerfile Changes
1. Update `Dockerfile`
2. Run linting: `make lint`
3. Build and test: `make build && make compose-up`
4. Check security: The CI will run Trivy vulnerability scanning

### Configuration Changes
1. Update `config/ts3audiobot.toml.example` or `config/rights.toml.example`
2. Document changes in `CONFIG.md`
3. Update `CHANGELOG.md` under `[Unreleased]`
4. Run validation: `make validate-config`

### Documentation Changes
1. Update relevant `.md` files
2. Ensure consistency with actual configuration
3. Add examples where helpful

## Adding New Features

### Feature Checklist
- [ ] Update Dockerfile if adding new tools/dependencies
- [ ] Add configuration options to `.toml.example` files
- [ ] Update CONFIG.md with new options
- [ ] Update CHANGELOG.md
- [ ] Update docker-compose.yml if needed
- [ ] Add validation rules if applicable
- [ ] Update README.md if visible to users
- [ ] Add comments for non-obvious changes

## CI/CD Pipeline

The GitHub Actions workflow automatically:
1. Lints the Dockerfile (`hadolint`)
2. Builds multi-architecture images
3. Scans for vulnerabilities (`trivy`)
4. Generates SBOM (Software Bill of Materials)
5. Signs the image (`cosign`)
6. Uploads artifacts

### Monitoring CI
```bash
# View workflow runs
gh run list

# View specific run details
gh run view <run-id>
```

## Testing Locally Before Push

```bash
# Comprehensive test before pushing
make clean && make test && make build && make validate-config

# Start services and do manual testing
make compose-up

# View logs while testing
make compose-logs

# Cleanup
make compose-down
```

## Image Verification

After publishing, verify the image:

```bash
# Pull the image
docker pull ghcr.io/cookiecr2nk/ts3audiobot-docker:master

# Run locally
docker run -it --rm \
  -v ts3audiobot-data:/data \
  ghcr.io/cookiecr2nk/ts3audiobot-docker:master

# Check image metadata
docker inspect ghcr.io/cookiecr2nk/ts3audiobot-docker:master
```

## Common Development Tasks

### View Image Layers
```bash
docker history ghcr.io/cookiecr2nk/ts3audiobot-docker:master
```

### Check Image Size
```bash
docker images ghcr.io/cookiecr2nk/ts3audiobot-docker:master
```

### Inspect Running Container
```bash
docker exec -it ts3audiobot /bin/bash
docker exec ts3audiobot curl -s http://127.0.0.1:58913/ | head
```

### Debug Build Failures
```bash
# Build with increased verbosity
docker build --progress=plain -t test:debug .

# Run failed layer interactively
docker run -it --entrypoint /bin/bash <layer-id>
```

## Security Considerations

- **Never commit secrets** - The pre-commit hook (detect-secrets) will catch common patterns
- **SBOM and signing** - Published images are signed and include SBOMs for verification
- **Vulnerability scanning** - All images are scanned with Trivy before publishing
- **Configuration files** - Keep `config/ts3audiobot.toml` and `config/rights.toml` in `.gitignore`

## Performance Tips

### Layer Caching
- The Dockerfile is designed to maximize Docker build cache hits
- yt-dlp download is separate from bot download for independence
- Runtime dependencies are installed together to reduce layers

### Build Speed
- Use `docker buildx` for multi-platform builds
- GitHub Actions cache speeds up builds (see workflow)
- Local builds benefit from Docker BuildKit

## Troubleshooting Development Issues

### Pre-commit hook fails on commit
```bash
# Temporarily bypass to commit (not recommended)
git commit --no-verify

# Better: fix the issues and re-stage
git add <fixed-files>
git commit
```

### Docker build fails on missing certificates
```bash
# The Dockerfile installs ca-certificates, but you can also:
docker build --build-arg http_proxy=$HTTP_PROXY \
  -t test:local .
```

### Configuration validation fails
```bash
# Check what's wrong
./scripts/validate-config.sh

# Review the config files
nano config/ts3audiobot.toml

# Re-initialize if corrupted
rm config/ts3audiobot.toml
make config-init
```

## Contributing

See the main README.md for contribution guidelines.

## Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [TS3AudioBot Documentation](https://github.com/TS3Audiobot/TS3Audiobot/wiki)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Questions or Issues?

For development-related questions:
1. Check this guide
2. Review related `.md` files
3. Check existing GitHub issues
4. Open a new issue with details about your setup
