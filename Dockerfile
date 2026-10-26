# --- Builder ---
FROM debian:bookworm-slim AS builder

ARG TARGETARCH
ARG BOT_RELEASE="0.12.0"

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl unzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt/TS3AudioBot
# The 0.12 zip is architecture-independent. yt-dlp is not.
# arm/v7 publishes an onedir zip, so _internal has to sit next to the binary.
RUN mkdir -p /opt/yt-dlp && \
    case "$TARGETARCH" in \
      amd64) curl -fL --retry 5 --retry-delay 5 \
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" \
        -o /opt/yt-dlp/yt-dlp ;; \
      arm64) curl -fL --retry 5 --retry-delay 5 \
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64" \
        -o /opt/yt-dlp/yt-dlp ;; \
      arm) curl -fL --retry 5 --retry-delay 5 \
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_armv7l.zip" \
        -o /tmp/yt-dlp.zip && \
        unzip /tmp/yt-dlp.zip -d /tmp/yt-dlp && \
        mv /tmp/yt-dlp/yt-dlp_linux_armv7l /opt/yt-dlp/yt-dlp && \
        mv /tmp/yt-dlp/_internal /opt/yt-dlp/_internal && \
        rm -rf /tmp/yt-dlp /tmp/yt-dlp.zip ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    chmod 755 /opt/yt-dlp/yt-dlp && \
    ln -s /opt/yt-dlp/yt-dlp /usr/local/bin/yt-dlp && \
    /usr/local/bin/yt-dlp --version && \
    curl -fL --retry 5 --retry-delay 10 \
      "https://github.com/Splamy/TS3AudioBot/releases/download/${BOT_RELEASE}/TS3AudioBot_dotnetcore3.1.zip" \
      -o TS3AudioBot.zip && \
    unzip TS3AudioBot.zip && \
    rm TS3AudioBot.zip && \
    test -f TS3AudioBot.dll

# The 3.1 tag is not one multi-arch manifest. Each Debian 11 tag is separate.
FROM mcr.microsoft.com/dotnet/aspnet:3.1-bullseye-slim AS runtime-amd64
FROM mcr.microsoft.com/dotnet/aspnet:3.1-bullseye-slim-arm64v8 AS runtime-arm64
FROM mcr.microsoft.com/dotnet/aspnet:3.1-bullseye-slim-arm32v7 AS runtime-arm

# --- Runtime ---
ARG TARGETARCH
FROM runtime-${TARGETARCH}

LABEL org.opencontainers.image.title="TS3AudioBot"
LABEL org.opencontainers.image.description="TS3AudioBot 0.12 on the .NET Core 3.1 ASP.NET runtime"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/CookieCr2nk/TS3AudioBot-Docker"

ENV DEBIAN_FRONTEND=noninteractive
# HOME and the cache sit on /tmp because the root filesystem is read-only.
ENV XDG_CACHE_HOME=/tmp/.cache \
    HOME=/tmp
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# libopus0 ships libopus.so.0. The bot imports libopus.so.
# Bullseye security debs 404 on deb.debian.org. The files are on the archive.
RUN printf 'deb http://archive.debian.org/debian bullseye main\ndeb http://archive.debian.org/debian-security bullseye-security main\n' > /etc/apt/sources.list && \
    printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99no-check-valid && \
    rm -f /etc/apt/sources.list.d/* && \
    apt-get update && \
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

COPY --from=builder --chown=root:root /opt/yt-dlp /opt/yt-dlp
COPY --from=builder --chown=root:root /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=builder --chown=root:root /opt/TS3AudioBot /opt/TS3AudioBot

WORKDIR /data
COPY --chown=9999:9999 ./config .
VOLUME /data

USER ts3audiobot
EXPOSE 58913

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -sS http://127.0.0.1:58913/ > /dev/null || exit 1

ENTRYPOINT ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive", "--stats-disabled"]
