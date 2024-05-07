FROM mcr.microsoft.com/dotnet/aspnet:8.0.3-bookworm-slim
LABEL description="TS3Audiobot Dockerized"
LABEL licenseUrl="https://github.com/TS3Audiobot/TS3Audiobot/blob/master/LICENSE"
LABEL url="https://github.com/TS3Audiobot/TS3Audiobot"
LABEL supportUrl="https://github.com/TS3Audiobot/TS3Audiobot/issues"
LABEL os="Linux"
LABEL arch="x64"

#Installation Packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl openssl unzip libopus-dev && \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/*

#Set Environments (https://github.com/Splamy/TS3AudioBot/releases/) we will use "master" image for now
ARG TS3_AUDIOBOT_RELEASE="master"

#YT-DLP
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/youtube-dl \
    && chmod a+rx /usr/local/bin/youtube-dl

# Downloaded compiled TS3AudioBot from Splamy.de and extract it
RUN mkdir -p /opt/TS3AudioBot \
    && cd /opt/TS3AudioBot \
    && curl -L https://splamy.de/api/nightly/projects/ts3ab/${TS3_AUDIOBOT_RELEASE}/download -o TS3AudioBot.zip \
    && unzip TS3AudioBot.zip \
    && rm -rf TS3AudioBot.zip

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
ENTRYPOINT ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive", "--stats-disabled"]
