-- Per-account cap on TeamSpeak bots. NULL means unlimited.
-- The count is the bots on instances that account owns.
-- Safe to run again.

ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_limit INT UNSIGNED NULL;
