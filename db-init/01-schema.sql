-- TA-Flowmeter MySQL 8.0 Schema
-- Auto-run by Docker on first container start.
-- For manual VPS setup: mysql -u <user> -p < db-init/01-schema.sql

CREATE DATABASE IF NOT EXISTS ta_db;
USE ta_db;

-- -----------------------------------------
-- 1. RESIDENTS
--    Google OAuth allowlist managed by admin.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS residents (
  email      VARCHAR(255) PRIMARY KEY,
  google_id  VARCHAR(255) UNIQUE,
  name       VARCHAR(255),
  picture    TEXT,
  role       ENUM('resident','admin') NOT NULL DEFAULT 'resident',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------
-- 2. UNITS
--    One row per apartment unit.
--    Balance is denormalized here (fast read, no join on every dashboard load).
--    Tariffs are stored in the tariffs table (global configuration, not per-unit).
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS units (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  unit_no              VARCHAR(50)    NOT NULL UNIQUE,
  device_id            VARCHAR(100)   NOT NULL UNIQUE,
  resident_email       VARCHAR(255)   NULL,
  balance              DECIMAL(15,2)  NOT NULL DEFAULT 0,
  relay_status         TINYINT(1)     NOT NULL DEFAULT 1,
  valve_status         TINYINT(1)     NOT NULL DEFAULT 1,
  last_energy_reading  DECIMAL(15,4)  NOT NULL DEFAULT 0,
  last_water_reading   DECIMAL(15,4)  NOT NULL DEFAULT 0,
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
  PRIMARY KEY (time, device_id),
  CONSTRAINT fk_meter_readings_device FOREIGN KEY (device_id) REFERENCES units(device_id) ON DELETE CASCADE
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

CREATE INDEX idx_transactions_unit_id ON transactions (unit_id, created_at DESC);
CREATE INDEX idx_transactions_status  ON transactions (status);

-- -----------------------------------------
-- 5. TARIFFS
--    Global rate configuration — no FK to units.
--    Billing uses the latest tariff row effective on the current date.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS tariffs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  utility_type   ENUM('electricity','water') NOT NULL,
  price_per_unit DECIMAL(10,4)               NOT NULL,
  effective_date DATE                        NOT NULL,
  created_at     DATETIME                    NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_sub) REFERENCES residents(email) ON DELETE CASCADE,
  CONSTRAINT fk_refresh_tokens_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
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

-- -----------------------------------------
-- 8. ANOMALIES
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS anomalies (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  device_id    VARCHAR(100) NOT NULL,
  type         VARCHAR(50)  NOT NULL,
  severity     VARCHAR(20)  NOT NULL,
  description  TEXT         NOT NULL,
  action_taken TEXT         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at  DATETIME     NULL,
  CONSTRAINT fk_anomalies_device FOREIGN KEY (device_id) REFERENCES units(device_id) ON DELETE CASCADE
);

CREATE INDEX idx_anomalies_device_time ON anomalies (device_id, created_at DESC);

-- -----------------------------------------
-- 9. AUDIT LOGS
--    Every admin CRUD action is recorded here.
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  admin_email VARCHAR(255) NOT NULL,
  action      VARCHAR(50)  NOT NULL,
  entity      VARCHAR(100) NOT NULL,
  entity_id   VARCHAR(255) NULL,
  details     TEXT         NULL,
  result      VARCHAR(20)  NOT NULL DEFAULT 'success',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_admin ON audit_logs (admin_email, created_at DESC);
CREATE INDEX idx_audit_logs_time  ON audit_logs (created_at DESC);

-- -----------------------------------------
-- 10. LEGEND / LOOKUP TABLES
-- -----------------------------------------

CREATE TABLE IF NOT EXISTS legend_switch_status (
  code        TINYINT(1) PRIMARY KEY,
  label       VARCHAR(20)  NOT NULL,
  description VARCHAR(100) NOT NULL
);
INSERT IGNORE INTO legend_switch_status VALUES
  (0, 'OFF/CLOSE', 'Device is powered off or valve is closed'),
  (1, 'ON/OPEN',   'Device is powered on or valve is open');

CREATE TABLE IF NOT EXISTS legend_anomaly_severity (
  code        VARCHAR(20) PRIMARY KEY,
  label       VARCHAR(40) NOT NULL,
  description VARCHAR(150) NOT NULL
);
INSERT IGNORE INTO legend_anomaly_severity VALUES
  ('critical', 'Critical', 'Immediate action required — service may be offline'),
  ('warning',  'Warning',  'Attention recommended — early signs of a problem');

CREATE TABLE IF NOT EXISTS legend_anomaly_type (
  code        VARCHAR(50) PRIMARY KEY,
  label       VARCHAR(80)  NOT NULL,
  description VARCHAR(200) NOT NULL
);
INSERT IGNORE INTO legend_anomaly_type VALUES
  ('jailbreak',          'Jailbreak Detected',    'Tamper event — meter cover opened without authorisation'),
  ('water_leak',         'Water Leak',             'Sustained flow detected while valve is commanded closed'),
  ('device_offline',     'Device Offline',         'No telemetry received within the expected heartbeat window'),
  ('mcb_trip',           'MCB Trip',               'Circuit breaker tripped — power cut detected'),
  ('low_balance',        'Low Balance',            'Remaining credit is below the threshold for normal operation'),
  ('voltage_anomaly',    'Voltage Anomaly',        'Measured voltage outside +/- 10% of 220 V nominal'),
  ('sensor_malfunction', 'Sensor Malfunction',     'Sensor returning implausible or missing readings'),
  ('low_power_factor',   'Low Power Factor',       'Power factor below 0.7 — inefficient load detected'),
  ('zero_flow',          'Zero Flow',              'Meter reports zero flow while valve is open'),
  ('usage_spike',        'Usage Spike',            'Consumption jumped beyond normal variance'),
  ('backflow',           'Backflow',               'Reverse water flow detected — possible contamination risk');

CREATE TABLE IF NOT EXISTS legend_payment_method (
  code        VARCHAR(20) PRIMARY KEY,
  label       VARCHAR(40)  NOT NULL,
  description VARCHAR(150) NOT NULL
);
INSERT IGNORE INTO legend_payment_method VALUES
  ('qris',     'QRIS',          'Scan-to-pay via any QRIS-enabled e-wallet'),
  ('transfer', 'Bank Transfer', 'Manual inter-bank transfer'),
  ('ewallet',  'E-Wallet',      'Direct payment via e-wallet (e.g. GoPay, OVO)');

CREATE TABLE IF NOT EXISTS legend_transaction_status (
  code        VARCHAR(20) PRIMARY KEY,
  label       VARCHAR(40)  NOT NULL,
  description VARCHAR(150) NOT NULL
);
INSERT IGNORE INTO legend_transaction_status VALUES
  ('pending', 'Pending', 'Payment initiated but not yet confirmed by gateway'),
  ('success', 'Success', 'Payment confirmed and balance credited to unit'),
  ('failed',  'Failed',  'Payment rejected or timed out by the payment gateway');

-- Seed data lives in db-init/02-seed-demo.sql.
