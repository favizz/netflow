const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// 1. Baca konfigurasi dari .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envConfig = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#\s]+?)=(.+)/);
  if (match) {
    envConfig[match[1]] = match[2].trim();
  }
});

const DB_HOST = envConfig.DB_HOST || 'localhost';
const DB_PORT = parseInt(envConfig.DB_PORT || '3306', 10);
const DB_USER = envConfig.DB_USER || 'root';
const DB_PASS = envConfig.DB_PASS || '';
const DB_NAME = envConfig.DB_NAME || 'srusun-ta252601002';
const TOTAL_UNITS = 2444;

async function seedUnits() {
  console.log(`Menghubungkan ke database ${DB_NAME} di ${DB_HOST}...`);
  
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
  });

  console.log('Koneksi berhasil. Mulai generate 2444 unit...');

  // Kita gunakan batch insert agar cepat.
  const batchSize = 500;
  let insertedCount = 0;

  for (let i = 0; i < TOTAL_UNITS; i += batchSize) {
    const end = Math.min(i + batchSize, TOTAL_UNITS);
    const values = [];

    for (let j = i + 1; j <= end; j++) {
      const unitNo = `A-${String(j).padStart(4, '0')}`;
      const deviceId = `SMART-METER-${String(j).padStart(4, '0')}`;
      // Berikan saldo awal (misal 100.000) agar tidak langsung terputus saat disimulasikan
      const balance = 100000; 
      
      // building_id = 1, unit_no, device_id, balance, relay_status=1, valve_status=1
      values.push(`(1, '${unitNo}', '${deviceId}', ${balance}, 1, 1, 0, 0, NOW())`);
    }

    const query = `
      INSERT IGNORE INTO units 
      (building_id, unit_no, device_id, balance, relay_status, valve_status, last_energy_reading, last_water_reading, created_at) 
      VALUES ${values.join(',')}
    `;

    const [result] = await connection.query(query);
    insertedCount += result.affectedRows;
    console.log(`Batch tersimpan: ${end}/${TOTAL_UNITS} unit.`);
  }

  console.log(`\n✅ Selesai! Sebanyak ${insertedCount} unit berhasil ditambahkan ke tabel 'units'.`);
  console.log(`(Note: Jika unit sudah ada sebelumnya, ia dilewati karena IGNORE).`);
  
  await connection.end();
}

seedUnits().catch(err => {
  console.error('Terjadi kesalahan:', err);
  process.exit(1);
});
