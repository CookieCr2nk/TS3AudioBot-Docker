ARG REPO=mcr.microsoft.com/dotnet/core/runtime-deps
FROM $REPO:3.1-buster-slim
MAINTAINER CookieCr2nk
LABEL description="TS3Audiobot Dockerized"
#Install requires
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl wget unzip libopus-dev python && \
    rm -rf /tmp/* /var/tmp/* /var/lib/apt/lists/*

# Install .NET Core
RUN dotnet_version=3.1.3 \
    && curl -SL --output dotnet.tar.gz https://dotnetcli.azureedge.net/dotnet/Runtime/$dotnet_version/dotnet-runtime-$dotnet_version-linux-x64.tar.gz \
    && dotnet_sha512='e3f6f9b81bc3828b60f7da5a5c341373dc17f971f1de3f2714adcca180a630a60d4b681166fe78434d8b2ce023d2d08eff4f1935ec664130b7f856fa8e1cac2b' \
    && echo "$dotnet_sha512 dotnet.tar.gz" | sha512sum -c - \
    && mkdir -p /usr/share/dotnet \
    && tar -ozxf dotnet.tar.gz -C /usr/share/dotnet \
    && rm dotnet.tar.gz \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet

#YT-DL Herunterladen
RUN curl -L https://yt-dl.org/downloads/latest/youtube-dl -o /usr/local/bin/youtube-dl && chmod a+rx /usr/local/bin/youtube-dl

# TS3Audiobot installieren
WORKDIR /app
RUN wget -O TS3AudioBot.zip https://splamy.de/api/nightly/ts3ab/develop_linux_x64/download && unzip TS3AudioBot.zip && rm -f TS3AudioBot.zip
VOLUME /app
#Portfreigabe
EXPOSE 58913

#TS3Audiobot starten
 CMD ["dotnet", "TS3AudioBot.dll", "--non-interactive"]
