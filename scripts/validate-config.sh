#!/bin/bash
# Configuration validation script for TS3AudioBot-Docker
# Validates that the configuration files have required fields

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/../config"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0
warnings=0

log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1" >&2
    ((errors++))
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1" >&2
    ((warnings++))
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Check if config files exist
echo "Validating TS3AudioBot configuration..."
echo

if [ ! -f "$CONFIG_DIR/ts3audiobot.toml" ]; then
    log_error "ts3audiobot.toml not found at $CONFIG_DIR/ts3audiobot.toml"
    log_warning "Run 'make config-init' to create config files from templates"
    exit 1
fi

if [ ! -f "$CONFIG_DIR/rights.toml" ]; then
    log_error "rights.toml not found at $CONFIG_DIR/rights.toml"
fi

log_success "Configuration files found"

# Check required fields in ts3audiobot.toml
echo
echo "Checking ts3audiobot.toml required fields..."

check_field() {
    local file="$1"
    local field="$2"
    local description="$3"

    if grep -q "^$field\s*=" "$file"; then
        log_success "$description configured"
        return 0
    else
        log_warning "$description not configured"
        return 1
    fi
}

check_field "$CONFIG_DIR/ts3audiobot.toml" "address" "TeamSpeak server address"
check_field "$CONFIG_DIR/ts3audiobot.toml" "name" "Bot nickname"

# Check if identity is set (can be empty on first run)
echo
echo "Checking connection credentials..."

if grep -q "key = \"\"" "$CONFIG_DIR/ts3audiobot.toml"; then
    log_warning "Bot identity (key) is empty - will be generated on first run"
fi

if grep -q "server_password = { pw = \"\"" "$CONFIG_DIR/ts3audiobot.toml"; then
    log_success "No server password set (OK if server doesn't require one)"
fi

# Check web configuration
echo
echo "Checking web interface..."

if grep -q "enabled = true" "$CONFIG_DIR/ts3audiobot.toml"; then
    if grep -q "port = 58913" "$CONFIG_DIR/ts3audiobot.toml"; then
        log_success "Web interface enabled on port 58913"
    else
        log_warning "Web interface port differs from default 58913"
    fi
else
    log_warning "Web interface is disabled"
fi

# Check audio configuration
echo
echo "Checking audio settings..."

check_field "$CONFIG_DIR/ts3audiobot.toml" "send_mode" "Audio send mode"
check_field "$CONFIG_DIR/ts3audiobot.toml" "bitrate" "Audio bitrate"

# Check tools configuration
echo
echo "Checking required tools..."

if grep -q "youtube-dl = { path = \"/usr/local/bin/yt-dlp\"" "$CONFIG_DIR/ts3audiobot.toml"; then
    log_success "yt-dlp path configured correctly"
else
    log_warning "yt-dlp path may be incorrect"
fi

if grep -q "ffmpeg" "$CONFIG_DIR/ts3audiobot.toml"; then
    log_success "ffmpeg configured"
else
    log_warning "ffmpeg not found in config"
fi

# Summary
echo
echo "=================================="
if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}✓ All validations passed!${NC}"
    echo "Configuration is ready for use."
    exit 0
elif [ $errors -eq 0 ]; then
    echo -e "${YELLOW}⚠ Validation passed with $warnings warning(s)${NC}"
    echo "Some optional fields are not configured."
    echo "Review the warnings above and update as needed."
    exit 0
else
    echo -e "${RED}✗ Validation failed with $errors error(s) and $warnings warning(s)${NC}"
    echo "Please fix the errors above before running the bot."
    exit 1
fi
