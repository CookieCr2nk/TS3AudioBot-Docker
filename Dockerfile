# --- Builder ---
FROM mcr.microsoft.com/dotnet/runtime:3.1-bullseye-slim AS builder

ARG TARGETARCH
ARG BOT_RELEASE="0.12.0"

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/TS3AudioBot
RUN case "$TARGETARCH" in \
      amd64) bot_arch="x64"; ytdlp="yt-dlp_linux" ;; \
      arm64) bot_arch="arm64"; ytdlp="yt-dlp_linux_aarch64" ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    curl -fL --retry 5 --retry-delay 5 \
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlp}" \
      -o /usr/local/bin/yt-dlp && \
    chmod 755 /usr/local/bin/yt-dlp && \
    /usr/local/bin/yt-dlp --version && \
    curl -fL --retry 5 --retry-delay 10 \
      "https://github.com/Splamy/TS3AudioBot/releases/download/${BOT_RELEASE}/TS3AudioBot_linux_${bot_arch}.tar.gz" \
      -o TS3AudioBot.tar.gz && \
    tar -xzf TS3AudioBot.tar.gz && \
    rm TS3AudioBot.tar.gz && \
    chmod -R 755 .

# --- Runtime ---
FROM mcr.microsoft.com/dotnet/runtime:3.1-bullseye-slim

LABEL org.opencontainers.image.title="TS3AudioBot"
LABEL org.opencontainers.image.description="TS3AudioBot 0.12 on the .NET Core 3.1 runtime"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/CookieCr2nk/TS3AudioBot-Docker"

ENV DEBIAN_FRONTEND=noninteractive
# The single-file host extracts its bundle under /tmp/.net.
# HOME and the cache sit on that tmpfs because the root filesystem is read-only.
ENV DOTNET_BUNDLE_EXTRACT_BASE_DIR=/tmp/.net \
    XDG_CACHE_HOME=/tmp/.cache \
    HOME=/tmp
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# libopus0 ships libopus.so.0. The bot imports libopus.so.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl ffmpeg libopus0 && \
    opus_dir="$(dirname "$(find /usr/lib -name 'libopus.so.0' -print -quit)")" && \
    ln -sfn libopus.so.0 "${opus_dir}/libopus.so" && \
    ldconfig && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    find / -xdev -perm /6000 -type f -print0 | xargs -0 -r chmod a-s

RUN groupadd -g 9999 ts3audiobot && \
    useradd -ms /usr/sbin/nologin -u 9999 -g 9999 ts3audiobot && \
    mkdir -p /data && \
    chown -R ts3audiobot:ts3audiobot /data

COPY --from=builder --chown=root:root /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=builder --chown=root:root /opt/TS3AudioBot /opt/TS3AudioBot

WORKDIR /data
COPY --chown=9999:9999 ./config .
VOLUME /data

USER ts3audiobot
EXPOSE 58913

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -sS http://127.0.0.1:58913/ > /dev/null || exit 1

ENTRYPOINT ["/opt/TS3AudioBot/TS3AudioBot", "--non-interactive", "--stats-disabled"]
