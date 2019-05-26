FROM ubuntu:18.04

RUN apt-get update && apt-get install -y ffmpeg wget p7zip-full gpg libopus-dev python

RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF
RUN echo "deb http://download.mono-project.com/repo/debian stable-bionic main" > /etc/apt/sources.list.d/mono-official-stable.list \
  && apt-get update \
  && apt-get install -y mono-complete \
  && rm -rf /var/lib/apt/lists/* /tmp/*

RUN wget https://yt-dl.org/downloads/latest/youtube-dl -O /usr/local/bin/youtube-dl && chmod a+rx /usr/local/bin/youtube-dl

WORKDIR /app
RUN wget -O TS3AudioBot.zip https://splamy.de/api/nightly/ts3ab/develop/download && 7z x TS3AudioBot.zip && rm -f TS3AudioBot.zip

CMD  ["mono", "TS3AudioBot.exe", "--non-interactive", "-c", "/config/TS3AudioBot.config"]
