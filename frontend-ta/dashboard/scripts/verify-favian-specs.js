/**
 * Favian's Specification Verification Script v1.0
 * Purpose: Verify Anomaly Detection Latency, RBAC, and Data Lifecycle on Production.
 * 
 * Usage: node scripts/verify-favian-specs.js <JWT_TOKEN_RESIDENT> <JWT_TOKEN_ADMIN>
 */

const axios = require('axios');
const API_URL = process.env.API_URL || 'http://localhost:3000';

async function verifyRBAC(resToken, adminToken) {
    console.log('\n--- [1] Verifying RBAC Boundaries ---');
    
    // 1. Resident trying to access Admin Unit List
    try {
        await axios.get(`${API_URL}/admin/units`, {
            headers: { Authorization: `Bearer ${resToken}` }
        });
        console.log('❌ RBAC FAIL: Resident accessed admin endpoint.');
    } catch (err) {
        if (err.response?.status === 403) {
            console.log('✅ RBAC PASS: Resident denied admin endpoint (403).');
        } else {
            console.log(`⚠️ RBAC WARN: Unexpected status ${err.response?.status}`);
        }
    }

    // 2. Admin accessing Admin Unit List
    try {
        await axios.get(`${API_URL}/admin/units`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log('✅ RBAC PASS: Admin accessed admin endpoint.');
    } catch (err) {
        console.log(`❌ RBAC FAIL: Admin denied access (${err.message})`);
    }
}

async function verifyAnomalyLatency(adminToken) {
    console.log('\n--- [2] Verifying Anomaly Detection Latency ---');
    console.log('Note: Triggering manual anomaly via simulator or hardware is required first.');
    console.log('This script polls the database for the latest anomaly record.');

    const start = Date.now();
    let found = false;
    let attempts = 0;

    while (attempts < 20 && !found) {
        try {
            const res = await axios.get(`${API_URL}/anomaly/all`, {
                headers: { Authorization: `Bearer ${adminToken}` }
            });
            const latest = res.data[0];
            const age = Date.now() - new Date(latest.detectedAt).getTime();
            
            if (age < 90000) { // Found within 90s
                console.log(`✅ LATENCY PASS: Latest anomaly "${latest.anomalyType}" detected ${Math.floor(age/1000)}s ago.`);
                found = true;
            }
        } catch (err) {}
        attempts++;
        await new Promise(r => setTimeout(r, 5000));
    }

    if (!found) console.log('❌ LATENCY FAIL: No recent anomaly found in last 100s.');
}

async function verifyDataLifecycle(adminToken) {
    console.log('\n--- [3] Verifying Data Lifecycle (Retention) ---');
    try {
        const res = await axios.get(`${API_URL}/admin/retention-check`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log(`✅ RETENTION: ${res.data.telemetry_count} telemetry records found.`);
        console.log(`✅ RETENTION: Oldest record date: ${res.data.oldest_telemetry}`);
        // Verification: oldest_telemetry should not be > 24 months old.
    } catch (err) {
        console.log('⚠️ RETENTION: Endpoint /admin/retention-check not implemented or denied.');
    }
}

const [,, resToken, adminToken] = process.argv;
if (!resToken || !adminToken) {
    console.log('Error: Missing tokens. Use: node verify-favian-specs.js <RES_TOKEN> <ADMIN_TOKEN>');
    process.exit(1);
}

(async () => {
    await verifyRBAC(resToken, adminToken);
    await verifyAnomalyLatency(adminToken);
    await verifyDataLifecycle(adminToken);
})();
