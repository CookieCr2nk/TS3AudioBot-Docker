# ts3audiobot-dockerized

This is the TS3AudioBot in a Docker Container based on Ubuntu 18.04 Linux.

improved version of zachary-duquette/TS3AudioBot-Docker

# Usage / Parameters

* For using this Dockerfile you need knowledge in Docker or you can contact me over Discord: CookieCr2nk#3230

* `-v /config` - Location that contains bot configuration files.

* Container First Start 

`docker run -d -p 58913:58913 \
           -v config:/config \`


# Ressources

The Dockerfile uses a lot of Disk Space.

My Next Step is, to use Alpine Linux instead of Ubuntu 18.04


