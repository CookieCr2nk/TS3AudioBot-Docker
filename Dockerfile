FROM mcr.microsoft.com/dotnet/core/runtime
MAINTAINER CookieCr2nk
LABEL description="TS3Audiobot Dockerized"
#Install requires
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg openssl curl openssl unzip libopus-dev python && \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/*

#YT-DL Herunterladen
RUN curl -L https://yt-dl.org/downloads/latest/youtube-dl -o /usr/local/bin/youtube-dl \
    && chmod a+rx /usr/local/bin/youtube-dl

# TS3Audiobot installieren (https://github.com/Splamy/TS3AudioBot/releases/)
RUN mkdir -p /opt/TS3AudioBot \
    && cd /opt/TS3AudioBot \
    && curl -L https://github.com/Splamy/TS3AudioBot/releases/download/0.11.0/TS3AudioBot_dotnet_core_3.1.zip -o TS3AudioBot.zip \
    && unzip TS3AudioBot.zip

#adduser
RUN useradd -ms /bin/bash -u 9999 ts3audiobot

#Create /data
RUN mkdir -p /data
RUN chown -R ts3audiobot:nogroup /data

USER ts3audiobot

#Set workdir
VOLUME /opt/TS3AudioBot
WORKDIR /opt/TSAudioBot


#Portfreigabe Webinterface
EXPOSE 58913

#TS3Audiobot starten
CMD ["dotnet", "/opt/TS3AudioBot/TS3AudioBot.dll", "--non-interactive"]
