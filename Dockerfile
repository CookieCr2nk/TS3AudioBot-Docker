FROM mcr.microsoft.com/dotnet/core/runtime
LABEL description="TS3Audiobot Dockerized"

#Install requires
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg openssl curl openssl unzip libopus-dev python && \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/*
    
#Set Environments
ARG TS3_AUDIOBOT_RELEASE="0.12.0-alpha.52"
ARG TS3_AUDIOBOT_FLAVOUR="develop_linux_x64"

#YT-DL
RUN curl -L https://yt-dl.org/downloads/latest/youtube-dl -o /usr/local/bin/youtube-dl \
    && chmod a+rx /usr/local/bin/youtube-dl

# TS3Audiobot install (https://github.com/Splamy/TS3AudioBot/releases/)
RUN mkdir -p /opt/TS3AudioBot \
    && cd /opt/TS3AudioBot \
    && curl -L https://splamy.de/api/nightly/ts3ab/${TS3_AUDIOBOT_FLAVOUR} -o TS3AudioBot.zip \
    && unzip TS3AudioBot.zip

#adduser
RUN useradd -ms /bin/bash -u 9999 ts3audiobot

#/data
RUN mkdir -p /data
RUN chown -R ts3audiobot:nogroup /data

USER ts3audiobot

WORKDIR /data

#WebPort
EXPOSE 58913

CMD ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive"]
