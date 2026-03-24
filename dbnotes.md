Below is the relational schema using MySQL 8.0. Migrated from PostgreSQL + TimescaleDB; TimescaleDB-specific features (hypertables, compression, retention policies) are replaced with MySQL equivalents.

The design has three logical layers:

Operational tables (residents, units, devices)

Financial tables (transactions, tariffs, balances)

Telemetry table (IoT sensor readings)

1. Residents
CREATE TABLE residents (
    email       VARCHAR(255) PRIMARY KEY,
    google_id   VARCHAR(255) UNIQUE,
    name        VARCHAR(255),
    picture     TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

2. Units (physical locations)
CREATE TABLE units (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    unit_no             VARCHAR(255) NOT NULL,
    device_id           VARCHAR(255) NOT NULL UNIQUE,
    balance             DECIMAL(15,2) NOT NULL DEFAULT 0,
    relay_status        TINYINT(1) NOT NULL DEFAULT 1,
    last_energy_reading DECIMAL(15,4) NOT NULL DEFAULT 0,
    energy_tariff       DECIMAL(10,2) NOT NULL DEFAULT 1444.70,
    resident_email      VARCHAR(255) NULL,
    CONSTRAINT fk_units_resident FOREIGN KEY (resident_email) REFERENCES residents(email)
);

Relationship:

Resident 1 ─── N Units

3. Meter readings (IoT telemetry)

Replaces TimescaleDB hypertable. Composite primary key on (time, device_id).

CREATE TABLE meter_readings (
    time         DATETIME NOT NULL,
    device_id    VARCHAR(255) NOT NULL,
    voltage      DECIMAL(10,4) NULL,
    current      DECIMAL(10,4) NULL,
    power        DECIMAL(10,4) NULL,
    water_flow   DECIMAL(10,4) NULL,
    energy_total DECIMAL(10,4) NULL,
    PRIMARY KEY (time, device_id)
);

CREATE INDEX idx_meter_readings_device_time ON meter_readings (device_id, time DESC);

This index covers all dashboard queries:
- Latest reading per device: WHERE device_id = ? ORDER BY time DESC LIMIT 1
- Billing range query: WHERE device_id = ? AND time BETWEEN ? AND ?

4. Auth refresh tokens
CREATE TABLE auth_refresh_tokens (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    token_hash   VARCHAR(255) NOT NULL UNIQUE,
    user_sub     VARCHAR(255) NOT NULL,   -- resident email
    unit_no      VARCHAR(32) NULL,
    unit_id      INT NULL,
    expires_at   DATETIME NOT NULL,
    revoked_at   DATETIME NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_refresh_tokens_user_sub ON auth_refresh_tokens (user_sub);
CREATE INDEX idx_auth_refresh_tokens_expires_at ON auth_refresh_tokens (expires_at);

5. Data retention (replaces TimescaleDB retention policy)

Run this once to enable the MySQL Event Scheduler, then create a daily cleanup job:

SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS cleanup_old_meter_readings
ON SCHEDULE EVERY 1 DAY
DO
  DELETE FROM meter_readings WHERE time < NOW() - INTERVAL 1 YEAR;

6. Relationship diagram
residents
    │
    └── units
            │
            └── meter_readings (via device_id)
            └── auth_refresh_tokens (via resident_email → user_sub)

7. Why this schema works at single-building scale

MySQL 8.0 with proper composite indexes handles millions of rows without partitioning.
No TimescaleDB, no InfluxDB, no Redis — single engine, simpler backups, easier client handoff.
The composite index (device_id, time DESC) is the dominant access path for all telemetry queries.
