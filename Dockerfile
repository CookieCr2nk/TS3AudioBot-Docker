# --- Builder ---
# Compile on the build machine. The output is IL and runs on every runtime architecture.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS builder

ARG TARGETARCH
ARG BOT_REF=develop

ENV DEBIAN_FRONTEND=noninteractive \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    GIT_TERMINAL_PROMPT=0
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl git unzip && \
    rm -rf /var/lib/apt/lists/*

# arm/v7 yt-dlp is an onedir zip, so _internal has to sit next to the binary.
# This stage is the build machine. Do not run the target binary here.
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
        rm -rf /tmp/yt-dlp /tmp/yt-dlp.zip && \
        test -d /opt/yt-dlp/_internal ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    chmod 755 /opt/yt-dlp/yt-dlp && \
    test -s /opt/yt-dlp/yt-dlp && \
    ln -s /opt/yt-dlp/yt-dlp /usr/local/bin/yt-dlp

# Upstream develop has no release build. The README builds net10.0 from a full clone.
WORKDIR /src
RUN git clone --recurse-submodules --shallow-submodules --depth 1 --branch "$BOT_REF" \
      https://github.com/Splamy/TS3AudioBot.git . && \
    git rev-parse HEAD && \
    dotnet build --framework net10.0 --configuration Release TS3AudioBot && \
    mkdir -p /opt/TS3AudioBot && \
    cp -a TS3AudioBot/bin/Release/net10.0/. /opt/TS3AudioBot/ && \
    test -f /opt/TS3AudioBot/TS3AudioBot.dll

# --- Runtime ---
FROM mcr.microsoft.com/dotnet/runtime:10.0

LABEL org.opencontainers.image.title="TS3AudioBot"
LABEL org.opencontainers.image.description="TS3AudioBot develop on the .NET 10 runtime"
LABEL org.opencontainers.image.licenses="OSL-3.0"
LABEL org.opencontainers.image.source="https://github.com/CookieCr2nk/TS3AudioBot-Docker"

USER root
ENV DEBIAN_FRONTEND=noninteractive
# HOME and the cache sit on /tmp because the root filesystem is read-only.
ENV XDG_CACHE_HOME=/tmp/.cache \
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
