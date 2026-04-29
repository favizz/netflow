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
                answer: "The Overview page displays real-time statistics: total units registered, how many are currently online/offline (refreshed every 30 seconds), units with low balance, active anomaly alerts, and recent audit log entries. It gives a bird's-eye view of the entire building system.",
            },
            {
                question: "How is 'online' status determined?",
                answer: "A unit is considered Online if its device has sent telemetry data within the last 5 minutes. The backend checks the latest entry in meter_readings for each device. If no reading exists or the last reading is older than 5 minutes, the unit is Offline.",
            },
        ],
    },
    {
        title: "Devices & Units",
        items: [
            {
                question: "How do I add a new unit?",
                answer: "On the Devices page, click 'Add Unit'. Provide the unit number (e.g. A-101) and the device ID of the physical smart meter. The unit starts with zero balance and relay ON.",
            },
            {
                question: "How do I assign a resident to a unit?",
                answer: "Click the edit icon on any unit row in the Devices table. Enter the resident's email address in the 'Resident Email' field. This links the resident's mobile app to that unit.",
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
                answer: "The backend and devices use a compact 21-byte binary frame. The dashboard decodes it in three stages: MessagePack → 21-byte binary (energy×100, power×10, voltage×10, current×1000, waterFlow×100, waterTotal×1000, balance, flags) → JSON fallback. This minimizes MQTT bandwidth.",
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
                answer: "Residents purchase tokens via the mobile app through the payment gateway. On successful payment, a webhook credits the unit's balance. Balances are stored directly on the units table for fast reads.",
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
                question: "What is the Queue Monitor?",
                answer: "The Queue Monitor (accessible via the button on the Logs page) opens Bull Board — a visual interface for the BullMQ job queues. It shows the telemetry processing queue and the payment-expiry queue: pending jobs, completed jobs, failed jobs, and retry counts.",
            },
            {
                question: "Can I filter logs?",
                answer: "Yes. Logs can be filtered by category (User Management, Unit Management, Calibration, Tariff, Transactions, Anomaly, System Error) and by result (success, failure, info). You can also free-text search across actor, action, target, and details fields.",
            },
        ],
    },
    {
        title: "Anomaly Detection & Notifications",
        items: [
            {
                question: "How does anomaly detection work?",
                answer: "The system uses a two-layer detection approach. The rule-based layer checks 11 conditions in real time (low balance, voltage out of range, MCB trip, water leak, sensor malfunction, etc.). The statistical ML layer computes a Z-score across power, voltage, current, and water flow using the last 30 days of historical readings — readings with a Z-score above 2.5 are flagged as anomalies. Both layers run in-process without any external dependency.",
            },
            {
                question: "Who gets notified about anomalies?",
                answer: "When a Critical or Warning anomaly is detected — including low balance alerts — the system automatically sends an email to the resident assigned to that unit via nodemailer (SMTP). Admins see anomalies in the dashboard Overview.",
            },
        ],
    },
    {
        title: "Control Center",
        items: [
            {
                question: "What can I do in Control Center?",
                answer: "Control Center lets you send batch relay and valve commands across multiple units simultaneously — for example, cutting power to an entire tower during maintenance or restoring service after a billing event.",
            },
        ],
    },
    {
        title: "Data Retention",
        items: [
            {
                question: "How long is telemetry data kept?",
                answer: "A nightly cron job (3 AM) automatically purges meter_readings older than 24 months and transactions older than 60 months. This keeps the database lean without manual intervention.",
            },
        ],
    },
    {
        title: "MQTT & Connectivity",
        items: [
            {
                question: "Which MQTT topics does the system use?",
                answer: "device/{id}/telemetry — device publishes sensor readings. device/{id}/relay/set — backend sends relay on/off. device/{id}/valve/set — backend sends valve open/close. device/{id}/status — device heartbeat.",
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
