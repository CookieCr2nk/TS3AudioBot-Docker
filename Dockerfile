# --- Builder Stage ---
FROM mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim AS builder

# Expose buildx variables for architecture detection
ARG TARGETARCH

# Set Environments
ARG BOT_BRANCH="master"
ENV BOT_BRANCH=${BOT_BRANCH}
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# YT-DLP Download
RUN curl -fL --retry 3 --retry-delay 5 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod 755 /usr/local/bin/yt-dlp

# TS3AudioBot Download directly correlating to the matching Architecture
RUN mkdir -p /opt/TS3AudioBot && \
    cd /opt/TS3AudioBot && \
    if [ "$TARGETARCH" = "amd64" ]; then BOT_ARCH="x64"; \
    elif [ "$TARGETARCH" = "arm" ]; then BOT_ARCH="arm"; \
    elif [ "$TARGETARCH" = "arm64" ]; then BOT_ARCH="arm64"; \
    else BOT_ARCH="x64"; fi && \
    curl -fL --retry 5 --retry-delay 10 "https://splamy.de/api/nightly/projects/ts3ab/${BOT_BRANCH}_linux_${BOT_ARCH}/download" -o TS3AudioBot.tar.gz && \
    if [ ! -s TS3AudioBot.tar.gz ] || ! file TS3AudioBot.tar.gz | grep -q "gzip compressed"; then \
      echo "Download failed or invalid archive, retrying..."; \
      rm -f TS3AudioBot.tar.gz; \
      sleep 30; \
      curl -fL --retry 5 --retry-delay 10 "https://splamy.de/api/nightly/projects/ts3ab/${BOT_BRANCH}_linux_${BOT_ARCH}/download" -o TS3AudioBot.tar.gz; \
    fi && \
    tar -xzf TS3AudioBot.tar.gz && \
    rm -f TS3AudioBot.tar.gz

# Create secure structure
RUN chmod -R 755 /opt/TS3AudioBot


# --- Final Production Stage ---
FROM mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim
ARG TARGETARCH
LABEL org.opencontainers.image.description="TS3AudioBot Dockerized"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.url="https://github.com/TS3Audiobot/TS3Audiobot"
LABEL org.opencontainers.image.source="https://github.com/CookieCr2nk/TS3AudioBot-Docker"
LABEL org.opencontainers.image.base.name="mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim"

ENV DEBIAN_FRONTEND=noninteractive

# Install Runtime Dependencies & Mitigate SUID
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl libopus0 && \
    find / -xdev -perm /6000 -type f -exec chmod a-s {} \; || true && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Setup secure unprivileged user & data group
RUN groupadd -g 9999 ts3audiobot && \
    useradd -ms /usr/sbin/nologin -u 9999 -g 9999 ts3audiobot && \
    mkdir -p /data && \
    chown -R ts3audiobot:ts3audiobot /data

# Copy pre-built binaries from Builder Stage, ensuring they remain Root-owned (Immutability W^X)
COPY --from=builder --chown=root:root /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=builder --chown=root:root /opt/TS3AudioBot /opt/TS3AudioBot

# Set Final Working Directory
WORKDIR /data
COPY --chown=9999:9999 ./config .
VOLUME /data

# Run as least privileged user
USER ts3audiobot
EXPOSE 58913

# Validate via local endpoint
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -sS http://127.0.0.1:58913/ || exit 1

ENTRYPOINT ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive", "--stats-disabled"]
