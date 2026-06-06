CREATE TABLE IF NOT EXISTS topup_deliveries (
  id INT NOT NULL AUTO_INCREMENT,
  transaction_id VARCHAR(100) NOT NULL,
  unit_no VARCHAR(50) NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  electricity_amount_rp DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  water_amount_rp DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending','sent','acked','confirmed','failed') NOT NULL DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  command_timestamp INT NULL,
  payload_json JSON NULL,
  ack_json JSON NULL,
  last_error VARCHAR(255) NULL,
  sent_at DATETIME NULL,
  acked_at DATETIME NULL,
  confirmed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_topup_deliveries_transaction_id (transaction_id),
  KEY idx_topup_deliveries_device_status (device_id, status),
  CONSTRAINT fk_topup_deliveries_transaction
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
