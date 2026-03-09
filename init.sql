-- 1. Enable Timescale extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. Users
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Properties (physical locations)
CREATE TABLE properties (
    unit_id VARCHAR(10) PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    location_floor VARCHAR(20),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Devices
CREATE TABLE devices (
    device_id VARCHAR(50) PRIMARY KEY,
    unit_id VARCHAR(10) REFERENCES properties(unit_id),
    serial_number VARCHAR(100) UNIQUE,
    installation_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    relay_status BOOLEAN,
    valve_status BOOLEAN
);

-- 5. Current balance (fast lookup)
CREATE TABLE current_balance (
    device_id VARCHAR(50) PRIMARY KEY REFERENCES devices(device_id),
    current_kwh NUMERIC(12,3),
    current_m3 NUMERIC(12,3),
    last_updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Transactions (token purchases)
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    device_id VARCHAR(50) REFERENCES devices(device_id),
    amount_rp NUMERIC(12,2),
    amount_utility NUMERIC(12,3),
    token_code VARCHAR(100),
    utility_type VARCHAR(20),
    status VARCHAR(20),
    transaction_date TIMESTAMP DEFAULT NOW()
);

-- 7. Utility tariff
CREATE TABLE utility_tariff (
    tariff_id SERIAL PRIMARY KEY,
    utility_type VARCHAR(20),
    price_per_unit NUMERIC(10,4),
    effective_date DATE
);

-- 8. IoT telemetry logs (Timescale hypertable)
CREATE TABLE telemetry_logs (
    time TIMESTAMPTZ NOT NULL,
    device_id VARCHAR(50) REFERENCES devices(device_id),
    utility_type VARCHAR(20),

    energy_total_kwh DOUBLE PRECISION,
    day_kwh DOUBLE PRECISION,
    tegangan_v DOUBLE PRECISION,
    arus_a DOUBLE PRECISION,
    frekuensi_hz DOUBLE PRECISION,
    power_factor DOUBLE PRECISION,

    token_kwh DOUBLE PRECISION,
    token_m3 DOUBLE PRECISION,

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
