FROM mcr.microsoft.com/dotnet/aspnet:9.0-trixie-slim
LABEL description="TS3Audiobot Dockerized"
LABEL licenseUrl="https://github.com/TS3Audiobot/TS3Audiobot/blob/master/LICENSE"
LABEL url="https://github.com/TS3Audiobot/TS3Audiobot"
LABEL supportUrl="https://github.com/TS3Audiobot/TS3Audiobot/issues"
LABEL os="Linux"
LABEL arch="x64"

# Set non-interactive debian frontend
ENV DEBIAN_FRONTEND=noninteractive

# Installation Packages & SUID Removal
# We install procps for healthcheck/process monitoring, and remove all SUID/SGID bits
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl openssl unzip libopus-dev procps && \
    find / -xdev -perm /6000 -type f -exec chmod a-s {} \; || true && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

#Set Environments (https://github.com/Splamy/TS3AudioBot/releases/) we will use "master" image for now
ARG TS3_AUDIOBOT_RELEASE="master"

#YT-DLP (Root owned, read+execute by anyone)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/youtube-dl \
    && chmod 755 /usr/local/bin/youtube-dl \
    && chown root:root /usr/local/bin/youtube-dl

# Download compiled TS3AudioBot securely, extract it, ensure immutability
RUN mkdir -p /opt/TS3AudioBot \
    && cd /opt/TS3AudioBot \
    && curl -L https://splamy.de/api/nightly/projects/ts3ab/${TS3_AUDIOBOT_RELEASE}/download -o TS3AudioBot.zip \
    && unzip TS3AudioBot.zip \
    && rm -rf TS3AudioBot.zip \
    && chown -R root:root /opt/TS3AudioBot \
    && chmod -R 755 /opt/TS3AudioBot

# Create dedicated Group & User ts3audiobot with no-login shell
RUN groupadd -g 9999 ts3audiobot && \
    useradd -ms /usr/sbin/nologin -u 9999 -g 9999 ts3audiobot && \
    mkdir -p /data && \
    chown -R ts3audiobot:ts3audiobot /data

#Final Steps
WORKDIR /data
COPY --chown=9999:9999 ./config .
VOLUME /data

# Running as unprivileged service account
USER ts3audiobot
EXPOSE 58913

# Healthcheck to verify process health
HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
  CMD curl -sS http://127.0.0.1:58913/ || exit 1

ENTRYPOINT ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive", "--stats-disabled"]
