-- The TeamSpeak address the panel last saved. The bot still keeps the real value.
-- Safe to run again.

ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS connect_address VARCHAR(200) NULL;
