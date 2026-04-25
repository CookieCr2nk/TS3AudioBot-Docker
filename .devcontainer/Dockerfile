FROM mcr.microsoft.com/devcontainers/base:debian-12

# Install additional dev tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    build-essential \
    vim \
    nano \
    htop \
    jq \
    shellcheck \
    && rm -rf /var/lib/apt/lists/* /tmp/*
