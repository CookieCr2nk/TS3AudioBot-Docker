# --- Builder Stage ---
FROM mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim AS builder

ARG TARGETARCH
ARG BOT_BRANCH="master"

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install build dependencies (ca-certificates for HTTPS, curl for downloads, file for validation)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates=20230311 \
      curl=7.88.1-10+deb12u4 \
      file=1:5.44-3 && \
    rm -rf /var/lib/apt/lists/*

# Download yt-dlp binary (audio downloader) - separated layer for better cache efficiency
# This layer invalidates independently from bot version changes
RUN curl -fL --retry 3 --retry-delay 5 \
      https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp && \
    chmod 755 /usr/local/bin/yt-dlp && \
    yt-dlp --version

# Download and extract TS3AudioBot binary (nightly build from splamy)
# Architecture-specific binary selection for optimal performance
WORKDIR /opt/TS3AudioBot
RUN if [ "$TARGETARCH" = "amd64" ]; then BOT_ARCH="x64"; \
    elif [ "$TARGETARCH" = "arm" ]; then BOT_ARCH="arm"; \
    elif [ "$TARGETARCH" = "arm64" ]; then BOT_ARCH="arm64"; \
    else BOT_ARCH="x64"; fi && \
    curl -fL --retry 5 --retry-delay 10 \
      "https://splamy.de/api/nightly/projects/ts3ab/${BOT_BRANCH}_linux_${BOT_ARCH}/download" \
      -o TS3AudioBot.tar.gz && \
    if [ ! -s TS3AudioBot.tar.gz ] || ! file TS3AudioBot.tar.gz | grep -q "gzip compressed"; then \
      echo "Download failed or invalid archive, retrying..."; \
      rm -f TS3AudioBot.tar.gz; \
      sleep 30; \
      curl -fL --retry 5 --retry-delay 10 \
        "https://splamy.de/api/nightly/projects/ts3ab/${BOT_BRANCH}_linux_${BOT_ARCH}/download" \
        -o TS3AudioBot.tar.gz; \
    fi && \
    tar -xzf TS3AudioBot.tar.gz && \
    rm -f TS3AudioBot.tar.gz && \
    chmod -R 755 .


# --- Final Production Stage ---
FROM mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim

LABEL org.opencontainers.image.title="TS3AudioBot"
LABEL org.opencontainers.image.description="TS3AudioBot Dockerized - Secure, hardened container for TeamSpeak 3"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.authors="CookieCr2nk"
LABEL org.opencontainers.image.url="https://github.com/CookieCr2nk/TS3AudioBot-Docker"
LABEL org.opencontainers.image.source="https://github.com/CookieCr2nk/TS3AudioBot-Docker"
LABEL org.opencontainers.image.base.name="mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim"
LABEL org.opencontainers.image.documentation="https://github.com/CookieCr2nk/TS3AudioBot-Docker/blob/master/README.md"
LABEL security.soc2="ready"
LABEL security.pci-dss="ready"

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install runtime dependencies for audio processing and health checks
# - ffmpeg: Audio codec support and processing
# - libopus0: Opus audio codec (TeamSpeak 3 audio)
# - curl: Health check and diagnostics
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg=7:5.1.2-1~deb12u1 \
      curl=7.88.1-10+deb12u4 \
      libopus0=1.3.1-3 && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    find / -xdev -perm /6000 -type f -print0 | xargs -0 -r chmod a-s

# Create unprivileged user for rootless execution
# UID/GID 9999: Arbitrary high number, unlikely to conflict with host users
RUN groupadd -g 9999 ts3audiobot && \
    useradd -ms /usr/sbin/nologin -u 9999 -g 9999 ts3audiobot && \
    mkdir -p /data && \
    chown -R ts3audiobot:ts3audiobot /data

# Copy pre-built binaries from builder stage
# Owned by root for binary immutability (W^X principle)
COPY --from=builder --chown=root:root /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=builder --chown=root:root /opt/TS3AudioBot /opt/TS3AudioBot

# Copy default configuration files
WORKDIR /data
COPY --chown=9999:9999 ./config .

# Persistent data volume for config, cache, and database
VOLUME /data

# Switch to unprivileged user (rootless execution)
USER ts3audiobot

# Expose bot communication port
EXPOSE 58913

# Health check: Verify bot web interface is responding
# Runs every 60 seconds, times out after 10 seconds, allows 30s startup time
HEALTHCHECK \
  --interval=60s \
  --timeout=10s \
  --start-period=30s \
  --retries=3 \
  CMD curl -sS http://127.0.0.1:58913/ > /dev/null || exit 1

# Start bot with non-interactive mode and stats disabled
ENTRYPOINT ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive", "--stats-disabled"]
