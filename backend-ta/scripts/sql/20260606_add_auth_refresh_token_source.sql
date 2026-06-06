-- Add source column for separating mobile and admin refresh-token sessions.
-- Required by AuthRefreshToken.source and AuthService.issueTokenPair().

DROP PROCEDURE IF EXISTS _add_auth_refresh_token_source;
DELIMITER //
CREATE PROCEDURE _add_auth_refresh_token_source()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'auth_refresh_tokens'
      AND COLUMN_NAME = 'source'
  ) THEN
    ALTER TABLE auth_refresh_tokens
      ADD COLUMN source ENUM('mobile','admin') NOT NULL DEFAULT 'mobile'
      AFTER user_sub;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'auth_refresh_tokens'
      AND INDEX_NAME = 'idx_auth_refresh_tokens_user_source'
  ) THEN
    CREATE INDEX idx_auth_refresh_tokens_user_source
      ON auth_refresh_tokens (user_sub, source);
  END IF;
END //
DELIMITER ;

CALL _add_auth_refresh_token_source();
DROP PROCEDURE IF EXISTS _add_auth_refresh_token_source;
