-- One Docker container is one instance. Several TeamSpeak bots live on that instance.
-- Old bot rows are copied here. bots and bot_grants stay until 004 so a restart
-- in the middle of this file can copy again. Each statement is safe to run twice.
-- The audit bot id used to point at bots. It is moved to instance_id, then cleared,
-- because bot_id will refer to ts_bots.

ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  base_url VARCHAR(255) NOT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  api_user VARCHAR(128) NULL,
  api_token_enc TEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_instances_owner (owner_user_id),
  CONSTRAINT fk_instances_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ts_bots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  instance_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ts_bots_instance_name (instance_id, name),
  CONSTRAINT fk_ts_bots_instance FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS instance_grants (
  instance_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  can_control TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (instance_id, user_id),
  CONSTRAINT fk_igrant_instance FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE,
  CONSTRAINT fk_igrant_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO instances (id, name, base_url, api_user, api_token_enc, enabled, notes, created_at, updated_at)
SELECT b.id, b.name, b.base_url, b.api_user, b.api_token_enc, b.enabled, b.notes, b.created_at, b.updated_at
FROM bots b
WHERE NOT EXISTS (SELECT 1 FROM instances i WHERE i.id = b.id);

INSERT INTO ts_bots (instance_id, name)
SELECT b.id,
       CASE
         WHEN b.instance_mode = 'none' OR b.instance_ref IS NULL OR b.instance_ref = '' THEN 'default'
         ELSE LEFT(b.instance_ref, 64)
       END
FROM bots b
WHERE NOT EXISTS (
  SELECT 1 FROM ts_bots t
  WHERE t.instance_id = b.id
    AND t.name = CASE
      WHEN b.instance_mode = 'none' OR b.instance_ref IS NULL OR b.instance_ref = '' THEN 'default'
      ELSE LEFT(b.instance_ref, 64)
    END
);

INSERT INTO instance_grants (instance_id, user_id, can_control, created_at)
SELECT g.bot_id, g.user_id, g.can_control, g.created_at
FROM bot_grants g
WHERE NOT EXISTS (
  SELECT 1 FROM instance_grants i
  WHERE i.instance_id = g.bot_id AND i.user_id = g.user_id
);

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS instance_id BIGINT UNSIGNED NULL;

UPDATE audit_log
SET instance_id = bot_id
WHERE instance_id IS NULL
  AND bot_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'audit_log'
      AND CONSTRAINT_NAME = 'fk_audit_bot'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  );

UPDATE audit_log
SET bot_id = NULL
WHERE EXISTS (
  SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_log'
    AND CONSTRAINT_NAME = 'fk_audit_bot'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  );

ALTER TABLE audit_log DROP FOREIGN KEY IF EXISTS fk_audit_bot;

ALTER TABLE audit_log ADD CONSTRAINT fk_audit_instance
  FOREIGN KEY IF NOT EXISTS (instance_id) REFERENCES instances (id) ON DELETE SET NULL;

ALTER TABLE audit_log ADD CONSTRAINT fk_audit_ts_bot
  FOREIGN KEY IF NOT EXISTS (bot_id) REFERENCES ts_bots (id) ON DELETE SET NULL;
