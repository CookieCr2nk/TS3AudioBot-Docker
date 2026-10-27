-- Panel display name. The template name stays in ts_bots.name.
-- Safe to run again.

ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS label VARCHAR(120) NULL;
