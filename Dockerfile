FROM ubuntu:18.04

RUN apt-get update && apt-get install -y ffmpeg wget p7zip-full gpg libopus-dev python

RUN wget -q https://packages.microsoft.com/config/ubuntu/18.04/packages-microsoft-prod.deb
RUN dpkg -i packages-microsoft-prod.deb
RUN apt-get install software-properties-common
RUN add-apt-repository universe
RUN apt-get install apt-transport-https
RUN apt-get update
RUN apt-get install dotnet-sdk-2.2
RUN rm -rf /var/lib/apt/lists/* /tmp/*

RUN wget https://yt-dl.org/downloads/latest/youtube-dl -O /usr/local/bin/youtube-dl && chmod a+rx /usr/local/bin/youtube-dl

WORKDIR /app
RUN wget -O TS3AudioBot.zip https://splamy.de/api/nightly/ts3ab/develop_dotnet_core/download && 7z x TS3AudioBot.zip && rm -f TS3AudioBot.zip

CMD ["dotnet", "TS3AudioBot.dll", "--non-interactive", "-c", "/config/TS3AudioBot.config"]
