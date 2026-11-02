-- Panel schema.
-- Applied migrations are recorded in schema_migrations. Do not edit a file after it has been applied.
-- The next change is a new file with the next number, for example panel/sql/migrations/002_name.sql.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  suspended TINYINT(1) NOT NULL DEFAULT 0,
  bot_limit INT UNSIGNED NULL,
  can_create_bots TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  csrf_token CHAR(64) NOT NULL,
  flash_type VARCHAR(16) NULL,
  flash_message VARCHAR(500) NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  assignee_user_id BIGINT UNSIGNED NULL,
  label VARCHAR(120) NULL,
  template VARCHAR(64) NULL,
  connect_nickname VARCHAR(30) NULL,
  connect_channel VARCHAR(200) NULL,
  connect_bitrate SMALLINT NULL,
  connect_volume SMALLINT NULL,
  connect_run TINYINT NULL,
  connect_startup VARCHAR(500) NULL,
  connect_server_password TINYINT NOT NULL DEFAULT 0,
  connect_channel_password TINYINT NOT NULL DEFAULT 0,
  connect_address VARCHAR(200) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ts_bots_instance_template (instance_id, template),
  KEY idx_ts_bots_instance (instance_id),
  CONSTRAINT fk_ts_bots_instance FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE,
  CONSTRAINT fk_ts_bots_assignee FOREIGN KEY (assignee_user_id) REFERENCES users (id) ON DELETE SET NULL
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

CREATE TABLE IF NOT EXISTS radio_streams (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  url VARCHAR(500) NOT NULL,
  notes VARCHAR(500) NULL,
  shared TINYINT(1) NOT NULL DEFAULT 0,
  owner_user_id BIGINT UNSIGNED NULL,
  shared_url VARCHAR(500) GENERATED ALWAYS AS (IF(shared = 1, url, NULL)) STORED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_radio_owner_url (owner_user_id, url),
  UNIQUE KEY uq_radio_shared_url (shared_url),
  KEY idx_radio_name (name),
  CONSTRAINT fk_radio_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  bot_id BIGINT UNSIGNED NULL,
  instance_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  detail VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_instance FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_ts_bot FOREIGN KEY (bot_id) REFERENCES ts_bots (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
