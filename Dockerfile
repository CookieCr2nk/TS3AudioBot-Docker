FROM centos:7

RUN yum update && yum -y install epel-release unzip wget %% rpm -Uvh http://li.nux.ro/download/nux/dextop/el7/x86_64/nux-dextop-release-0-5.el7.nux.noarch.rpm && yum -y install ffmpeg opus-devel

RUN rpm --import "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0x3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF"
RUN su -c 'curl https://download.mono-project.com/repo/centos7-stable.repo | tee /etc/yum.repos.d/mono-centos7-stable.repo'
  && apt-get update \
  && apt-get install -y mono-devel \
  
RUN wget https://yt-dl.org/downloads/latest/youtube-dl -O /usr/local/bin/youtube-dl && chmod a+rx /usr/local/bin/youtube-dl

WORKDIR /app
RUN wget -O TS3AudioBot.zip https://splamy.de/api/nightly/ts3ab/develop/download && 7z x TS3AudioBot.zip && rm -f TS3AudioBot.zip

CMD ["mono", "TS3AudioBot.exe", "--non-interactive", "-c", "/config/TS3AudioBot.config"]
