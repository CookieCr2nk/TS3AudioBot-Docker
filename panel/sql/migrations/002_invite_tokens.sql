-- Invite tokens. An administrator creates a token and a person registers one user account with it.
-- Only the SHA-256 hash of the token is stored. The plain token is shown once when it is created.
-- invite_token_instances lists the instances the new account is assigned to.

CREATE TABLE IF NOT EXISTS invite_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL,
  label VARCHAR(120) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NULL,
  max_uses INT UNSIGNED NOT NULL DEFAULT 1,
  use_count INT UNSIGNED NOT NULL DEFAULT 0,
  revoked_at DATETIME(3) NULL,
  can_create_bots TINYINT(1) NOT NULL DEFAULT 0,
  bot_limit INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invite_tokens_hash (token_hash),
  KEY idx_invite_tokens_creator (created_by_user_id),
  CONSTRAINT chk_invite_tokens_max_uses CHECK (max_uses >= 1),
  CONSTRAINT fk_invite_tokens_creator FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invite_token_instances (
  token_id BIGINT UNSIGNED NOT NULL,
  instance_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (token_id, instance_id),
  KEY idx_invite_token_instances_instance (instance_id),
  CONSTRAINT fk_invite_inst_token FOREIGN KEY (token_id) REFERENCES invite_tokens (id) ON DELETE CASCADE,
  CONSTRAINT fk_invite_inst_instance FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
