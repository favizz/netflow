import { HelpCircle, ChevronDown, ChevronUp, Search } from "lucide-react";
import { useState, useMemo } from "react";

type FAQItem = {
    question: string;
    answer: string;
};

type FAQSection = {
    title: string;
    items: FAQItem[];
};

const FAQ_DATA: FAQSection[] = [
    {
        title: "Overview & Dashboard",
        items: [
            {
                question: "What does the Overview page show?",
                answer: "The Overview page displays three real-time stat cards: total units registered, how many are currently online, and units with low balance. It also shows a compact system health bar, recent audit log entries, and the consumption trend chart. Stats are refreshed every 30 seconds.",
            },
            {
                question: "How is 'online' status determined?",
                answer: "A unit is considered Online if its device has sent telemetry data within the last 5 minutes. The backend checks the latest entry in meter_readings for each device. If no reading exists or the last reading is older than 5 minutes, the unit is Offline.",
            },
            {
                question: "What is the System Health bar?",
                answer: "The System Health bar shows the status of each backend service (API, MQTT broker, database, payment gateway, etc.) as compact inline pills with a colored dot and a latency progress bar. It is refreshed once when you open the Overview page. No continuous polling is used.",
            },
            {
                question: "What do the consumption trend periods mean?",
                answer: "The chart supports three periods: Daily (last 7 days with no navigation), Monthly (navigate month by month), and Yearly (navigate year by year). Use the electricity/water toggle icons to switch utilities. Navigation arrows are only shown for Monthly and Yearly views.",
            },
        ],
    },
    {
        title: "Devices & Units",
        items: [
            {
                question: "How do I register a unit from scratch (full flow)?",
                answer: "Complete these steps in order:\n\n1. Buildings — Create a building if one does not exist yet (Buildings page → Add Building, set name and address).\n\n2. Users — Add the resident's email on the Users page so the account exists before you link it to the unit.\n\n3. Tariffs — Confirm at least one active electricity and one active water tariff exists (Tariffs page). The system needs a current tariff to calculate token deduction rates correctly.\n\n4. Devices — On the Devices page, click 'Add Unit'. Fill in: Building (select the one just created), Unit Number (e.g. A-101), Device ID (must match the DEVICE_ID flashed into the ESP32 firmware, e.g. DEV-A-101), initial electricity token balance (kWh), and initial water token balance (m³). Assign the resident account created in step 2.\n\n5. Physical device — Power on the ESP32. It will connect to the MQTT broker and begin publishing telemetry to device/DEV-A-101/data. The unit status will change from Offline to Online within one publish interval (default 60 s) once telemetry is received.\n\n6. Verify — Open the Unit Detail page for the new unit. You should see live sensor values in the Live tab and the token balances decreasing in real time when the relay and valve are open.",
            },
            {
                question: "How do I add a new unit?",
                answer: "On the Devices page, click 'Add Unit'. A single-page form opens where you search and select a building, enter the unit number and device ID, optionally set an initial balance, and assign the unit to a user (admin or resident). Assignment is required — you cannot add a unit without linking it to someone.",
            },
            {
                question: "How do I assign a resident to a unit?",
                answer: "Assignment is handled during unit creation via the 'Add Unit' form. Search by name or email in the 'Assign To' field and select the user. To reassign later, go to the Users page and use the assign icon on the user row.",
            },
            {
                question: "What do the relay and valve toggles do?",
                answer: "Relay controls the electricity circuit breaker. Valve controls the water supply valve. Both commands are sent via MQTT to the physical device and logged in the audit trail with the admin's email.",
            },
            {
                question: "How often does the device status refresh?",
                answer: "The Devices page polls the backend every 30 seconds to update online/offline status and relay states.",
            },
            {
                question: "What happens when I delete a unit?",
                answer: "Deleting a unit removes the unit record and all associated meter readings from the database. This action is permanent and cannot be undone.",
            },
        ],
    },
    {
        title: "Unit Detail & Live Telemetry",
        items: [
            {
                question: "How does live telemetry work?",
                answer: "The Unit Detail page connects directly to the EMQX MQTT broker via WebSocket and subscribes to device/{id}/telemetry. When the device publishes a reading, it appears instantly in the live metrics panel. No polling is needed.",
            },
            {
                question: "What format is the telemetry payload?",
                answer: "The backend and devices use a compact 25-byte binary frame. The dashboard decodes it as fixed-width binary (energy×100, power×10, voltage×10, current×1000, waterFlow×100, waterTotal×1000, electricity token kWh×1000, water token m³×1000, flags) with JSON fallback. This minimizes MQTT bandwidth.",
            },
            {
                question: "What do the charts on Unit Detail show?",
                answer: "The charts show historical energy (kWh) and water (m³) consumption over selectable time ranges. Data comes from the meter_readings table via the REST API.",
            },
        ],
    },
    {
        title: "Payments & Transactions",
        items: [
            {
                question: "How does the prepaid top-up work?",
                answer: "Residents purchase tokens via the mobile app. They enter separate amounts for electricity (Rp) and water (Rp), then pay through the payment gateway. On successful payment, the backend sends a single MQTT topup message to the device with the total credited amount. Balances are stored on the units table for fast reads.",
            },
            {
                question: "What happens when balance runs out?",
                answer: "When balance drops to zero, the system automatically turns off the relay (cutting electricity). The resident receives an email notification. They must top up to restore service.",
            },
            {
                question: "Where can I see all payment history?",
                answer: "The Transactions page lists all token purchases across all units, filterable by status and payment method.",
            },
        ],
    },
    {
        title: "Users & Access Control",
        items: [
            {
                question: "What is the difference between Admin and Resident?",
                answer: "Admins access the dashboard (this app) and have full control over all units, tariffs, and settings. Residents access the mobile web app and can only see their own unit's data and purchase tokens.",
            },
            {
                question: "How do I add a new user?",
                answer: "On the Users page, click 'Add User'. A popup modal opens where you enter the user's email (required) and display name (optional). The user is added as a resident. You can grant admin access afterwards using the shield icon on their row.",
            },
            {
                question: "How does admin authentication work?",
                answer: "Admins log in via Google OAuth. The backend validates the Google ID token and returns a signed JWT stored as 'admin-token' in localStorage. The token must belong to an email in the allowed admin list.",
            },
        ],
    },
    {
        title: "Logs & Monitoring",
        items: [
            {
                question: "What is the audit log?",
                answer: "Every admin action (unit creation, relay toggle, tariff change, payment, anomaly detection) is recorded in the audit log with the actor email, action type, target entity, details, and success/failure result.",
            },
            {
                question: "Can I filter logs?",
                answer: "Yes. Logs can be filtered by category (User Management, Unit Management, Calibration, Tariff, Transactions, Anomaly, System Error) and by result (success, failure, info). You can also free-text search across actor, action, target, and details fields.",
            },
        ],
    },
    {
        title: "BullMQ Queue Monitor",
        items: [
            {
                question: "What is the Queue Monitor?",
                answer: "The Queue Monitor (powered by Bull Board) is an embedded dashboard located at the bottom of the Logs page. It provides a visual interface to manage all asynchronous background jobs in the system. The system runs three main queues: 'telemetry' (processing incoming device data), 'payment-expiry' (canceling unpaid Midtrans transactions), and 'broadcast' (sending bulk Telegram messages).",
            },
            {
                question: "What actions (CRUD) can I perform on jobs?",
                answer: "As an admin, you have full control over the lifecycle of background jobs. You can:\n\n1. Read/View: Inspect the exact payload (data) of any pending, active, completed, or failed job.\n2. Retry (Update): Manually trigger a retry for any job that has failed (e.g., if a Telegram broadcast failed due to a network blip).\n3. Delete: Permanently remove specific jobs from the queue history.\n4. Clean/Purge: Bulk delete all completed or all failed jobs to free up Redis memory.",
            },
            {
                question: "How do I pause or resume queue processing?",
                answer: "At the top right of each queue's panel in the Queue Monitor, there is a 'Pause' button. Clicking this will halt the processing of all new jobs in that specific queue. The jobs will safely stack up in Redis. You can click 'Resume' to process the backlog. This is highly useful during database maintenance.",
            },
        ],
    },
    {
        title: "EMQX Dashboard",
        items: [
            {
                question: "What is the EMQX Dashboard?",
                answer: "The EMQX Dashboard is a separate, standalone control panel for the MQTT broker (usually accessible at port 18083). It allows admins to monitor real-time device connections, manage topics, and configure broker settings independent of the main NetFlow backend.",
            },
            {
                question: "What client management (CRUD) actions can I perform?",
                answer: "In the EMQX Dashboard under 'Connections' or 'Clients', you can:\n\n1. Read/View: See a list of all currently connected ESP32 devices and mobile web clients, including their IP addresses, connection times, and active subscriptions.\n2. Kick/Delete: Forcefully disconnect (kick) a misbehaving or rogue client from the broker. The device will attempt to reconnect based on its firmware logic.\n3. Trace (Update/Debug): Start a real-time message trace on a specific Client ID to see exactly what binary payloads they are sending and receiving for debugging purposes.",
            },
            {
                question: "Can I manually publish or subscribe to topics?",
                answer: "Yes. Under the 'WebSocket Client' or 'Tools' section of the EMQX Dashboard, admins can connect a temporary debug client. From there, you can manually Publish (Create) test payloads to any topic (e.g., simulating a top-up) or Subscribe (Read) to topics to watch raw traffic flow in real-time.",
            },
        ],
    },
    {
        title: "Anomaly Detection & Notifications",
        items: [
            {
                question: "How does anomaly detection work?",
                answer: "The system uses a two-layer detection approach. The rule-based layer checks 11 conditions in real time (low balance, voltage out of range, MCB trip, water leak, sensor malfunction, etc.). The statistical ML layer computes a Z-score across power, voltage, current, and water flow using the last 30 days of historical readings - readings with a Z-score above 2.5 are flagged as anomalies. Both layers run in-process without any external dependency.",
            },
            {
                question: "Who gets notified about anomalies?",
                answer: "When a Critical or Warning anomaly is detected — including low balance alerts — the system sends an email to the resident via SMTP (nodemailer) and, if the resident has linked a Telegram account, also sends a Telegram message via the Telegram Bot API using HTML parse mode. Admins see anomalies in the dashboard Overview and notification bell.",
            },
            {
                question: "How fast does an alert appear after an event?",
                answer: "The system is designed to deliver alerts within 90 seconds of the triggering event (B200 Spec #8). Offline alerts are driven by MQTT LWT (Last Will and Testament), which fires automatically when the broker detects the device has not sent a Keep-Alive packet for 300 seconds (5 minutes). Jumper and tamper alerts are triggered immediately when the anomalous telemetry payload arrives.",
            },
            {
                question: "What is a 'jumper' anomaly?",
                answer: "A jumper anomaly is detected when the energy sensor reports non-zero current (A > 0) while the relay status is recorded as open (false / disconnected). This indicates electricity is flowing despite the circuit being cut — a sign the meter has been bypassed. The system flags this and notifies both the admin dashboard and the resident.",
            },
            {
                question: "What is a tamper event?",
                answer: "Tampering is detected when the device's physical case-open switch (tamper switch) is triggered, signalled via a flag bit in the MQTT telemetry payload. This indicates someone has physically opened the meter enclosure. An anomaly record is created and a notification is dispatched immediately.",
            },
            {
                question: "Do anomaly notifications still get sent when the valve or relay is turned off?",
                answer: "Yes. Anomaly detection runs independently of the relay and valve state. Turning off the relay or valve does not suspend monitoring. The system will still detect and notify for events such as device offline, voltage anomaly, and sensor malfunction. Some anomalies — like MCB trip or water leak — are less likely to trigger when utilities are off because no power or water is flowing, but the pipeline continues to run. Importantly, if sensors report consumption while the relay is OFF and the balance is zero, the system flags a 'jailbreak' anomaly, indicating a potential bypass of the metering system.",
            },
            {
                question: "How do dashboard notifications work?",
                answer: "The bell icon in the header shows unread alerts sourced from the audit log — specifically anomaly events and failed device/firmware commands. Clicking the bell opens the panel. Closing the panel marks all shown notifications as read; they will no longer appear on next visit. Read state is stored in localStorage.",
            },
        ],
    },
    {
        title: "Control Center",
        items: [
            {
                question: "What can I do in Control Center?",
                answer: "Control Center has four areas: (1) Tariff rates — set the Rp/kWh electricity price and Rp/m³ water price with a future effective date so the new rate activates automatically on that date. (2) Sensor calibration — adjust the flow-rate and power calibration factors (CAL_FACTOR_FLOWRATE and CAL_FACTOR_POWER) and the sensor sampling time. (3) Broadcast commands — cut or restore electricity relay and water valve for all connected devices simultaneously, for example during planned maintenance. (4) OTA firmware update — broadcast a firmware binary link to all devices via MQTT so they can self-update.",
            },
            {
                question: "How do tariff rates work?",
                answer: "Each tariff entry has a utility type (electricity or water), a price per unit, and an effective date. The system always uses the most recent entry whose effective date is on or before today as the active rate. You can schedule a future rate by setting an effective date ahead of today — it will appear as 'Scheduled' until that date arrives. Creating a new entry never deletes old ones, so the full rate history is preserved.",
            },
            {
                question: "Can I set a tariff with a past effective date?",
                answer: "Yes. The system does not restrict the effective date to the future. A past-dated tariff becomes the active rate immediately (since its effective date ≤ today). Use this carefully: it does not retroactively recalculate past bills, but it will affect the next billing cycle.",
            },
            {
                question: "What do the calibration factors do?",
                answer: "CAL_FACTOR_FLOWRATE scales raw flow-sensor pulse counts to actual m³/h. CAL_FACTOR_POWER scales the power reading from the energy chip. Changing these values sends a config_ack MQTT message to all connected devices. The Control Center log shows the acknowledgement from each device. Only change these if you have performed a physical calibration test against a reference meter.",
            },
            {
                question: "How does OTA firmware update work?",
                answer: "Enter the firmware version string and a publicly accessible binary URL, then click Push OTA. The backend publishes an MQTT message to all connected devices with the binary link. Each device downloads and flashes the firmware independently and sends back an OTA ACK (ok, noop if already up-to-date, or a failure code). The Control Center log panel shows each ACK as it arrives. The last binary link you pushed is remembered in localStorage for convenience.",
            },
        ],
    },
    {
        title: "Tariffs & Billing",
        items: [
            {
                question: "How is a resident's bill calculated?",
                answer: "Consumption is calculated as the difference between the maximum and minimum meter readings within the billing period (MAX − MIN, so counter resets do not overcharge). This is then multiplied by the active tariff rate for that period. Water volume is stored in m³ at 64-bit double precision to prevent cumulative rounding errors.",
            },
            {
                question: "What happens when the meter reading counter resets?",
                answer: "The reporting query uses GREATEST(0, MAX − MIN) per period, so a counter reset back to zero produces a large negative delta that is clamped to zero. No phantom consumption is billed.",
            },
            {
                question: "What currency and precision does the system use?",
                answer: "All prices are in Indonesian Rupiah (Rp). Electricity is priced per kWh, water per m³. Energy readings are stored as floating-point to carry sub-kWh precision; the dashboard rounds to 2 decimal places for display.",
            },
        ],
    },
    {
        title: "Data Retention",
        items: [
            {
                question: "How long is telemetry data kept?",
                answer: "A nightly cron job (3 AM) automatically purges meter_readings older than 24 months and transactions older than 60 months. These thresholds match the data retention policy defined in the product specification (B200 §2.1.7). This keeps the database lean without manual intervention.",
            },
            {
                question: "What happens to data when a device is offline?",
                answer: "While offline, the device stores readings locally in its controller memory. When the connection is restored, it sends all buffered readings (batching log) to the server in one burst. The server stores them with their original timestamps. Data loss only occurs if the device runs out of local RAM before reconnecting.",
            },
        ],
    },
    {
        title: "MQTT & Connectivity",
        items: [
            {
                question: "Which MQTT topics does the system use?",
                answer: "device/{id}/telemetry — device publishes sensor readings (QoS 1). device/{id}/relay/set — backend sends relay on/off command (QoS 1, JSON ≤128 bytes). device/{id}/valve/set — backend sends valve open/close command (QoS 1, JSON ≤128 bytes). device/{id}/topup — backend sends top-up credit. device/{id}/status — device heartbeat for Keep-Alive and LWT (offline detection after 300 s silence).",
            },
            {
                question: "What QoS level does the system use and why?",
                answer: "Telemetry and command topics use QoS 1 (at-least-once delivery). This guarantees each message reaches its destination at least once while keeping overhead lower than QoS 2. For sensor readings, occasional duplicates are acceptable; the time-series query uses MAX−MIN aggregation so duplicates have no impact on billing. For commands, the device ignores duplicate command_ids it has already executed.",
            },
            {
                question: "How long can the system scale to?",
                answer: "The server is designed and tested to handle 2,444 concurrent units (matching the target building capacity) with Data Loss Rate ≤ 1% per month and CPU/RAM both below 80%. End-to-end latency from meter reading to dashboard display must not exceed 60 seconds under this load.",
            },
            {
                question: "Why does the mobile app use WebSocket instead of TCP for MQTT?",
                answer: "Browsers cannot open raw TCP connections. EMQX provides a WebSocket bridge on port 8083 that wraps MQTT in WebSocket frames, allowing browser clients to subscribe to live telemetry without a proxy.",
            },
        ],
    },
];

// ── Highlight matching text like a stabilo marker ──────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
    if (!query.trim()) return <>{text}</>;
    const q = query.toLowerCase();
    const lower = text.toLowerCase();
    const parts: Array<{ chunk: string; match: boolean }> = [];
    let idx = 0;
    let found = lower.indexOf(q, idx);
    while (found !== -1) {
        if (found > idx) parts.push({ chunk: text.slice(idx, found), match: false });
        parts.push({ chunk: text.slice(found, found + q.length), match: true });
        idx = found + q.length;
        found = lower.indexOf(q, idx);
    }
    if (idx < text.length) parts.push({ chunk: text.slice(idx), match: false });
    return (
        <>
            {parts.map((p, i) =>
                p.match ? (
                    <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 text-yellow-900 dark:text-yellow-100 rounded-sm px-0.5 not-italic">
                        {p.chunk}
                    </mark>
                ) : p.chunk
            )}
        </>
    );
}

function AccordionItem({ item, query, forceOpen }: { item: FAQItem; query: string; forceOpen: boolean }) {
    const [open, setOpen] = useState(false);
    const isOpen = forceOpen || open;
    return (
        <div className="border-b border-gray-100 dark:border-gray-700 last:border-0">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-start justify-between gap-4 py-4 text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary dark:hover:text-primary transition-colors"
            >
                <span><Highlight text={item.question} query={query} /></span>
                {isOpen
                    ? <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    : <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                }
            </button>
            {isOpen && (
                <p className="pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    <Highlight text={item.answer} query={query} />
                </p>
            )}
        </div>
    );
}

export default function FAQPage() {
    const [search, setSearch] = useState("");

    const visibleSections = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return FAQ_DATA.map(s => ({ ...s, items: s.items }));
        return FAQ_DATA
            .map(section => ({
                ...section,
                items: section.items.filter(
                    item =>
                        item.question.toLowerCase().includes(q) ||
                        item.answer.toLowerCase().includes(q)
                ),
            }))
            .filter(s => s.items.length > 0);
    }, [search]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <HelpCircle className="h-6 w-6 text-primary" />
                    FAQ & Feature Guide
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Frequently asked questions about the NetFlow dashboard features and system behaviour.
                </p>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search questions and answers..."
                    className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 pl-9 pr-4 text-sm text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
            </div>

            {visibleSections.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500">No results for &ldquo;{search}&rdquo;.</p>
            )}

            <div className="space-y-4">
                {visibleSections.map((section) => (
                    <div
                        key={section.title}
                        className="rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-gray-900/5 dark:ring-gray-700 px-5"
                    >
                        <h2 className="py-4 text-xs font-semibold uppercase tracking-wider text-primary border-b border-gray-100 dark:border-gray-700">
                            {section.title}
                        </h2>
                        {section.items.map((item) => (
                            <AccordionItem
                                key={item.question}
                                item={item}
                                query={search}
                                forceOpen={!!search.trim()}
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
