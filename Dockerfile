FROM debian:stretch

RUN apt-get update && apt-get install -y ffmpeg wget p7zip-full gpg libopus-dev python

RUN wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.asc.gpg
RUN mv microsoft.asc.gpg /etc/apt/trusted.gpg.d/
RUN wget -q https://packages.microsoft.com/config/debian/9/prod.list
RUN mv prod.list /etc/apt/sources.list.d/microsoft-prod.list
RUN chown root:root /etc/apt/trusted.gpg.d/microsoft.asc.gpg
RUN chown root:root /etc/apt/sources.list.d/microsoft-prod.list

RUN apt-get install apt-transport-https -y
RUN apt-get update
RUN apt-get install dotnet-sdk-2.2 -y

RUN wget https://yt-dl.org/downloads/latest/youtube-dl -O /usr/local/bin/youtube-dl && chmod a+rx /usr/local/bin/youtube-dl

WORKDIR /ts3audiobot
RUN wget -O TS3AudioBot.zip https://splamy.de/api/nightly/ts3ab/develop_dotnet_core/download && 7z x TS3AudioBot.zip && rm -f TS3AudioBot.zip

VOLUME /config
CMD ["dotnet", "TS3AudioBot.dll", "--non-interactive", "-c", "/config/TS3AudioBot.config"]
