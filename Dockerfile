FROM mcr.microsoft.com/dotnet/core/runtime:3.1
LABEL description="TS3Audiobot Dockerized"

#Install requiremenbts
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg openssl curl openssl unzip libopus-dev python && \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/*
    
#Set Environments
#Ver 0.11.3
ARG TS3_AUDIOBOT_RELEASE="master_dotnet_core_3_1_preview"

#YT-DL
RUN curl -L https://yt-dl.org/downloads/latest/youtube-dl -o /usr/local/bin/youtube-dl \
    && chmod a+rx /usr/local/bin/youtube-dl

# TS3Audiobot (https://github.com/Splamy/TS3AudioBot/releases/)
RUN mkdir -p /opt/TS3AudioBot \
    && cd /opt/TS3AudioBot \
    && curl -L https://splamy.de/api/nightly/ts3ab/${TS3_AUDIOBOT_RELEASE}/download -o TS3AudioBot.zip \
    && unzip TS3AudioBot.zip

#adduser
RUN useradd -ms /bin/bash -u 9999 ts3audiobot

#/data for data persistents between restarts
RUN mkdir -p /data
RUN chown -R ts3audiobot:nogroup /data

#Copy Config Template into Container
COPY --chown=ts3audiobot:nogroup ./ts3audiobot_config/* /data

USER ts3audiobot

WORKDIR /data

#WebUI
EXPOSE 58913

CMD ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive"]
