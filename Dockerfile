ARG REPO=mcr.microsoft.com/dotnet/core/runtime-deps
FROM $REPO:2.2-stretch-slim
MAINTAINER CookieCr2nk
LABEL description="TS3Audiobot Dockerized"
#Install requires
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl wget unzip libopus-dev python && \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/*

# Install .NET Core
ENV DOTNET_VERSION 2.2.5

RUN curl -SL --output dotnet.tar.gz https://dotnetcli.blob.core.windows.net/dotnet/Runtime/$DOTNET_VERSION/dotnet-runtime-$DOTNET_VERSION-linux-x64.tar.gz \
    && dotnet_sha512='7cacc139737a7b05d5adcea0125e0d3ed7342e1d81d94d0445dbbcb64d6db2e9c840311966ac091ad0e4e4c737edee09aa0533252ec75510c9285008632adf03' \
    && echo "$dotnet_sha512 dotnet.tar.gz" | sha512sum -c - \
    && mkdir -p /usr/share/dotnet \
    && tar -zxf dotnet.tar.gz -C /usr/share/dotnet \
    && rm dotnet.tar.gz \
&& ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet

#YT-DL Herunterladen
RUN curl -L https://yt-dl.org/downloads/latest/youtube-dl -o /usr/local/bin/youtube-dl && chmod a+rx /usr/local/bin/youtube-dl

# TS3Audiobot installieren
WORKDIR /app
RUN wget -O TS3AudioBot.zip https://splamy.de/api/nightly/ts3ab/develop_dotnet_core/download && unzip TS3AudioBot.zip && rm -f TS3AudioBot.zip
VOLUME ts3bot-data:/app
#Portfreigabe
EXPOSE 58913

#TS3Audiobot starten
CMD ["dotnet", "TS3AudioBot.dll", "--non-interactive"]

