-- Create table for persistent refresh-token rotation/revocation
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  user_sub VARCHAR(255) NOT NULL,
  unit_no VARCHAR(32) NULL,
  unit_id INT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_refresh_tokens_user_sub
  ON auth_refresh_tokens (user_sub);

CREATE INDEX idx_auth_refresh_tokens_expires_at
  ON auth_refresh_tokens (expires_at);
