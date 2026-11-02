-- Connection settings the panel shows again. Passwords stay on the bot.
-- Safe to run again.

ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_nickname VARCHAR(30) NULL;
ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_channel VARCHAR(200) NULL;
ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_bitrate SMALLINT NULL;
ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_volume SMALLINT NULL;
ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_run TINYINT NULL;
ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_startup VARCHAR(500) NULL;
ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_server_password TINYINT NOT NULL DEFAULT 0;
ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_channel_password TINYINT NOT NULL DEFAULT 0;
