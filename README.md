# TS3AudioBot-Docker

![Docker](https://github.com/CookieCr2nk/TS3AudioBot-Docker/workflows/Docker/badge.svg?branch=master)

This is the TS3AudioBot in a Docker Container based on Debian Buster with dotnet runtime 3.1

# Usage / Parameters

Setup the Docker Volume

```
docker volume create ts3audiobot-data
```
1. First Pull the Container Image from Github Packages

```docker pull noajoder/ts3audiobot:master```

2. Run the initial setup to generate all the initial configuration files:

```docker run --rm -v ts3audiobot-data:/data -it noajoder/ts3audiobot:master```

3. After the initial configuration setup has finished, stop the server with CTRL-C and configure your bot in the configuration files accordingly. Now you can copy the data in the Config folder in your Data Mount or create an own Config.

4. Add your server address to address = "voice.teamspeak.com" in your bot.toml, that is located in: /var/lib/docker/volumes/ts3audiobot-data/_data/bots/default/bot.toml

5. You can Modify the Data in the Docker Volume. The Docker volume is located at ```/var/lib/docker/volumes/ts3audiobot-data/_data```

6. Then run the actual container again as a daemon:

```docker run --name ts3audiobot -d -p 58913:58913 -v /opt/ts3audiobot/data:/data noajoder/ts3audiobot:master```


# Docker Image Building

* Docker Build:  ```docker build -f ts3audiobot:1.0 . ```

# Contribution

Feel free to make an feature request or an pull request.

# Ressources

This Dockerfile uses minimal ressources.

# TS3AudioBot Version

This image was build on .Dotnet 3.1 with ts3audiobot version ```master_linux_x64 0.12.2```
