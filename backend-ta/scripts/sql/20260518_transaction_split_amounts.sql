-- Migration: add electricity_amount_rp and water_amount_rp to transactions
-- Run once on the live DB:
--   mysql -u <user> -p srusun-ta252601002 < scripts/sql/20260518_transaction_split_amounts.sql
--
-- These columns store the Rp split of each top-up so the webhook can
-- credit electricity and water tokens independently at their respective tariffs.

USE `srusun-ta252601002`;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS electricity_amount_rp DECIMAL(12,2) NOT NULL DEFAULT 0
    COMMENT 'Portion of amount_rp allocated to electricity tokens'
    AFTER amount_rp,
  ADD COLUMN IF NOT EXISTS water_amount_rp DECIMAL(12,2) NOT NULL DEFAULT 0
    COMMENT 'Portion of amount_rp allocated to water tokens'
    AFTER electricity_amount_rp;

-- Back-fill existing rows: treat full amount as electricity (legacy behaviour)
UPDATE transactions
SET electricity_amount_rp = amount_rp,
    water_amount_rp        = 0
WHERE electricity_amount_rp = 0 AND water_amount_rp = 0;
