import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import logos from "../../assets/logo.png"

import {
    ArrowLeft,
    AlertCircle,
    ShoppingCart,
    ReceiptText,
    Sparkles,
    ShieldCheck,
    Zap,
    ChevronRight,
    Eye,
    Printer,
    X,
    Store,
    Minus,
    Plus,
    Trash2,
    Pencil,
    Download,
    Phone,
    CalendarDays, LayoutDashboard, ClipboardList, Users, BarChart3,
    Settings, FileText, Search, Flame, UserRound, Banknote, CreditCard, Wallet, Tag,
} from "lucide-react";
import { Link } from "react-router-dom";

import ServiceSelector from "../../components/billing/ServiceSelector";
import PaymentSelector from "../../components/billing/PaymentSelector";
import BillSummary from "../../components/billing/BillSummary";

import useServices from "../../hooks/useServices";
import { createTransaction } from "../../services/transactionService";
import { collection, query, where, getDocs, deleteDoc, doc as firestoreDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { calculateCart } from "../../utils/calculations";

import "./NewTransaction.css";

/* =========================================================
   DEFAULT SERVICES
   ========================================================= */

const defaultServices = [
    {
        id: "bw",
        name: "B&W Xerox",
        category: "Xerox",
        unit: "page",
        sellingPrice: 2,
        costPrice: 0.5,
        active: true,
    },
    {
        id: "color",
        name: "Color Printout",
        category: "Printing",
        unit: "page",
        sellingPrice: 10,
        costPrice: 4,
        active: true,
    },
    {
        id: "full",
        name: "Full Page Lamination",
        category: "Lamination",
        unit: "piece",
        sellingPrice: 40,
        costPrice: 8,
        active: true,
    },
    {
        id: "id",
        name: "ID Lamination",
        category: "Lamination",
        unit: "piece",
        sellingPrice: 20,
        costPrice: 5,
        active: true,
    },
    {
        id: "photo",
        name: "Photo Printout",
        category: "Photo",
        unit: "piece",
        sellingPrice: 30,
        costPrice: 8,
        active: true,
    },
    {
        id: "pen",
        name: "Pen",
        category: "Stationery",
        unit: "piece",
        sellingPrice: 10,
        costPrice: 5,
        active: true,
    },
];

/* =========================================================
   CART ROW — quantity can be typed manually
   ========================================================= */

function CartRow({ item, onQty, onSetQty, onRemove }) {
    const [draft, setDraft] = useState(String(item.quantity));

    // keep the box in sync when +/- buttons change the quantity
    useEffect(() => {
        setDraft(String(item.quantity));
    }, [item.quantity]);

    const rate = Number(item.sellingPrice) || 0;

    function handleChange(event) {
        const digits = event.target.value
            .replace(/\D/g, "")
            .slice(0, 5);

        setDraft(digits);

        const value = parseInt(digits, 10);

        if (value > 0) {
            onSetQty(item.id, value);
        }
    }

    function handleBlur() {
        // empty or 0 → go back to the last valid quantity
        setDraft(String(item.quantity));
    }

    return (
        <div className="cart-row">

            <div className="cart-row-top">

                <div className="cart-row-info">
                    <strong>{item.name}</strong>
                    <span>
                        ₹{rate.toLocaleString("en-IN")} / {item.unit || "unit"}
                    </span>
                </div>

                <button
                    type="button"
                    className="cart-row-remove"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => onRemove(item.id)}
                >
                    <Trash2 size={18} />
                </button>

            </div>

            <div className="cart-row-bottom">

                <div className="cart-qty">

                    <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => onQty(item.id, -1)}
                    >
                        <Minus size={16} />
                    </button>

                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label="Quantity"
                        value={draft}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onFocus={(event) => event.target.select()}
                    />

                    <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => onQty(item.id, 1)}
                    >
                        <Plus size={16} />
                    </button>

                </div>

                <strong className="cart-row-total">
                    ₹{(rate * item.quantity).toLocaleString("en-IN")}
                </strong>

            </div>

        </div>
    );
}

/* =========================================================
   PAGE
   ========================================================= */

/* =========================================================
   EXPORT / PRINT HELPERS FOR THE DAY'S BILLS
   ========================================================= */

const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const timeOf = (entry) =>
    new Date(entry.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

const dateOf = (entry) =>
    new Date(entry.time).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function downloadCsv(filename, rows) {
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function billsToCsvRows(entries, numberOf) {
    const rows = [["Bill No", "Date", "Time", "Customer", "Phone", "Payment", "Service", "Rate", "Quantity", "Line Total", "Bill Total"]];
    entries.forEach((entry) => {
        (entry.items || []).forEach((it, i) => {
            rows.push([
                numberOf(entry),
                dateOf(entry),
                timeOf(entry),
                entry.customer || "",
                entry.phone || "",
                String(entry.payment || "").toUpperCase(),
                it.name,
                it.rate,
                it.quantity,
                it.rate * it.quantity,
                i === 0 ? entry.total : "",
            ]);
        });
    });
    if (entries.length > 1) {
        rows.push([]);
        rows.push(["", "", "", "", "", "", "", "", "", "Day Total", entries.reduce((sum, e) => sum + (Number(e.total) || 0), 0)]);
    }
    return rows;
}

function printHtmlDocument(html) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
        document.body.removeChild(iframe);
        return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => iframe.parentNode && iframe.parentNode.removeChild(iframe);

    iframe.onload = () => {
        const fontsReady = iframe.contentDocument?.fonts?.ready || Promise.resolve();
        Promise.race([fontsReady, new Promise((resolve) => setTimeout(resolve, 2500))]).then(() =>
            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(cleanup, 1500);
            }, 250)
        );
    };
}

function billsToHtml(entries, numberOf, { title, subtitle, summary }) {
    const billBlock = (entry) => `
        <section class="bill">
            <div class="bill-head">
                <div><b>Bill #${numberOf(entry)}</b> <span>${esc(dateOf(entry))} · ${esc(timeOf(entry))}</span></div>
                <div><span>${esc(String(entry.payment || "").toUpperCase())}${entry.customer ? " · " + esc(entry.customer) : ""}${entry.phone ? " · " + esc(entry.phone) : ""}</span></div>
            </div>
            <table>
                <thead><tr><th>Service</th><th class="r">Rate</th><th class="r">Qty</th><th class="r">Total</th></tr></thead>
                <tbody>
                    ${(entry.items || []).map((it) => `<tr><td>${esc(it.name)}</td><td class="r">${inr(it.rate)}</td><td class="r">${it.quantity}</td><td class="r">${inr(it.rate * it.quantity)}</td></tr>`).join("")}
                </tbody>
            </table>
            <div class="bill-total"><span>Bill Total</span><strong>${inr(entry.total)}</strong></div>
        </section>`;

    const grand = entries.reduce((sum, e) => sum + (Number(e.total) || 0), 0);

    const summaryHtml = summary && summary.length ? `
        <h3>Service-wise summary</h3>
        <table>
            <thead><tr><th>S.No</th><th>Service</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead>
            <tbody>${summary.map((row, i) => `<tr><td>${i + 1}</td><td>${esc(row.name)}</td><td class="r">${row.quantity}</td><td class="r">${inr(row.amount)}</td></tr>`).join("")}</tbody>
        </table>
        <h3>Bills</h3>` : "";

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Outfit", Arial, sans-serif; color: #1b2437; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 8px; }
    .head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 2px solid #1b2437; }
    .head img { height: 64px; }
    .head h2 { margin: 0; font-size: 26px; letter-spacing: 0.06em; text-align: right; }
    .head p { margin: 2px 0 0; text-align: right; color: #5b6478; font-size: 14px; }
    h3 { margin: 22px 0 8px; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; color: #5b6478; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { padding: 8px 10px; text-align: left; background: #eef1f8; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; }
    td { padding: 8px 10px; border-top: 1px solid #dfe3ee; }
    .r { text-align: right; }
    .bill { margin-top: 14px; border: 1px solid #dfe3ee; border-radius: 10px; overflow: hidden; page-break-inside: avoid; }
    .bill-head { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; font-size: 14px; }
    .bill-head span { color: #5b6478; }
    .bill-total { display: flex; justify-content: space-between; padding: 10px 12px; border-top: 1px solid #dfe3ee; background: #f6f8fc; font-size: 15px; }
    .grand { display: flex; justify-content: space-between; margin-top: 18px; padding: 14px 16px; border-radius: 10px; background: #1b2437; color: #fff; font-size: 18px; }
    .thanks { margin-top: 26px; text-align: center; font-weight: 700; color: #1b2437; }
    @page { size: A4; margin: 10mm; }
</style></head>
<body><main class="page">
    <section class="head">
        <img src="${logos}" alt="AKR Communications" />
        <div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
    </section>
    ${summaryHtml}
    ${entries.map(billBlock).join("")}
    <div class="grand"><span>${entries.length > 1 ? "DAY TOTAL" : "GRAND TOTAL"}</span><strong>${inr(grand)}</strong></div>
    <div class="thanks">Thank you for choosing AKR Communications</div>
</main></body></html>`;
}

export default function NewTransaction() {
    /* =====================================================
       AUTH
       ===================================================== */

    const {
        user,
        profile,
        role,
    } = useAuth();

    /* =====================================================
       FIREBASE SERVICES
       ===================================================== */

    const {
        services = [],
        loading: servicesLoading,
        error: servicesError,
    } = useServices();

    /* =====================================================
       SERVICES
       ===================================================== */

    // Services added from the "Add Service" button (kept in this browser)
    const CUSTOM_SERVICES_KEY = "nt-custom-services";
    const [customServices, setCustomServices] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(CUSTOM_SERVICES_KEY) || "[]");
            return Array.isArray(saved) ? saved : [];
        } catch {
            return [];
        }
    });
    const [showAddService, setShowAddService] = useState(false);
    const [newService, setNewService] = useState({ name: "", category: "General", costPrice: "" });

    function saveCustomServices(next) {
        setCustomServices(next);
        try {
            localStorage.setItem(CUSTOM_SERVICES_KEY, JSON.stringify(next));
        } catch {
            /* storage unavailable - the service still works for this session */
        }
    }

    // Normalize the Firebase service schema used by AdminDashboard.
    // Admin stores the live rate as `price` + `profit`; billing uses
    // `sellingPrice` + `costPrice`. Keeping this mapping here makes both
    // screens use the same Firebase service/rate source.
    const availableServices = useMemo(() => {
        const base =
            Array.isArray(services) && services.length > 0
                ? services
                : defaultServices;
        const source = [...base, ...customServices];

        return source
            .filter((service) => service?.active !== false)
            .map((service) => {
                const sellingPrice = Number(
                    service?.sellingPrice ??
                    service?.price ??
                    0
                ) || 0;

                const profit = Number(
                    service?.profit ??
                    service?.profitPerUnit ??
                    0
                ) || 0;

                const storedCost = Number(service?.costPrice);

                return {
                    ...service,
                    id: service.id,
                    name:
                        service.name ??
                        service.serviceName ??
                        "Unnamed service",
                    serviceName:
                        service.serviceName ??
                        service.name ??
                        "Unnamed service",
                    category: service.category ?? "General",
                    unit: service.unit ?? "unit",
                    sellingPrice,
                    price: sellingPrice,
                    profit,
                    profitPerUnit: profit,
                    costPrice: Number.isFinite(storedCost)
                        ? storedCost
                        : Math.max(0, sellingPrice - profit),
                    active: service.active !== false,
                };
            });
    }, [services, customServices]);

    /* =====================================================
       STATE
       ===================================================== */

    const { theme } = useTheme();

    const [cart, setCart] = useState([]);

    const [payment, setPayment] =
        useState("cash");

    const [saving, setSaving] =
        useState(false);

    const [showBillPreview, setShowBillPreview] =
        useState(false);

    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [serviceSearch, setServiceSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState("All");
    const [promoCode, setPromoCode] = useState("");
    const [promoApplied, setPromoApplied] = useState(false);

    /* =====================================================
       ADD SERVICE
       ===================================================== */

    // Today's running total of bills completed on this page (kept per user, per day)
    const dayStorageKey = `nt-day-total:${user?.uid || "anon"}:${new Date().toLocaleDateString("en-CA")}`;
    const [dayStats, setDayStats] = useState({ amount: 0, bills: 0, entries: [] });
    const [showDayPopup, setShowDayPopup] = useState(false);

    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(dayStorageKey) || "null");
            setDayStats({
                amount: Number(saved?.amount) || 0,
                bills: Number(saved?.bills) || 0,
                entries: Array.isArray(saved?.entries) ? saved.entries : [],
            });
        } catch {
            setDayStats({ amount: 0, bills: 0, entries: [] });
        }
    }, [dayStorageKey]);

    // ---- Add / remove a service from the table ----
    function openAddService() {
        setNewService({ name: "", category: "General", costPrice: "" });
        setShowAddService(true);
    }

    function submitAddService() {
        const name = newService.name.trim();
        if (!name) {
            alert("Please enter the service name.");
            return;
        }
        const exists = availableServices.some((svc) => String(svc.name).trim().toLowerCase() === name.toLowerCase());
        if (exists) {
            alert("A service with this name already exists.");
            return;
        }
        const costPrice = Number(newService.costPrice) || 0;
        saveCustomServices([
            ...customServices,
            {
                id: `custom-${Date.now()}`,
                name,
                serviceName: name,
                category: newService.category,
                unit: "unit",
                sellingPrice: 0,
                price: 0,
                costPrice,
                profit: 0,
                active: true,
                custom: true,
            },
        ]);
        setShowAddService(false);
    }

    function removeCustomService(service) {
        if (!window.confirm(`Remove "${service.name}" from the services list?`)) return;
        saveCustomServices(customServices.filter((svc) => svc.id !== service.id));
        setCart((current) => current.filter((item) => item.id !== service.id));
    }

    // ---- CRUD for the bills listed in the day popup ----
    const [editor, setEditor] = useState(null);
    const [deletingBillId, setDeletingBillId] = useState(null);

    useEffect(() => {
        if (!showDayPopup) setEditor(null);
    }, [showDayPopup]);

    function persistDay(next) {
        setDayStats(next);
        try {
            localStorage.setItem(dayStorageKey, JSON.stringify(next));
        } catch {
            /* storage unavailable - the on-screen data still updates */
        }
    }

    function openNewBill() {
        setEditor({ id: null, customer: "", phone: "", payment: "cash", items: [{ name: "", rate: "", quantity: "" }] });
    }

    function openEditBill(entry) {
        setEditor({
            id: entry.id,
            customer: entry.customer || "",
            phone: entry.phone || "",
            payment: entry.payment || "cash",
            items: (entry.items || []).map((it) => ({
                name: it.name,
                rate: String(it.rate ?? ""),
                quantity: String(it.quantity ?? ""),
            })),
        });
    }

    function patchEditorItem(index, patch) {
        setEditor((current) => ({
            ...current,
            items: current.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
        }));
    }

    function addEditorItem() {
        setEditor((current) => ({ ...current, items: [...current.items, { name: "", rate: "", quantity: "" }] }));
    }

    function removeEditorItem(index) {
        setEditor((current) => ({
            ...current,
            items: current.items.length > 1 ? current.items.filter((_, i) => i !== index) : current.items,
        }));
    }

    function saveEditor() {
        const items = editor.items
            .map((it) => ({
                name: it.name.trim(),
                rate: Number(it.rate) || 0,
                quantity: parseInt(it.quantity, 10) || 0,
            }))
            .filter((it) => it.name && it.quantity > 0);

        if (!items.length) {
            alert("Add at least one service with a name and a quantity.");
            return;
        }

        const billTotal = items.reduce((sum, it) => sum + it.rate * it.quantity, 0);
        const entries = Array.isArray(dayStats.entries) ? dayStats.entries : [];
        const base = {
            customer: editor.customer.trim(),
            phone: editor.phone,
            payment: editor.payment,
            total: billTotal,
            items,
        };

        if (editor.id === null) {
            persistDay({
                amount: dayStats.amount + billTotal,
                bills: dayStats.bills + 1,
                entries: [...entries, { id: Date.now(), manual: true, time: new Date().toISOString(), ...base }],
            });
        } else {
            const old = entries.find((entry) => entry.id === editor.id);
            persistDay({
                amount: dayStats.amount - (Number(old?.total) || 0) + billTotal,
                bills: dayStats.bills,
                entries: entries.map((entry) => (entry.id === editor.id ? { ...entry, ...base, edited: true } : entry)),
            });
        }
        setEditor(null);
    }

    // ---- export / print ----
    const dayLabel = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" });
    const dayFileStamp = new Date().toLocaleDateString("en-CA");
    const billNumberOf = (entry) => (Array.isArray(dayStats.entries) ? dayStats.entries.indexOf(entry) + 1 : 0);

    function exportBill(entry) {
        downloadCsv(`AKR-bill-${billNumberOf(entry)}-${dayFileStamp}.csv`, billsToCsvRows([entry], billNumberOf));
    }

    function printBill(entry) {
        // same invoice layout as the main "Preview & Print Bill"
        printReceipt(entry);
    }

    function exportDay() {
        const entries = Array.isArray(dayStats.entries) ? dayStats.entries : [];
        if (!entries.length) return;
        downloadCsv(`AKR-day-report-${dayFileStamp}.csv`, billsToCsvRows(entries, billNumberOf));
    }

    function printDay(summary) {
        const entries = Array.isArray(dayStats.entries) ? dayStats.entries : [];
        if (!entries.length) return;
        printHtmlDocument(
            billsToHtml(entries, billNumberOf, {
                title: "DAILY REPORT",
                subtitle: dayLabel,
                summary,
            })
        );
    }

    // Removes the old totals that have no service details (bills completed before details were saved)
    function clearUnrecordedBills() {
        if (!window.confirm("Delete the old bills that have no service details? This also removes them from the Day Total.")) return;
        const entries = Array.isArray(dayStats.entries) ? dayStats.entries : [];
        persistDay({
            amount: entries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0),
            bills: entries.length,
            entries,
        });
    }

    // Finds the Firestore transaction that belongs to a saved popup bill
    async function findFirestoreTransactionId(entry) {
        if (entry.firestoreId) return entry.firestoreId;

        // bills added by hand or edited here no longer match a saved transaction
        if (entry.manual || entry.edited || !user?.uid) return null;

        const snapshot = await getDocs(
            query(collection(db, "transactions"), where("attendantId", "==", user.uid))
        );

        const billTime = new Date(entry.time).getTime();
        let best = null;

        snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const created = data.createdAt?.toMillis?.()
                ?? (typeof data.createdAt?.seconds === "number" ? data.createdAt.seconds * 1000 : 0);
            const amount = Number(data.total ?? data.amount ?? data.customerPays ?? 0);
            const sameItems = !Array.isArray(data.items) || data.items.length === (entry.items || []).length;
            const diff = Math.abs(created - billTime);

            if (created && amount === Number(entry.total) && sameItems && diff <= 5 * 60 * 1000) {
                if (!best || diff < best.diff) best = { id: docSnap.id, diff };
            }
        });

        return best ? best.id : null;
    }

    async function deleteBill(entry) {
        if (deletingBillId) return;
        if (!window.confirm("Delete this bill? It will also be removed from My Transactions.")) return;

        setDeletingBillId(entry.id);

        try {
            const transactionId = await findFirestoreTransactionId(entry);

            if (transactionId) {
                await deleteDoc(firestoreDoc(db, "transactions", transactionId));
            }

            const entries = Array.isArray(dayStats.entries) ? dayStats.entries : [];
            persistDay({
                amount: Math.max(0, dayStats.amount - (Number(entry.total) || 0)),
                bills: Math.max(0, dayStats.bills - 1),
                entries: entries.filter((e) => e.id !== entry.id),
            });

            if (!transactionId && !entry.manual) {
                alert("The bill was removed here, but no matching transaction was found in My Transactions. Delete it there if it still shows.");
            }
        } catch (error) {
            console.error("Delete bill error:", error);
            alert(error?.message || "Unable to delete the transaction. The bill was not removed.");
        } finally {
            setDeletingBillId(null);
        }
    }

    // Esc closes the day-total popup
    useEffect(() => {
        if (!showDayPopup) return undefined;
        const onKey = (event) => {
            if (event.key === "Escape") setShowDayPopup(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showDayPopup]);

    // Typed rate for each service row (string so the box can be empty while typing)
    const [rates, setRates] = useState({});

    function rateOf(service) {
        const inCart = cart.find((item) => item.id === service.id);
        if (inCart) return Number(inCart.sellingPrice) || 0;
        return Number(rates[service.id]) || 0;
    }

    function withRate(service, rate) {
        const costPrice = Number(service.costPrice) || 0;
        const sameAsDefault = rate === Number(service.sellingPrice || 0);
        const profit = sameAsDefault
            ? Number(service.profit) || 0
            : rate - costPrice;
        return {
            ...service,
            sellingPrice: rate,
            price: rate,
            profit,
            profitPerUnit: profit,
        };
    }

    function changeRate(service, raw) {
        const clean = raw.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 8);
        setRates((current) => ({ ...current, [service.id]: clean }));
        const rate = Number(clean) || 0;
        setCart((current) =>
            current.map((item) =>
                item.id === service.id ? { ...item, ...withRate(service, rate), quantity: item.quantity } : item
            )
        );
    }

    function changeRowQty(service, raw) {
        const digits = raw.replace(/\D/g, "").slice(0, 5);
        const quantity = parseInt(digits, 10) || 0;
        setCart((current) => {
            const exists = current.some((item) => item.id === service.id);
            if (quantity <= 0) {
                return current.filter((item) => item.id !== service.id);
            }
            if (exists) {
                return current.map((item) =>
                    item.id === service.id ? { ...item, quantity } : item
                );
            }
            const rate = Number(rates[service.id]) || 0;
            return [...current, { ...withRate(service, rate), quantity }];
        });
    }

    /* =====================================================
       REMOVE
       ===================================================== */

    function removeItem(id) {
        setCart((current) =>
            current.filter(
                (item) =>
                    item.id !== id
            )
        );
    }

    /* =====================================================
       TOTAL
       ===================================================== */

    const {
        total = 0,
    } = calculateCart(
        cart.map((item) => ({
            ...item,
            unitPrice:
                Number(
                    item.sellingPrice
                ) || 0,
        }))
    );

    /* =====================================================
       COMPLETE SALE
       ===================================================== */

    async function complete() {
        if (saving) {
            return;
        }

        if (!cart.length) {
            alert(
                "Please add at least one service."
            );
            return;
        }

        if (!user?.uid) {
            alert(
                "Your login session has expired. Please login again."
            );
            return;
        }

        if (role !== "attendant") {
            alert(
                "Only an attendant can create a sale."
            );
            return;
        }

        setSaving(true);

        try {
            const transactionData = {
                attendantId:
                    user.uid,

                attendantName:
                    profile?.name ||
                    user.displayName ||
                    user.email ||
                    "Attendant",

                items: cart.map(
                    (item) => ({
                        serviceId:
                            item.id,

                        serviceName:
                            item.name,

                        quantity:
                            Number(
                                item.quantity
                            ) || 0,

                        unitPrice:
                            Number(
                                item.sellingPrice
                            ) || 0,

                        costPrice:
                            Number(
                                item.costPrice
                            ) || 0,

                        profit:
                            Number(
                                item.profit ??
                                item.profitPerUnit ??
                                (
                                    Number(item.sellingPrice || 0) -
                                    Number(item.costPrice || 0)
                                )
                            ) || 0,
                    })
                ),

                paymentMethod:
                    payment,
            };

            console.log(
                "========== SAVING TRANSACTION =========="
            );

            console.log(
                "User UID:",
                user.uid
            );

            console.log(
                "Profile:",
                profile
            );

            console.log(
                "Transaction:",
                transactionData
            );

            const savedTransaction = await createTransaction(
                transactionData
            );

            // Firestore document id of the saved transaction (used to delete it from My Transactions later)
            const firestoreId =
                typeof savedTransaction === "string"
                    ? savedTransaction
                    : savedTransaction?.id ||
                      savedTransaction?.transactionId ||
                      savedTransaction?.docId ||
                      savedTransaction?.ref?.id ||
                      null;

            console.log(
                "TRANSACTION SAVED SUCCESSFULLY"
            );

            alert(
                "Sale completed successfully."
            );

            const nextDay = {
                amount: dayStats.amount + (Number(total) || 0),
                bills: dayStats.bills + 1,
                entries: [
                    ...(dayStats.entries || []),
                    {
                        id: Date.now(),
                        firestoreId,
                        time: new Date().toISOString(),
                        customer: customerName.trim(),
                        phone: customerPhone,
                        payment,
                        total: Number(total) || 0,
                        items: cart.map((item) => ({
                            name: item.name,
                            rate: Number(item.sellingPrice) || 0,
                            quantity: Number(item.quantity) || 0,
                        })),
                    },
                ],
            };
            setDayStats(nextDay);
            try {
                localStorage.setItem(dayStorageKey, JSON.stringify(nextDay));
            } catch {
                /* storage unavailable - the on-screen total still updates */
            }

            setCart([]);
            setCustomerName("");
            setShowBillPreview(false);
        } catch (error) {
            console.error(
                "========== TRANSACTION SAVE FAILED =========="
            );

            console.error(
                "Error code:",
                error?.code
            );

            console.error(
                "Error message:",
                error?.message
            );

            console.error(
                "Full error:",
                error
            );

            alert(
                `Unable to save transaction.\n\n${error?.message ||
                "Unknown Firebase error"
                }`
            );
        } finally {
            setSaving(false);
        }
    }

    /* =====================================================
       PRINT RECEIPT
       ---------------------------------------------------
       Builds a fully self-contained HTML receipt (its own
       inline styles, no dependency on the app's CSS/DOM) and
       prints it through a hidden iframe. This guarantees the
       printed page can never be blanked out by anything else
       on the page.
       ===================================================== */

    /* =====================================================
   PREMIUM PRINT RECEIPT
   ===================================================== */

    // printReceipt()        -> prints the current bill (cart)
    // printReceipt(entry)   -> prints a saved bill from the day popup with the SAME layout
    function printReceipt(entry) {
        const lines = entry
            ? (entry.items || []).map((it) => ({ name: it.name, sellingPrice: it.rate, quantity: it.quantity }))
            : cart;
        const billTotal = entry ? Number(entry.total) || 0 : total;
        const billPayment = String((entry ? entry.payment : payment) || "cash");
        const billCustomerName = entry ? entry.customer || "" : customerName;
        const billPhone = entry ? entry.phone || "" : customerPhone;

        if (!lines.length) {
            return;
        }

        const now = entry ? new Date(entry.time) : new Date();

        const dateStr = now.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });

        const timeStr = now.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
        });

        const attendantName =
            profile?.name ||
            user?.displayName ||
            "Attendant";

        const customerLabel =
            billCustomerName.trim() ||
            "Walk-in Customer";

        const itemCount = lines.reduce(
            (sum, item) =>
                sum + Number(item.quantity || 0),
            0
        );

        const paymentLabel =
            billPayment === "cash"
                ? "Cash"
                : billPayment.toUpperCase();

        const escapeHtml = (value) =>
            String(value ?? "").replace(
                /[&<>"']/g,
                (char) =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                }[char])
            );

        // Amount in words (Indian system: thousand, lakh, crore)
        const amountInWords = (value) => {
            const ones = [
                "", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
                "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
                "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen",
                "Nineteen",
            ];

            const tens = [
                "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty",
                "Seventy", "Eighty", "Ninety",
            ];

            const underHundred = (n) =>
                n < 20
                    ? ones[n]
                    : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;

            const underThousand = (n) => {
                const hundreds = Math.floor(n / 100);
                const rest = n % 100;

                return [
                    hundreds ? `${ones[hundreds]} Hundred` : "",
                    rest ? underHundred(rest) : "",
                ]
                    .filter(Boolean)
                    .join(" ");
            };

            const toWords = (n) => {
                if (n === 0) return "Zero";

                const parts = [];
                const crore = Math.floor(n / 10000000);
                const lakh = Math.floor((n % 10000000) / 100000);
                const thousand = Math.floor((n % 100000) / 1000);
                const rest = n % 1000;

                if (crore) parts.push(`${underHundred(crore)} Crore`);
                if (lakh) parts.push(`${underHundred(lakh)} Lakh`);
                if (thousand) parts.push(`${underHundred(thousand)} Thousand`);
                if (rest) parts.push(underThousand(rest));

                return parts.join(" ");
            };

            const safe = Math.max(0, Number(value) || 0);
            const rupees = Math.floor(safe);
            const paise = Math.round((safe - rupees) * 100);

            let words = `Rupees ${toWords(rupees)}`;

            if (paise > 0) {
                words += ` and ${toWords(paise)} Paise`;
            }

            return `${words} Only`;
        };

        const totalInWords = amountInWords(billTotal);

        const rowsHtml = lines
            .map((item) => {
                const rate =
                    Number(item.sellingPrice) || 0;

                const quantity =
                    Number(item.quantity) || 0;

                const amount =
                    rate * quantity;

                return `
                <tr>
                    <td class="name">${escapeHtml(item.name)}</td>
                    <td class="c">₹${rate.toLocaleString("en-IN")}</td>
                    <td class="c">${quantity}</td>
                    <td class="r">₹${amount.toLocaleString("en-IN")}</td>
                </tr>
            `;
            })
            .join("");

        const customerPhoneLabel =
            String(billPhone || "").trim();

        const receiptHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>AKR Communications - Invoice</title>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

            <style>
                :root {
                    --brand: #4b3f94;
                    --brand-dark: #3a2f7a;
                    --ink: #14142b;
                    --muted: #5c6075;
                    --line: #2a2a3d;
                    --soft: #ecebf7;
                }

                * { box-sizing: border-box; }

                html, body { margin: 0; padding: 0; }

                body {
                    background: #ffffff;
                    color: var(--ink);
                    font-family: "Outfit", sans-serif;
                    font-size: 12px;
                    line-height: 1.45;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                .watermark {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    width: 440px;
                    max-width: 70%;
                    height: auto;
                    transform: translate(-50%, -50%);
                    opacity: 0.07;
                    z-index: 0;
                    pointer-events: none;
                }

                .page {
                    max-width: 794px;
                    margin: 0 auto;
                    padding: 34px 40px 30px;
                    position: relative;
                    z-index: 1;
                }

                /* ---------- header ---------- */
                .head {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 24px;
                }

                .brand { display: flex; align-items: center; }

                .logo-wrap {
                    width: 240px;
                    max-width: 100%;
                    background: transparent;
                    border: 0;
                    border-radius: 0;
                    box-shadow: none;
                    padding: 0;
                }

                .logo {
                    display: block;
                    width: 100%;
                    height: auto;
                    object-fit: contain;
                    box-shadow: none;
                }

                .title { text-align: right; }

                .title h2 {
                    margin: 0;
                    font-size: 38px;
                    font-weight: 900;
                    letter-spacing: 3px;
                    line-height: 1;
                    color: var(--brand);
                }

                .title p {
                    margin: 8px 0 0;
                    font-size: 13px;
                    font-weight: 700;
                    color: var(--ink);
                }

                /* ---------- customer / bill details ---------- */
                .info {
                    display: flex;
                    justify-content: space-between;
                    gap: 24px;
                    margin: 30px 0 26px;
                }

                .info-block h4 {
                    margin: 0 0 4px;
                    font-size: 12px;
                    font-weight: 800;
                    color: var(--ink);
                }

                .info-block .big {
                    font-size: 15px;
                    font-weight: 800;
                    color: var(--ink);
                }

                .info-block p { margin: 2px 0 0; color: var(--ink); }

                .info-block.right { min-width: 220px; }

                .info-row { display: flex; gap: 8px; margin-top: 2px; }
                .info-row span { width: 70px; color: var(--muted); }
                .info-row strong { font-weight: 700; }

                /* ---------- items ---------- */
                table { width: 100%; border-collapse: collapse; }

                thead th {
                    padding: 13px 18px;
                    background: var(--brand);
                    color: #ffffff;
                    font-size: 12px;
                    font-weight: 600;
                    text-align: left;
                }

                thead th.c { text-align: center; }
                thead th.r { text-align: right; }

                tbody td {
                    padding: 14px 18px;
                    border-bottom: 1.5px solid var(--line);
                    font-size: 12px;
                    font-weight: 600;
                    vertical-align: middle;
                }

                tbody tr:last-child td { border-bottom: 1.5px solid var(--line); }

                td.c { text-align: center; }
                td.r { text-align: right; }
                td.name { font-weight: 800; font-size: 13px; }
                td.name small {
                    display: block;
                    margin-top: 2px;
                    font-size: 10px;
                    font-weight: 500;
                    color: var(--muted);
                }

                tbody tr { page-break-inside: avoid; }

                /* ---------- totals ---------- */
                .bottom {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    gap: 30px;
                    margin-top: 22px;
                    page-break-inside: avoid;
                }

                .note { flex: 1; max-width: 300px; }

                .note b {
                    display: block;
                    margin-bottom: 4px;
                    font-size: 11px;
                    color: var(--ink);
                }

                .note p {
                    margin: 0;
                    font-size: 11px;
                    line-height: 1.5;
                    color: var(--ink);
                }

                .totals { width: 290px; }

                .totals .line {
                    display: flex;
                    justify-content: space-between;
                    padding: 5px 4px;
                    font-size: 12px;
                    font-weight: 700;
                }

                .totals .line.sub { color: var(--brand); }

                .totals .due {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 10px;
                    padding: 16px 20px;
                    background: var(--brand);
                    color: #ffffff;
                    font-weight: 800;
                }

                .totals .due span { font-size: 14px; letter-spacing: 0.5px; }
                .totals .due strong { font-size: 20px; }

                /* ---------- footer ---------- */
                .foot-line { height: 1.5px; margin-top: 34px; background: var(--brand); }

                .thanks {
                    margin-top: 16px;
                    text-align: center;
                    font-size: 15px;
                    font-weight: 800;
                    color: var(--brand);
                }

                /* ---------- print ---------- */
                @page { size: A4; margin: 10mm; }

                @media print {
                    html, body { width: 100%; margin: 0; padding: 0; background: #ffffff; }
                    .page { max-width: none; padding: 0; }
                }
            </style>
        </head>

        <body>
            <img class="watermark" src="${logos}" alt="" />

            <main class="page">

                <!-- HEADER -->
                <section class="head">
                    <div class="brand">
                        <div class="logo-wrap">
                            <img class="logo" src="${logos}" alt="AKR Communications" />
                        </div>
                    </div>

                    <div class="title">
                        <h2>INVOICE</h2>
                        <p>${dateStr}</p>
                    </div>
                </section>

                <!-- CUSTOMER / BILL DETAILS -->
                <section class="info">
                    <div class="info-block">
                        <h4>Customer Details</h4>
                        <div class="big">${escapeHtml(customerLabel)}</div>
                        ${customerPhoneLabel ? `<p>Phone: ${escapeHtml(customerPhoneLabel)}</p>` : ""}
                    </div>

                    <div class="info-block right">
                        <h4>Bill Details</h4>
                        <div class="info-row"><span>Time</span><strong>${timeStr}</strong></div>
                        <div class="info-row"><span>Attendant</span><strong>${escapeHtml(attendantName)}</strong></div>
                        <div class="info-row"><span>Payment</span><strong>${paymentLabel}</strong></div>
                    </div>
                </section>

                <!-- ITEMS -->
                <table>
                    <thead>
                        <tr>
                            <th>Items Description</th>
                            <th class="c">Unit Price</th>
                            <th class="c">Qnt</th>
                            <th class="r">Total</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <!-- NOTE + TOTALS -->
                <section class="bottom">
                    <div class="note">
                        <b>Amount in Words:</b>
                        <p>${totalInWords}</p>
                    </div>

                    <div class="totals">
                        <div class="line sub">
                            <span>TOTAL ITEMS :</span>
                            <span>${itemCount}</span>
                        </div>

                        <div class="line sub">
                            <span>PAYMENT :</span>
                            <span>${paymentLabel}</span>
                        </div>

                        <div class="due">
                            <span>GRAND TOTAL :</span>
                            <strong>₹${Number(billTotal).toLocaleString("en-IN")}</strong>
                        </div>
                    </div>
                </section>

                <div class="foot-line"></div>

                <!-- FOOTER -->
                <div class="thanks">Thank you for choosing AKR Communications</div>

            </main>
        </body>
        </html>
    `;

        const iframe =
            document.createElement("iframe");

        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";

        iframe.style.width = "0";
        iframe.style.height = "0";

        iframe.style.border = "0";

        iframe.style.visibility = "hidden";

        document.body.appendChild(iframe);

        const iframeDoc =
            iframe.contentWindow?.document ||
            iframe.contentDocument;

        if (!iframeDoc) {
            document.body.removeChild(iframe);
            return;
        }

        iframeDoc.open();

        iframeDoc.write(receiptHtml);

        iframeDoc.close();


        const cleanup = () => {
            if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
        };


        iframe.onload = () => {

            const fontsReady =
                iframe.contentDocument?.fonts?.ready ||
                Promise.resolve();

            // Wait for the Outfit font to load before printing
            Promise.race([
                fontsReady,
                new Promise((resolve) => setTimeout(resolve, 2500)),
            ]).then(() => setTimeout(() => {

                iframe.contentWindow?.focus();

                iframe.contentWindow?.print();

                setTimeout(
                    cleanup,
                    1500
                );

            }, 250));

        };
    }

    /* =====================================================
       RENDER
       ===================================================== */

    const categories = ["All", "Xerox", "Printing", "Lamination", "Photo", "Stationery"];
    const filteredServices = availableServices.filter((s) => {
        const text = `${s.name || ""} ${s.category || ""}`.toLowerCase();
        const category = String(s.category || "").toLowerCase();
        return (activeCategory === "All" || category.includes(activeCategory.toLowerCase()) ||
            (activeCategory === "Printing" && /print/i.test(s.name || ""))) &&
            text.includes(serviceSearch.toLowerCase());
    });
    const dayEntries = Array.isArray(dayStats.entries) ? dayStats.entries : [];
    const serviceSummary = Object.values(
        dayEntries.reduce((acc, entry) => {
            (entry.items || []).forEach((it) => {
                const row = acc[it.name] || { name: it.name, quantity: 0, amount: 0 };
                row.quantity += it.quantity;
                row.amount += it.quantity * it.rate;
                acc[it.name] = row;
            });
            return acc;
        }, {})
    ).sort((a, b) => b.amount - a.amount);
    const detailedTotal = dayEntries.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
    const legacyAmount = Math.max(0, (Number(dayStats.amount) || 0) - detailedTotal);
    const legacyBills = Math.max(0, (Number(dayStats.bills) || 0) - dayEntries.length);
    const hasLegacy = legacyAmount > 0 || legacyBills > 0;
    const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
    const paymentOptions = [
        { id: "cash", label: "Cash", Icon: Banknote },
        { id: "upi", label: "UPI", Icon: Zap },
    ];

    return (
        <div className={`new-transaction-page theme-${theme}`}>
            <div className="nt-main">
                <header className="nt-page-header">
                    <div className="nt-heading"><h1>New Transaction</h1><p>Add services, collect payment and complete the bill</p></div>
                    <div className="nt-header-tools">
                        <label className="nt-search"><Search /><input value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} placeholder="Search services..." /><Search /></label>
                        <div className="nt-date"><CalendarDays /><span>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}<small>{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</small></span></div>
                    </div>
                </header>
                <div className="nt-content-grid">
                    <div className="nt-left-column">
                        <section className="nt-services-panel">
                            <div className="nt-services-head">
                                <div className="nt-section-heading"><span className="nt-heading-icon"><Printer /></span><h2>Services</h2></div>
                                <button type="button" className="nt-add-service-btn" onClick={openAddService}><Plus /></button>
                            </div>
                            <div className="nt-category-tabs">{categories.map((c) => <button type="button" key={c} className={activeCategory === c ? "active" : ""} onClick={() => setActiveCategory(c)}>{c}</button>)}</div>
                            {servicesLoading ? <div className="nt-empty-services">Loading services…</div> : <div className="nt-service-table-wrap">
                                <table className="nt-service-table">
                                    <thead>
                                        <tr><th className="col-sno">S.No</th><th className="col-service">Service</th><th className="col-rate">Rate</th><th className="col-qty">Quantity</th><th className="col-total">Total</th></tr>
                                    </thead>
                                    <tbody>
                                        {filteredServices.map((s, index) => {
                                            const inCart = cart.find((item) => item.id === s.id);
                                            const qtyValue = inCart ? inCart.quantity : 0;
                                            const rateValue = rateOf(s);
                                            return (
                                                <tr key={s.id} className={inCart ? "is-selected" : ""}>
                                                    <td className="col-sno">{index + 1}</td>
                                                    <td className="col-service">
                                                        {s.name}
                                                        {s.custom && <button type="button" className="nt-service-remove" onClick={() => removeCustomService(s)} aria-label={`Remove ${s.name}`} title="Remove this service"><X /></button>}
                                                    </td>
                                                    <td className="col-rate">
                                                        <div className="nt-table-input-wrap"><span>₹</span><input type="text" inputMode="decimal" autoComplete="off" aria-label={`Rate for ${s.name}`} className="nt-table-input" placeholder="0" value={rates[s.id] ?? ""} onChange={(e) => changeRate(s, e.target.value)} onFocus={(e) => e.target.select()} /></div>
                                                    </td>
                                                    <td className="col-qty">
                                                        <input type="text" inputMode="numeric" autoComplete="off" aria-label={`Quantity for ${s.name}`} className="nt-table-input" placeholder="0" value={qtyValue ? String(qtyValue) : ""} onChange={(e) => changeRowQty(s, e.target.value)} onFocus={(e) => e.target.select()} />
                                                    </td>
                                                    <td className="col-total">{qtyValue ? `₹${(rateValue * qtyValue).toLocaleString("en-IN")}` : "—"}</td>
                                                </tr>
                                            );
                                        })}
                                        {!filteredServices.length && <tr><td colSpan={5} className="nt-table-empty">No services found.</td></tr>}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={5} className="nt-table-totals-cell">
                                                <div className="nt-table-totals">
                                                    <div className="nt-total-box">
                                                        <span className="nt-total-label">Per Transaction Total</span>
                                                        <strong className="nt-total-value">₹{Number(total || 0).toLocaleString("en-IN")}</strong>
                                                        <small>{cart.length} {cart.length === 1 ? "service" : "services"} in this bill</small>
                                                    </div>
                                                    <button type="button" className="nt-total-box nt-total-box-day nt-total-clickable" onClick={() => setShowDayPopup(true)} aria-haspopup="dialog">
                                                        <span className="nt-total-label">Per Day Total</span>
                                                        <strong className="nt-total-value">₹{Number(dayStats.amount || 0).toLocaleString("en-IN")}</strong>
                                                        <small>{dayStats.bills} {dayStats.bills === 1 ? "bill" : "bills"} completed today · <b>View details</b></small>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>}
                        </section>
                    </div>
                    <aside className="nt-bill-panel nt-bp">
                        <header className="nt-bp-head">
                            <span className="nt-bp-badge"><ShoppingCart /></span>
                            <div className="nt-bp-title">
                                <h2>Current Bill</h2>
                                <span>{cart.length ? `${cart.length} ${cart.length === 1 ? "service" : "services"} added` : "No services yet"}</span>
                            </div>
                            <button type="button" className="nt-bp-clear" disabled={!cart.length} onClick={() => { setCart([]); setRates({}); }}><Trash2 /> Clear</button>
                        </header>

                        <div className="nt-bp-items">
                            {cart.map((item) => (
                                <div className="nt-bp-item" key={item.id}>
                                    <div className="nt-bp-item-info">
                                        <strong>{item.name}</strong>
                                        <span>₹{Number(item.sellingPrice || 0).toLocaleString("en-IN")} × {item.quantity}</span>
                                    </div>
                                    <strong className="nt-bp-item-total">₹{(Number(item.sellingPrice || 0) * item.quantity).toLocaleString("en-IN")}</strong>
                                    <button type="button" className="nt-bp-item-remove" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.name}`}><X /></button>
                                </div>
                            ))}
                            {!cart.length && (
                                <div className="nt-bp-empty">
                                    <ReceiptText />
                                    <strong>Bill is empty</strong>
                                    <span>Enter a quantity in the table to add a service</span>
                                </div>
                            )}
                        </div>

                        <div className="nt-bp-total">
                            <span>Bill Total</span>
                            <strong>₹{Number(total || 0).toLocaleString("en-IN")}</strong>
                        </div>

                        <section className="nt-bp-section">
                            <h3>Customer</h3>
                            <div className="nt-bp-fields">
                                <label className="nt-bp-field">
                                    <UserRound />
                                    <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" maxLength={60} aria-label="Customer name" />
                                </label>
                                <label className="nt-bp-field">
                                    <Phone />
                                    <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="Phone number" inputMode="tel" aria-label="Phone number" />
                                </label>
                            </div>
                        </section>

                        <section className="nt-bp-section">
                            <h3>Payment</h3>
                            <div className="nt-bp-segment" role="radiogroup" aria-label="Payment method">
                                {paymentOptions.map(({ id, label, Icon }) => (
                                    <button type="button" role="radio" aria-checked={payment === id} key={id} className={payment === id ? "active" : ""} onClick={() => setPayment(id)}>
                                        <Icon /><span>{label}</span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        <div className="nt-bp-actions">
                            {/* <button type="button" className="nt-bp-preview" disabled={!cart.length} onClick={() => setShowBillPreview(true)}><Eye /> Preview &amp; Print</button> */}
                            <button type="button" className="nt-bp-checkout" disabled={!cart.length || saving} onClick={complete}>
                                <ShoppingCart />{saving ? "Processing…" : "Complete Bill"}
                            </button>
                        </div>
                    </aside>
                </div>
            </div>

            {/* =============================================
                BILL PREVIEW / PRINT MODAL
            ============================================= */}

            {showAddService && createPortal(
                <div className={`nt-day-overlay theme-${theme}`} onClick={() => setShowAddService(false)}>
                    <div className="nt-day-modal nt-day-modal-sm" role="dialog" aria-modal="true" aria-label="Add service" onClick={(e) => e.stopPropagation()}>
                        <div className="nt-day-head">
                            <div>
                                <h3>Add Service</h3>
                                <p>It will appear in the services table</p>
                            </div>
                            <button type="button" className="nt-day-close" onClick={() => setShowAddService(false)} aria-label="Close"><X /></button>
                        </div>
                        <div className="nt-day-body">
                            <div className="nt-day-form">
                                <label>
                                    <span>Service Name</span>
                                    <input autoFocus value={newService.name} maxLength={60} placeholder="e.g. Spiral Binding" onChange={(e) => setNewService({ ...newService, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") submitAddService(); }} />
                                </label>
                                <div className="nt-day-form-grid nt-add-service-grid">
                                    <label>
                                        <span>Category</span>
                                        <select value={newService.category} onChange={(e) => setNewService({ ...newService, category: e.target.value })}>
                                            {["General", "Xerox", "Printing", "Lamination", "Photo", "Stationery"].map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </label>
                                    <label>
                                        <span>Cost Price (optional)</span>
                                        <input inputMode="decimal" value={newService.costPrice} placeholder="0" onChange={(e) => setNewService({ ...newService, costPrice: e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 8) })} onKeyDown={(e) => { if (e.key === "Enter") submitAddService(); }} />
                                    </label>
                                </div>
                                <div className="nt-day-form-foot">
                                    <span className="nt-add-service-hint">The rate is typed in the table for each bill.</span>
                                    <div className="nt-day-form-buttons">
                                        <button type="button" className="nt-day-btn" onClick={() => setShowAddService(false)}>Cancel</button>
                                        <button type="button" className="nt-day-btn primary" onClick={submitAddService}>Add Service</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showDayPopup && createPortal(
                <div className={`nt-day-overlay theme-${theme}`} onClick={() => setShowDayPopup(false)}>
                    <div className="nt-day-modal" role="dialog" aria-modal="true" aria-label="Today's transactions" onClick={(e) => e.stopPropagation()}>
                        <div className="nt-day-head">
                            <div>
                                <h3>{editor ? (editor.id === null ? "Add Bill" : "Edit Bill") : "Today's Transactions"}</h3>
                                <p>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}</p>
                            </div>
                            <div className="nt-day-head-actions">
                                {!editor && dayEntries.length > 0 && <button type="button" className="nt-day-btn" onClick={exportDay} title="Download all bills as CSV (opens in Excel)"><Download /> Export</button>}
                                {!editor && dayEntries.length > 0 && <button type="button" className="nt-day-btn" onClick={() => printDay(serviceSummary)} title="Print the day report"><Printer /> Print</button>}
                                {!editor && <button type="button" className="nt-day-add" onClick={openNewBill}><Plus /> Add Bill</button>}
                                <button type="button" className="nt-day-close" onClick={() => setShowDayPopup(false)} aria-label="Close"><X /></button>
                            </div>
                        </div>
                        <div className="nt-day-body">
                            {editor ? (
                                <div className="nt-day-form">
                                    <div className="nt-day-form-grid">
                                        <label><span>Customer Name</span><input value={editor.customer} maxLength={60} placeholder="Optional" onChange={(e) => setEditor({ ...editor, customer: e.target.value })} /></label>
                                        <label><span>Payment</span>
                                            <select value={editor.payment} onChange={(e) => setEditor({ ...editor, payment: e.target.value })}>
                                                <option value="cash">Cash</option>
                                                <option value="upi">UPI</option>
                                            </select>
                                        </label>
                                    </div>

                                    <datalist id="nt-day-service-names">
                                        {availableServices.map((svc) => <option key={svc.id} value={svc.name} />)}
                                    </datalist>

                                    <div className="nt-day-form-items">
                                        <div className="nt-day-form-row nt-day-form-row-head"><span>Service</span><span>Rate</span><span>Qty</span><span>Total</span><span /></div>
                                        {editor.items.map((it, i) => (
                                            <div className="nt-day-form-row" key={i}>
                                                <input list="nt-day-service-names" value={it.name} placeholder="Service name" aria-label="Service" onChange={(e) => patchEditorItem(i, { name: e.target.value })} />
                                                <input inputMode="decimal" value={it.rate} placeholder="0" aria-label="Rate" onChange={(e) => patchEditorItem(i, { rate: e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 8) })} />
                                                <input inputMode="numeric" value={it.quantity} placeholder="0" aria-label="Quantity" onChange={(e) => patchEditorItem(i, { quantity: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
                                                <strong className="nt-day-form-line">{money((Number(it.rate) || 0) * (parseInt(it.quantity, 10) || 0))}</strong>
                                                <button type="button" className="nt-day-icon-btn danger" onClick={() => removeEditorItem(i)} disabled={editor.items.length === 1} aria-label="Remove service"><Trash2 /></button>
                                            </div>
                                        ))}
                                        <button type="button" className="nt-day-link-btn" onClick={addEditorItem}><Plus /> Add service</button>
                                    </div>

                                    <div className="nt-day-form-foot">
                                        <div className="nt-day-form-total"><span>Bill Total</span><strong>{money(editor.items.reduce((sum, it) => sum + (Number(it.rate) || 0) * (parseInt(it.quantity, 10) || 0), 0))}</strong></div>
                                        <div className="nt-day-form-buttons">
                                            <button type="button" className="nt-day-btn" onClick={() => setEditor(null)}>Cancel</button>
                                            <button type="button" className="nt-day-btn primary" onClick={saveEditor}>{editor.id === null ? "Add Bill" : "Save Changes"}</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                            <>
                            <div className="nt-day-stats">
                                <div><span>Day Total</span><strong>{money(dayStats.amount)}</strong></div>
                                <div><span>Bills</span><strong>{dayStats.bills}</strong></div>
                            </div>

                            {hasLegacy && (
                                <div className="nt-day-legacy">
                                    <div>
                                        <strong>{legacyBills} {legacyBills === 1 ? "bill" : "bills"} · {money(legacyAmount)} without service details</strong>
                                        <span>Completed before details were saved, so they cannot be listed below.</span>
                                    </div>
                                    <button type="button" className="nt-day-btn danger" onClick={clearUnrecordedBills}><Trash2 /> Delete</button>
                                </div>
                            )}

                            {dayEntries.length === 0 ? (
                                !hasLegacy && <div className="nt-day-empty">No transactions completed today yet.</div>
                            ) : (
                                <>
                                    <h4>Service-wise summary</h4>
                                    <table className="nt-day-table">
                                        <thead><tr><th>S.No</th><th>Service</th><th className="num">Qty</th><th className="num">Amount</th></tr></thead>
                                        <tbody>
                                            {serviceSummary.map((row, i) => (
                                                <tr key={row.name}><td>{i + 1}</td><td>{row.name}</td><td className="num">{row.quantity}</td><td className="num">{money(row.amount)}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <h4>Bills</h4>
                                    {[...dayEntries].reverse().map((entry, i) => (
                                        <div className="nt-day-bill" key={entry.id}>
                                            <div className="nt-day-bill-head">
                                                <strong>Bill #{dayEntries.length - i}</strong>
                                                <span>{new Date(entry.time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {String(entry.payment || "").toUpperCase()}{entry.customer ? ` · ${entry.customer}` : ""}</span>
                                                <strong className="nt-day-bill-total">{money(entry.total)}</strong>
                                                <span className="nt-day-bill-actions">
                                                    <button type="button" className="nt-day-icon-btn" onClick={() => printBill(entry)} aria-label="Print bill" title="Print"><Printer /></button>
                                                    <button type="button" className="nt-day-icon-btn" onClick={() => exportBill(entry)} aria-label="Export bill" title="Export CSV"><Download /></button>
                                                    <button type="button" className="nt-day-icon-btn" onClick={() => openEditBill(entry)} aria-label="Edit bill" title="Edit"><Pencil /></button>
                                                    <button type="button" className="nt-day-icon-btn danger" onClick={() => deleteBill(entry)} disabled={deletingBillId === entry.id} aria-label="Delete bill" title="Delete"><Trash2 /></button>
                                                </span>
                                            </div>
                                            <table className="nt-day-table">
                                                <thead><tr><th>Service</th><th className="num">Rate</th><th className="num">Qty</th><th className="num">Total</th></tr></thead>
                                                <tbody>
                                                    {(entry.items || []).map((it, k) => (
                                                        <tr key={k}><td>{it.name}</td><td className="num">{money(it.rate)}</td><td className="num">{it.quantity}</td><td className="num">{money(it.rate * it.quantity)}</td></tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                </>
                            )}
                            </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showBillPreview && createPortal(
                <div
                    className="bill-modal-overlay"
                    onClick={() =>
                        setShowBillPreview(false)
                    }
                >

                    <div
                        className="bill-modal"
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                    >

                        <div className="bill-modal-header">

                            <div className="bill-modal-header-left">
                                <ReceiptText size={16} />
                                <span>Bill Preview</span>
                            </div>

                            <button
                                type="button"
                                className="bill-modal-close"
                                onClick={() =>
                                    setShowBillPreview(false)
                                }
                            >
                                <X size={16} />
                            </button>

                        </div>


                        <div className="bill-receipt" id="bill-receipt">

                            <div className="receipt-shop">

                                <div className="receipt-shop-icon">
                                    <img src={logos} id="logoss" alt="" />
                                </div>

                                <span>
                                    Sale Receipt
                                </span>

                            </div>


                            <div className="receipt-customer">
                                <span>Customer Name</span>
                                <strong>
                                    {customerName.trim() ||
                                        "Walk-in Customer"}
                                </strong>
                            </div>


                            <div className="receipt-meta">

                                <div>
                                    <span>Date</span>
                                    <strong>
                                        {new Date().toLocaleDateString(
                                            "en-IN",
                                            {
                                                day: "2-digit",
                                                month: "short",
                                                year: "numeric",
                                            }
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>Time</span>
                                    <strong>
                                        {new Date().toLocaleTimeString(
                                            "en-IN",
                                            {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            }
                                        )}
                                    </strong>
                                </div>

                                <div>
                                    <span>Attendant</span>
                                    <strong>
                                        {profile?.name ||
                                            user?.displayName ||
                                            "Attendant"}
                                    </strong>
                                </div>

                            </div>


                            <div className="receipt-divider" />


                            <div className="receipt-items">

                                <div className="receipt-items-head">
                                    <span>Item</span>
                                    <span>Qty</span>
                                    <span>Rate</span>
                                    <span>Amount</span>
                                </div>

                                {cart.map((item) => (
                                    <div
                                        className="receipt-item-row"
                                        key={item.id}
                                    >
                                        <span className="receipt-item-name">
                                            {item.name}
                                        </span>

                                        <span>
                                            {item.quantity}
                                        </span>

                                        <span>
                                            ₹
                                            {Number(
                                                item.sellingPrice
                                            ).toLocaleString(
                                                "en-IN"
                                            )}
                                        </span>

                                        <span>
                                            ₹
                                            {(
                                                Number(
                                                    item.sellingPrice
                                                ) *
                                                item.quantity
                                            ).toLocaleString(
                                                "en-IN"
                                            )}
                                        </span>
                                    </div>
                                ))}

                                {!cart.length && (
                                    <div className="receipt-empty">
                                        No items added yet.
                                    </div>
                                )}

                            </div>


                            <div className="receipt-divider" />


                            <div className="receipt-totals">

                                <div>
                                    <span>Items</span>
                                    <span>
                                        {cart.reduce(
                                            (sum, item) =>
                                                sum +
                                                item.quantity,
                                            0
                                        )}
                                    </span>
                                </div>

                                <div>
                                    <span>Payment</span>
                                    <span>
                                        {payment === "cash"
                                            ? "Cash"
                                            : payment.toUpperCase()}
                                    </span>
                                </div>

                                <div className="receipt-grand-total">
                                    <span>Grand Total</span>
                                    <strong>
                                        ₹
                                        {Number(
                                            total
                                        ).toLocaleString(
                                            "en-IN"
                                        )}
                                    </strong>
                                </div>

                            </div>


                            <div className="receipt-footer">
                                <span>
                                    Thank you for your visit!
                                </span>
                                <span>
                                    Secure transaction •
                                    Firebase protected
                                </span>
                            </div>

                        </div>


                        <div className="bill-modal-actions">

                            <button
                                type="button"
                                className="bill-modal-secondary"
                                onClick={() =>
                                    setShowBillPreview(false)
                                }
                            >
                                Close
                            </button>

                            <button
                                type="button"
                                className="bill-modal-primary"
                                disabled={!cart.length}
                                onClick={() => printReceipt()}
                            >
                                <Printer size={15} />
                                Print Bill
                            </button>

                        </div>

                    </div>

                </div>,
                document.body
            )}

        </div>
    );
}