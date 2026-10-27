-- The TeamSpeak bot template is a UUID. The panel name may repeat.
-- Safe to run again.

ALTER TABLE ts_bots ADD COLUMN IF NOT EXISTS template VARCHAR(64) NULL;

UPDATE ts_bots SET template = name WHERE template IS NULL OR template = '';

UPDATE ts_bots SET name = label WHERE label IS NOT NULL AND label <> '';

ALTER TABLE ts_bots DROP INDEX IF EXISTS uq_ts_bots_instance_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ts_bots_instance_template ON ts_bots (instance_id, template);
