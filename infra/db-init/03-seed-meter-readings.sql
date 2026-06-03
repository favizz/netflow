-- TA-Flowmeter Meter Readings Seed  (May–July 2026)
-- Covers 2026-05-01 00:00 → 2026-07-03 23:00  (64 days = 1 536 hourly rows per device)
-- Run AFTER 01-schema.sql and 02-seed-demo.sql.
--
-- DEV-A-101  Tower A, unit A-101  — occupied family unit
--   Characteristics:
--     Morning peak  06–09h  : shower + cooking  → power 800–1 500 W, water 3–6 L/min
--     Daytime       09–17h  : AC + appliances   → power 300–700 W, water occasional
--     Evening peak  17–22h  : cooking + shower  → power 1 000–1 800 W, water 2–5 L/min
--     Night         22–06h  : standby           → power 80–150 W, water 0
--
-- DEV-A-302  Tower A, unit A-302  — vacant unit, SLOW WATER LEAK
--   Characteristics:
--     Power always minimal  (device sensor only) 5–40 W
--     Water flow CONSTANT   0.3–0.7 L/min  (drip-type leak, triggers water_leak anomaly)
--     No human activity pattern

USE `srusun-ta252601002`;

-- ─────────────────────────────────────────────────────────────────────────────
-- Flush only these two devices so other seed data is not disturbed
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM meter_readings WHERE device_id IN ('DEV-A-101', 'DEV-A-302');

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: generate integers 0–1 535  (2 × 10 × 10 × 8 = 1 600 rows, trimmed)
-- ─────────────────────────────────────────────────────────────────────────────
-- seq CTE used twice below

-- ─────────────────────────────────────────────────────────────────────────────
-- DEV-A-101
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO meter_readings
  (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)            AS `time`,
  'DEV-A-101',
  -- Voltage: 218–222 V with small noise
  ROUND(219 + (RAND() - 0.5) * 4, 2),
  -- Current (A) derived from load tier
  ROUND(CASE
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN  6 AND  8 THEN 3.5 + RAND() * 3.0
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN 17 AND 21 THEN 4.5 + RAND() * 3.5
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN  9 AND 16 THEN 1.4 + RAND() * 2.0
    ELSE 0.35 + RAND() * 0.5
  END, 3),
  -- Power (W)
  ROUND(CASE
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN  6 AND  8 THEN 780  + RAND() * 720
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN 17 AND 21 THEN 1000 + RAND() * 800
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN  9 AND 16 THEN 290  + RAND() * 420
    ELSE 78 + RAND() * 72
  END, 1),
  -- Energy total (kWh) — cumulative starting ~5 000, rising ~0.62 kWh/hr average
  ROUND(5000.0
    + n * 0.62
    + CASE
        WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN  6 AND  8 THEN RAND() * 0.50
        WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN 17 AND 21 THEN RAND() * 0.55
        WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN  9 AND 16 THEN RAND() * 0.28
        ELSE RAND() * 0.05
      END
  , 4),
  -- Water flow (L/min)
  ROUND(CASE
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN  6 AND  8 THEN 3.0 + RAND() * 3.0
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN 17 AND 20 THEN 2.0 + RAND() * 3.0
    WHEN HOUR(DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)) BETWEEN 11 AND 13 THEN 0.5 + RAND() * 1.5
    ELSE 0
  END, 4),
  -- Water total (m³) — cumulative starting ~350, rising ~0.012 m³/hr
  ROUND(350.0 + n * 0.012 + RAND() * 0.004, 4)
FROM (
  SELECT a.i * 1000 + b.i * 100 + c.i * 10 + d.i AS n
  FROM
    (SELECT 0 AS i UNION ALL SELECT 1) a
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                UNION ALL SELECT 8 UNION ALL SELECT 9) b
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                UNION ALL SELECT 8 UNION ALL SELECT 9) c
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                UNION ALL SELECT 8 UNION ALL SELECT 9) d
  WHERE a.i * 1000 + b.i * 100 + c.i * 10 + d.i <= 1535
) seq;

-- ─────────────────────────────────────────────────────────────────────────────
-- DEV-A-302  (vacant + slow water leak)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO meter_readings
  (time, device_id, voltage, current, power, energy_total, water_flow, water_total)
SELECT
  DATE_ADD('2026-05-01 00:00:00', INTERVAL n HOUR)            AS `time`,
  'DEV-A-302',
  -- Voltage: same grid, 219–222 V
  ROUND(220 + (RAND() - 0.5) * 3, 2),
  -- Current: very low (idle sensors only)
  ROUND(0.05 + RAND() * 0.12, 3),
  -- Power: 5–40 W (device + minimal phantom load)
  ROUND(8 + RAND() * 32, 1),
  -- Energy total (kWh) — almost flat, starts 200, rises ~0.018 kWh/hr
  ROUND(200.0 + n * 0.018 + RAND() * 0.003, 4),
  -- Water flow (L/min) — CONSTANT SLOW DRIP: 0.30–0.65 L/min
  -- Coefficient of variation will be < 0.2, triggering water_leak anomaly
  ROUND(0.30 + RAND() * 0.35, 4),
  -- Water total (m³) — rising steadily from leak: ~0.024 m³/hr
  ROUND(50.0 + n * 0.024 + RAND() * 0.003, 4)
FROM (
  SELECT a.i * 1000 + b.i * 100 + c.i * 10 + d.i AS n
  FROM
    (SELECT 0 AS i UNION ALL SELECT 1) a
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                UNION ALL SELECT 8 UNION ALL SELECT 9) b
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                UNION ALL SELECT 8 UNION ALL SELECT 9) c
    CROSS JOIN (SELECT 0 AS i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
                UNION ALL SELECT 8 UNION ALL SELECT 9) d
  WHERE a.i * 1000 + b.i * 100 + c.i * 10 + d.i <= 1535
) seq;
