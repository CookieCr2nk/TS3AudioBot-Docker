FROM alpine:edge

RUN echo "@testing http://dl-4.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories \
    && apk --no-cache add zip \
      ca-certificates  \
      openssl  \
      ffmpeg  \ 
      wget  \
      gnupg  \
      mono-dev@testing  \
      opus-dev \

RUN wget https://yt-dl.org/downloads/latest/youtube-dl -O /usr/local/bin/youtube-dl && chmod a+rx /usr/local/bin/youtube-dl

WORKDIR /app
RUN mkdir -p /opt/TS3AudioBot
    && cd /opt/TS3AudioBot \
    && wget -O TS3AudioBot.zip https://splamy.de/api/nightly/ts3ab/develop/download \
    && unzip TS3AudioBot.zip

CMD ["mono", "TS3AudioBot.exe"]
