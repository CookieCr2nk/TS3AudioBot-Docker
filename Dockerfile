FROM mcr.microsoft.com/dotnet/core/runtime:3.1.22-bullseye-slim
LABEL description="TS3Audiobot Dockerized"
LABEL licenseUrl="https://github.com/TS3Audiobot/TS3Audiobot/blob/master/LICENSE"
LABEL url="https://github.com/TS3Audiobot/TS3Audiobot"
LABEL supportUrl="https://github.com/TS3Audiobot/TS3Audiobot/issues"
LABEL os="Linux"
LABEL arch="x64"

#Installation Packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg openssl curl openssl tar libopus-dev python && \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/*

#Set Environments
#Ver 0.11.3
ARG TS3_AUDIOBOT_RELEASE="master_linux_x64"

#YT-DL
RUN curl -L https://yt-dl.org/downloads/latest/youtube-dl -o /usr/local/bin/youtube-dl \
    && chmod a+rx /usr/local/bin/youtube-dl

# TS3Audiobot (https://github.com/Splamy/TS3AudioBot/releases/)
RUN mkdir -p /opt/TS3AudioBot \
    && cd /opt/TS3AudioBot \
    && curl -L https://splamy.de/api/nightly/projects/ts3ab/${TS3_AUDIOBOT_RELEASE}/download -o TS3AudioBot.tar.gz \
    && tar -xzf TS3AudioBot.tar.gz \
    && rm -rf TS3AudioBot.tar.gz

#create User ts3audiobot and create /data Path and modify rights
RUN useradd -ms /bin/bash -u 9999 ts3audiobot
RUN mkdir -p /data
RUN chown -R ts3audiobot:nogroup /data

#Final Steps
WORKDIR /data
ADD --chown=9999:9999 ./config .
VOLUME /data
USER ts3audiobot
EXPOSE 58913
CMD ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive", "--stats-disabled"]