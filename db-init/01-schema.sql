-- TA-Flowmeter MySQL 8.0 Schema
-- Auto-run by Docker on first container start.
-- For manual VPS setup: mysql -u <user> -p <db> < db-init/01-schema.sql

<<<<<<< HEAD
-- -----------------------------------------
-- 1. RESIDENTS
--    Google OAuth allowlist managed by admin.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS residents (
  email      VARCHAR(255) PRIMARY KEY,
  google_id  VARCHAR(255) UNIQUE,
  name       VARCHAR(255),
  picture    TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
=======
-- 2. Users
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
);

-- -----------------------------------------
-- 2. UNITS
--    One row per apartment unit.
--    Balance is denormalized here (fast read, no join on every dashboard load).
--    Tariffs stored per-unit so billing is atomic even if global tariff changes.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS units (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  unit_no              VARCHAR(50)    NOT NULL UNIQUE,
  device_id            VARCHAR(100)   NOT NULL UNIQUE,
  resident_email       VARCHAR(255)   NULL,
  balance              DECIMAL(15,2)  NOT NULL DEFAULT 0,
  relay_status         TINYINT(1)     NOT NULL DEFAULT 1,
  last_energy_reading  DECIMAL(15,4)  NOT NULL DEFAULT 0,
  last_water_reading   DECIMAL(15,4)  NOT NULL DEFAULT 0,
  energy_tariff        DECIMAL(10,2)  NOT NULL DEFAULT 1444.70,
  water_tariff         DECIMAL(10,2)  NOT NULL DEFAULT 5000.00,
  created_at           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_units_resident FOREIGN KEY (resident_email) REFERENCES residents(email)
);

-- -----------------------------------------
-- 3. METER READINGS (time-series telemetry)
--    Composite PK on (time, device_id).
--    Index on (device_id, time DESC) covers every dashboard query pattern.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS meter_readings (
  time         DATETIME      NOT NULL,
  device_id    VARCHAR(100)  NOT NULL,
  voltage      DECIMAL(10,4) NULL,
  current      DECIMAL(10,4) NULL,
  power        DECIMAL(10,4) NULL,
  energy_total DECIMAL(15,4) NULL,
  water_flow   DECIMAL(10,4) NULL,
  water_total  DECIMAL(15,4) NULL,
  PRIMARY KEY (time, device_id)
);

CREATE INDEX idx_meter_readings_device_time ON meter_readings (device_id, time DESC);

-- -----------------------------------------
-- 4. TRANSACTIONS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                VARCHAR(100)                       PRIMARY KEY,
  unit_id           INT                                NOT NULL,
  unit_no           VARCHAR(50)                        NOT NULL,
  amount_rp         DECIMAL(12,2)                      NOT NULL,
  method            ENUM('qris','transfer','ewallet')  NOT NULL,
  status            ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  gateway_reference VARCHAR(100)                       NULL,
  webhook_event_id  VARCHAR(255)                       NULL UNIQUE,
  created_at        DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at      DATETIME                           NULL,
  CONSTRAINT fk_transactions_unit FOREIGN KEY (unit_id) REFERENCES units(id)
);

<<<<<<< HEAD
CREATE INDEX idx_transactions_unit_id ON transactions (unit_id, created_at DESC);
CREATE INDEX idx_transactions_status  ON transactions (status);

-- -----------------------------------------
-- 5. TARIFFS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS tariffs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  utility_type   ENUM('electricity','water') NOT NULL,
  price_per_unit DECIMAL(10,4)               NOT NULL,
  effective_date DATE                        NOT NULL,
  created_at     DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP
=======
-- 6. Transactions (token purchases)
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    device_id VARCHAR(50) REFERENCES devices(device_id),
    amount_rp NUMERIC(12,2),
    amount_utility NUMERIC(12,3),
    token_code VARCHAR(100),
    utility_type VARCHAR(20),
    status VARCHAR(20),
    transaction_date TIMESTAMP DEFAULT NOW()
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
);

CREATE INDEX idx_tariffs_type_date ON tariffs (utility_type, effective_date DESC);

-- -----------------------------------------
-- 6. AUTH REFRESH TOKENS
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  user_sub   VARCHAR(255) NOT NULL,
  unit_no    VARCHAR(50)  NULL,
  unit_id    INT          NULL,
  expires_at DATETIME     NOT NULL,
  revoked_at DATETIME     NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user_sub   ON auth_refresh_tokens (user_sub);
CREATE INDEX idx_refresh_tokens_expires_at ON auth_refresh_tokens (expires_at);

-- -----------------------------------------
-- 7. DATA RETENTION
--    Keeps 1 year of telemetry, runs daily.
-- -----------------------------------------
SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS cleanup_old_meter_readings
  ON SCHEDULE EVERY 1 DAY
  STARTS CURRENT_TIMESTAMP
  DO DELETE FROM meter_readings WHERE time < NOW() - INTERVAL 1 YEAR;

<<<<<<< HEAD
-- Seed data lives in db-init/02-seed-demo.sql.
=======
    volume_total_m3 DOUBLE PRECISION,
    debit_lpm DOUBLE PRECISION,

    status_relay BOOLEAN,
    status_valve BOOLEAN
);

-- Convert to hypertable:
SELECT create_hypertable('telemetry_logs', 'time');

-- 9. Add retention policy
SELECT add_retention_policy('telemetry_logs', INTERVAL '1 year');

-- 10. Add compression
ALTER TABLE telemetry_logs SET (timescaledb.compress);
SELECT add_compression_policy('telemetry_logs', INTERVAL '7 days');

-- 11. Optional indexes (important)
CREATE INDEX idx_device_time ON telemetry_logs(device_id, time DESC);

-- 12. Auth Refresh Tokens
CREATE TABLE auth_refresh_tokens (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    user_sub UUID REFERENCES users(user_id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
>>>>>>> 7ae7a09e48eaba6750b960ee454a9b481f43c4d6
