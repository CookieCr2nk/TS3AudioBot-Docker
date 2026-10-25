# --- Builder ---
FROM mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim AS builder

ARG TARGETARCH
ARG BOT_RELEASE="0.12.0"

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl wget file && \
    rm -rf /var/lib/apt/lists/*

# Self-contained PyInstaller build — the generic "yt-dlp" asset needs python3.
RUN if [ "$TARGETARCH" = "arm64" ]; then YTDLP_ASSET="yt-dlp_linux_aarch64"; \
    else YTDLP_ASSET="yt-dlp_linux"; fi && \
    wget -q --retry-connrefused --waitretry=5 --tries=3 \
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}" \
      -O /usr/local/bin/yt-dlp && \
    chmod 755 /usr/local/bin/yt-dlp && \
    /usr/local/bin/yt-dlp --version

WORKDIR /opt/TS3AudioBot
RUN if [ "$TARGETARCH" = "amd64" ]; then BOT_ARCH="x64"; \
    elif [ "$TARGETARCH" = "arm" ]; then BOT_ARCH="arm"; \
    elif [ "$TARGETARCH" = "arm64" ]; then BOT_ARCH="arm64"; \
    else BOT_ARCH="x64"; fi && \
    RELEASE_URL="https://github.com/Splamy/TS3AudioBot/releases/download/${BOT_RELEASE}/TS3AudioBot_linux_${BOT_ARCH}.tar.gz" && \
    curl -fL --retry 5 --retry-delay 10 "$RELEASE_URL" -o TS3AudioBot.tar.gz && \
    if [ ! -s TS3AudioBot.tar.gz ] || ! file TS3AudioBot.tar.gz | grep -q "gzip compressed"; then \
      echo "Download failed, retrying in 30s..."; \
      rm -f TS3AudioBot.tar.gz; \
      sleep 30; \
      curl -fL --retry 5 --retry-delay 10 "$RELEASE_URL" -o TS3AudioBot.tar.gz; \
    fi && \
    tar -xzf TS3AudioBot.tar.gz && \
    rm -f TS3AudioBot.tar.gz && \
    chmod -R 755 .


# --- Runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:9.0-bookworm-slim

LABEL org.opencontainers.image.title="TS3AudioBot"
LABEL org.opencontainers.image.description="TS3AudioBot on Debian 12 / .NET 9"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/CookieCr2nk/TS3AudioBot-Docker"

ENV DEBIAN_FRONTEND=noninteractive
# The single-file host writes about 68 MiB under DOTNET_BUNDLE_EXTRACT_BASE_DIR
# and maps libhostfxr.so from there. Compose mounts /tmp as a 256 MiB tmpfs
# with exec, because the root filesystem is read-only and Docker's tmpfs
# default is noexec.
ENV DOTNET_BUNDLE_EXTRACT_BASE_DIR=/tmp/.net \
    XDG_CACHE_HOME=/tmp/.cache \
    HOME=/tmp
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# TS3AudioBot 0.12 ships a self-contained .NET Core 3.1 host. That host
# dlopens libicuuc.so.N / libicui18n.so.N only through major version 70
# (dotnet/runtime#34095 raised the ceiling in .NET 5, not in 3.1).
# Bookworm's libicu72 is installed by the base image and is never probed,
# so the process FailFasts before the API listens. Ubuntu 22.04's libicu70
# provides the .so.70 names and requires glibc >= 2.34, which bookworm has.
# Checksums are the jammy pool files libicu70_70.1-2.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl ffmpeg libopus0 && \
    icu_arch="$(dpkg --print-architecture)" && \
    case "$icu_arch" in \
      amd64) \
        icu_url="https://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu70_70.1-2_amd64.deb"; \
        icu_sha="58a154f6307289813da2276f900498ef536ae7c0522d2cf31a3c3c5cf62dfd9a" ;; \
      arm64) \
        icu_url="https://ports.ubuntu.com/pool/main/i/icu/libicu70_70.1-2_arm64.deb"; \
        icu_sha="ac68372cf4a976e6a206858fd9b28c68e49d37d650b9b8653270038a6e7bc174" ;; \
      *) echo "unsupported architecture: ${icu_arch}" >&2; exit 1 ;; \
    esac && \
    curl -fL --retry 5 --retry-delay 5 "$icu_url" -o /tmp/libicu70.deb && \
    echo "${icu_sha}  /tmp/libicu70.deb" | sha256sum -c - && \
    dpkg-deb -x /tmp/libicu70.deb / && \
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