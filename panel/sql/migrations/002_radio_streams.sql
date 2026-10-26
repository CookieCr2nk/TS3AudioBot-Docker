-- Radio stations live in the panel database, not in the bot files.
-- shared = 1 is the host catalog. shared_url keeps that catalog unique while private rows may repeat a URL.

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
