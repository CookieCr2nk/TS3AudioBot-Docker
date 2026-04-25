# Configuration Guide

This guide documents all configuration options for TS3AudioBot running in Docker.

## Configuration Files Location

Inside the container, configuration files are located at `/data/`:
- `ts3audiobot.toml` - Main bot configuration
- `rights.toml` - User rights and permissions
- `ts3audiobot.db` - SQLite database (auto-created)

When using Docker, these are mounted to your local volume at the path shown by:
```bash
docker volume inspect ts3audiobot-data
```

## ts3audiobot.toml

The main configuration file for the TS3AudioBot instance. Below are the essential sections:

### [bot]
```toml
[bot]
name = "TS3AudioBot"           # Display name of the bot in TeamSpeak
port = 58913                    # Port for web interface and stats
ts3_path = "/data"             # Path where bot data is stored
```

### [client]
```toml
[client]
address = "your.teamspeak.server"  # IP or hostname of TeamSpeak server
port = 9987                         # TeamSpeak server port (default 9987)
identity = ""                       # Bot identity (generated on first run)
password = ""                       # Bot login password
channel_subscribe_all = true        # Subscribe to all channels
```

**Identity & Password**: On first run, the bot generates a unique identity. You must:
1. Add this identity to your TeamSpeak server's identity whitelist
2. Create a bot user account in TeamSpeak
3. Set the password in this config
4. Grant the bot necessary permissions in TeamSpeak

### [plugins]
```toml
[plugins]
enabled = ["plugins.audioplayer"]   # Enable core audio plugin
```

Available plugins depend on the TS3AudioBot version. Check upstream documentation.

### [logging]
```toml
[logging]
level = "info"                 # Log level: debug, info, warning, error
console = true                 # Log to console/stdout
file = false                   # Log to file (set to true for file logging)
file_path = "/data/logs"       # Log file directory
```

For PCI-DSS compliance, use `console = true` and configure Docker logging drivers (see README).

### [web]
```toml
[web]
enabled = true                 # Enable web interface
port = 58913                   # Web interface port
```

### [extensions] & [commands]
Each section controls feature extensions and command availability. See upstream documentation for complete options.

---

## rights.toml

Controls user permissions and access levels for the bot. Format:

```toml
# Default permissions for all users
[rights]
general = 0                     # General permission level

# User ID based permissions (get from TeamSpeak)
[user.12345]
admin = true                    # Grant admin privileges
```

**Common permission levels**:
- `0` - No permissions (view only)
- `1` - User permissions
- `2` - Power user
- `3` - Admin

### Example Configuration

```toml
# Admin user
[user.12345]
admin = true

# Moderator
[user.67890]
general = 2

# Guest (default)
[rights]
general = 0
```

---

## Environment Variables

The Docker container recognizes these environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `BOT_BRANCH` | `master` | Which TS3AudioBot branch to use (build-time only) |
| `DEBIAN_FRONTEND` | `noninteractive` | Suppresses interactive prompts |

---

## First-Run Setup

1. **Start container for configuration generation**:
   ```bash
   docker-compose run --rm ts3audiobot
   ```

2. **Stop with `CTRL+C` when you see**:
   ```
   INFO Bot starting...
   ```

3. **Edit configuration files**:
   ```bash
   # Find the volume location
   docker volume inspect ts3audiobot-data
   
   # Edit the config (use your editor)
   nano /var/lib/docker/volumes/ts3audiobot-data/_data/bots/default/bot.toml
   ```

4. **Required changes**:
   - Set `address` to your TeamSpeak server IP
   - Set `port` if your TS3 server uses non-standard port 9987
   - Add the generated `identity` to TeamSpeak
   - Create bot account in TeamSpeak and set password

5. **Start the bot**:
   ```bash
   docker-compose up -d
   ```

---

## Configuration Validation

The container performs basic validation on startup. If there are issues, check logs:

```bash
docker-compose logs ts3audiobot
```

Common errors:
- `Connection refused`: TeamSpeak server address/port incorrect
- `Invalid identity`: Identity not in TeamSpeak whitelist
- `Authentication failed`: Password incorrect or bot account not created

---

## Advanced Configuration

### Custom Plugins

Place plugin files in `/data/plugins/`:
```bash
docker cp my-plugin.ts3plugin ts3audiobot:/data/plugins/
docker-compose restart ts3audiobot
```

### Database Backup

The SQLite database is stored in `/data/ts3audiobot.db`. Backup regularly:

```bash
# Backup
docker cp ts3audiobot:/data/ts3audiobot.db ./ts3audiobot.db.backup

# Restore
docker cp ./ts3audiobot.db.backup ts3audiobot:/data/ts3audiobot.db
```

### Log Persistence

By default, logs go to stdout (container logs). For file logging:

1. Edit `ts3audiobot.toml`:
   ```toml
   [logging]
   file = true
   file_path = "/data/logs"
   ```

2. Logs appear in `/data/logs/` which persists in your volume

### Audio Processing

Ensure `ffmpeg` and `libopus0` are available (included in base image). For custom audio formats:

1. Check yt-dlp compatibility
2. Verify codec support in .NET 9.0
3. Test with a small sample file first

---

## Troubleshooting

**Q: Bot crashes on startup**
- Check `/data/ts3audiobot.log` for errors
- Verify TeamSpeak server is accessible
- Confirm bot account exists and password is correct

**Q: No audio output**
- Verify audio plugin is enabled in config
- Check TeamSpeak permissions for bot user
- Verify channel audio settings

**Q: Web interface not accessible**
- Check port binding: `docker port ts3audiobot`
- Verify firewall allows port 58913
- Check logs for binding errors

**Q: Permission denied errors**
- Verify volume permissions (should be owned by UID 9999)
- Check that config files are readable by unprivileged user

For more help, see README.md or visit upstream documentation.

---

## Configuration Best Practices

1. **Backup before changes**: Always backup `ts3audiobot.toml` before editing
2. **Validate on test instance**: Test config changes on staging bot first
3. **Secure credentials**: Treat `identity` and `password` as secrets
4. **Regular backups**: Backup `/data/` directory weekly
5. **Monitor logs**: Set up log aggregation for compliance
6. **Documentation**: Document any custom plugins or changes

## Upstream Documentation

For complete TS3AudioBot options, see:
- [TS3AudioBot GitHub](https://github.com/TS3Audiobot/TS3Audiobot)
- [Official Wiki](https://github.com/TS3Audiobot/TS3Audiobot/wiki)
