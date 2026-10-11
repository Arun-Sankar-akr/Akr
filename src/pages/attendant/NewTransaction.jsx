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
    CalendarDays, LayoutDashboard, ClipboardList, Users, BarChart3,
    Settings, FileText, Search, Flame, UserRound, Banknote, CreditCard, Wallet, Tag,
} from "lucide-react";
import { Link } from "react-router-dom";

import ServiceSelector from "../../components/billing/ServiceSelector";
import PaymentSelector from "../../components/billing/PaymentSelector";
import BillSummary from "../../components/billing/BillSummary";

import useServices from "../../hooks/useServices";
import { createTransaction } from "../../services/transactionService";
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
   QUANTITY BOX — type the quantity directly, or use - / +
   ========================================================= */

function QtyInput({ value, onChange }) {
    const [draft, setDraft] = useState(String(value));

    // keep the box in sync when the +/- buttons change the quantity
    useEffect(() => {
        setDraft(String(value));
    }, [value]);

    function handleChange(event) {
        const digits = event.target.value
            .replace(/\D/g, "")
            .slice(0, 5);

        setDraft(digits);

        const next = parseInt(digits, 10);

        if (next > 0) {
            onChange(next);
        }
    }

    function handleBlur() {
        // empty or 0 -> go back to the last valid quantity
        setDraft(String(value));
    }

    return (
        <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Quantity"
            className="nt-qty-input"
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.currentTarget.blur();
                }
            }}
        />
    );
}

/* =========================================================
   PAGE
   ========================================================= */

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

    // Normalize the Firebase service schema used by AdminDashboard.
    // Admin stores the live rate as `price` + `profit`; billing uses
    // `sellingPrice` + `costPrice`. Keeping this mapping here makes both
    // screens use the same Firebase service/rate source.
    const availableServices = useMemo(() => {
        const source =
            Array.isArray(services) && services.length > 0
                ? services
                : defaultServices;

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
    }, [services]);

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

    function add(service) {
        setCart((current) => {
            const existing =
                current.find(
                    (item) =>
                        item.id === service.id
                );

            if (existing) {
                return current.map(
                    (item) =>
                        item.id === service.id
                            ? {
                                ...item,
                                quantity:
                                    item.quantity + 1,
                            }
                            : item
                );
            }

            return [
                ...current,
                {
                    ...service,
                    quantity: 1,
                },
            ];
        });
    }

    /* =====================================================
       CHANGE QUANTITY
       ===================================================== */

    function qty(id, delta) {
        setCart((current) =>
            current
                .map((item) =>
                    item.id === id
                        ? {
                            ...item,
                            quantity: Math.max(
                                0,
                                item.quantity + delta
                            ),
                        }
                        : item
                )
                .filter(
                    (item) =>
                        item.quantity > 0
                )
        );
    }

    /* =====================================================
       SET QUANTITY (typed manually)
       ===================================================== */

    function setQty(id, value) {
        const quantity = Math.max(1, Math.floor(Number(value) || 0));

        setCart((current) =>
            current.map((item) =>
                item.id === id
                    ? { ...item, quantity }
                    : item
            )
        );
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

            await createTransaction(
                transactionData
            );

            console.log(
                "TRANSACTION SAVED SUCCESSFULLY"
            );

            alert(
                "Sale completed successfully."
            );

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

    function printReceipt() {
        if (!cart.length) {
            return;
        }

        const now = new Date();

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
            customerName.trim() ||
            "Walk-in Customer";

        const itemCount = cart.reduce(
            (sum, item) =>
                sum + Number(item.quantity || 0),
            0
        );

        const paymentLabel =
            payment === "cash"
                ? "Cash"
                : payment.toUpperCase();

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

        const totalInWords = amountInWords(total);

        const rowsHtml = cart
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
            String(customerPhone || "").trim();

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
                            <strong>₹${Number(total).toLocaleString("en-IN")}</strong>
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
    const serviceEmoji = (s) => {
        const t = `${s.name || ""} ${s.category || ""}`.toLowerCase();
        if (/xerox|black|b&w/.test(t)) return "🖨️";
        if (/color|printout/.test(t)) return "🖼️";
        if (/lamination/.test(t)) return "📄";
        if (/photo/.test(t)) return "📸";
        if (/pen/.test(t)) return "🖊️";
        return "📦";
    };
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
                            <div className="nt-section-heading"><span className="nt-heading-icon"><Printer /></span><h2>Services</h2></div>
                            <div className="nt-category-tabs">{categories.map((c) => <button type="button" key={c} className={activeCategory === c ? "active" : ""} onClick={() => setActiveCategory(c)}>{c}</button>)}</div>
                            {servicesLoading ? <div className="nt-empty-services">Loading services…</div> : <div className="nt-service-grid">
                                {filteredServices.map((s) => <button type="button" className="nt-service-card" key={s.id} onClick={() => add(s)}>
                                    <span className="nt-service-art">{serviceEmoji(s)}</span><strong>{s.name}</strong>
                                    <span className="nt-service-price">₹{Number(s.sellingPrice || 0).toLocaleString("en-IN")} <small>/ {s.unit || "unit"}</small></span><span className="nt-add-service"><Plus /></span>
                                </button>)}
                                {!filteredServices.length && <div className="nt-empty-services">No services found.</div>}
                            </div>}
                        </section>
                    </div>
                    <aside className="nt-bill-panel">
                        <div className="nt-bill-heading"><div className="nt-section-heading"><span className="nt-heading-icon"><ShoppingCart /></span><h2>Current Bill</h2></div><button type="button" className="nt-clear-all" disabled={!cart.length} onClick={() => setCart([])}><Trash2 /> Clear All</button></div>
                        <div className="nt-bill-items">{cart.map((item) => <div className="nt-bill-row" key={item.id}>
                            <div className="nt-bill-item-art">{serviceEmoji(item)}</div><div className="nt-bill-item-info"><strong>{item.name}</strong><span>₹{Number(item.sellingPrice || 0).toLocaleString("en-IN")} / {item.unit || "unit"}</span></div>
                            <div className="nt-qty-control"><button type="button" onClick={() => qty(item.id, -1)}><Minus /></button><QtyInput value={item.quantity} onChange={(value) => setQty(item.id, value)} /><button type="button" onClick={() => qty(item.id, 1)}><Plus /></button></div>
                            <strong className="nt-line-total">₹{(Number(item.sellingPrice || 0) * item.quantity).toLocaleString("en-IN")}</strong><button type="button" className="nt-remove-item" onClick={() => removeItem(item.id)}><Trash2 /></button>
                        </div>)}{!cart.length && <div className="nt-empty-cart"><ShoppingCart /><strong>Your bill is empty</strong><span>Add a service to begin</span></div>}</div>
                        <section className="nt-customer-panel nt-customer-panel-bill">
                            <div className="nt-section-heading"><span className="nt-heading-icon"><UserRound /></span><h2>Customer Details</h2></div>
                            <div className="nt-customer-fields"><label><span>Customer Name</span><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter customer name" maxLength={60} /></label><label><span>Phone Number</span><input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="Enter phone number" inputMode="tel" /></label><button type="button" className="nt-add-customer" onClick={() => document.querySelector(".nt-customer-panel-bill .nt-customer-fields input")?.focus()}><Plus /> Add</button></div>
                        </section>
                        <button type="button" className="nt-preview-button" disabled={!cart.length} onClick={() => setShowBillPreview(true)}><Eye /> Preview &amp; Print Bill</button>
                        <div className="nt-payment"><div className="nt-payment-title"><UserRound /><strong>Payment Method</strong></div><div className="nt-payment-options">{paymentOptions.map(({ id, label, Icon }) => <button type="button" key={id} className={payment === id ? "active" : ""} onClick={() => setPayment(id)}><Icon /><span>{label}</span></button>)}<button type="button" className="nt-checkout-button" disabled={!cart.length || saving} onClick={complete}><ShoppingCart />{saving ? "Processing…" : "Checkout"}</button></div></div>
                    </aside>
                </div>
            </div>

            {/* =============================================
                BILL PREVIEW / PRINT MODAL
            ============================================= */}

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
                                onClick={printReceipt}
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