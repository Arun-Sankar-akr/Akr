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
} from "lucide-react";
import { Link } from "react-router-dom";

import ServiceSelector from "../../components/billing/ServiceSelector";
import PaymentSelector from "../../components/billing/PaymentSelector";
import BillSummary from "../../components/billing/BillSummary";

import useServices from "../../hooks/useServices";
import { createTransaction } from "../../services/transactionService";
import { useAuth } from "../../context/AuthContext";
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

    const [cart, setCart] = useState([]);

    const [payment, setPayment] =
        useState("cash");

    const [saving, setSaving] =
        useState(false);

    const [showBillPreview, setShowBillPreview] =
        useState(false);

    const [customerName, setCustomerName] =
        useState("");

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

        const rowsHtml = cart
            .map((item, index) => {
                const rate =
                    Number(item.sellingPrice) || 0;

                const quantity =
                    Number(item.quantity) || 0;

                const amount =
                    rate * quantity;

                return `
                <tr>
                    <td class="item-number">
                        ${String(index + 1).padStart(2, "0")}
                    </td>

                    <td class="item-name">
                        ${escapeHtml(item.name)}
                    </td>

                    <td class="num">
                        ${quantity}
                    </td>

                    <td class="num">
                        ₹${rate.toLocaleString("en-IN")}
                    </td>

                    <td class="num amount">
                        ₹${amount.toLocaleString("en-IN")}
                    </td>
                </tr>
            `;
            })
            .join("");

        const receiptHtml = `
        <!DOCTYPE html>

        <html lang="en">

        <head>

            <meta charset="utf-8" />

            <meta
                name="viewport"
                content="width=device-width, initial-scale=1"
            />

            <title>AKR Communications - Sale Receipt</title>

            <style>

                * {
                    box-sizing: border-box;
                }

                html,
                body {
                    margin: 0;
                    padding: 0;
                }

                body {
                    background: #ffffff;

                    color: #05080f;

                    font-family:
                        Inter,
                        Arial,
                        Helvetica,
                        sans-serif;

                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                .receipt-page {
                    width: 100%;

                    max-width: 820px;

                    margin: 0 auto;

                    padding: 30px 36px 40px;

                    background: #ffffff;
                }


                /* =========================================
                   TOP BRAND
                   ========================================= */

                .brand {
                    display: flex;

                    align-items: center;
                    justify-content: space-between;

                    gap: 25px;

                    padding-bottom: 25px;

                    border-bottom: 1px solid #9aa3b2;
                }

                .brand-left {
                    display: flex;

                    align-items: center;

                    gap: 18px;
                }

                .brand-logo-wrap {
                    width: 82px;
                    height: 82px;

                    display: flex;

                    align-items: center;
                    justify-content: center;

                    padding: 8px;

                    background: #ffffff;

                    border: 1px solid #9aa3b2;

                    border-radius: 18px;

                    box-shadow:
                        0 8px 20px
                        rgba(15, 23, 42, 0.07);
                }

                .brand-logo {
                    width: 100%;
                    height: 100%;

                    object-fit: contain;
                }

                .brand-name {
                    margin: 0;

                    color: #000000;

                    font-size: 35px;

                    line-height: 1.1;

                    font-weight: 800;

                    letter-spacing: -0.04em;
                }

                .brand-subtitle {
                    margin-top: 6px;

                    color: #2f3a4d;

                    font-size: 14px;

                    font-weight: 600;

                    letter-spacing: 0.08em;

                    text-transform: uppercase;
                }


                /* =========================================
                   RECEIPT LABEL
                   ========================================= */

                .receipt-label {
                    text-align: right;
                }

                .receipt-label span {
                    display: block;

                    color: #312e81;

                    font-size: 13px;

                    font-weight: 800;

                    letter-spacing: 0.15em;

                    text-transform: uppercase;
                }

                .receipt-label strong {
                    display: block;

                    margin-top: 6px;

                    color: #000000;

                    font-size: 23px;

                    font-weight: 800;
                }


                /* =========================================
                   META
                   ========================================= */

                .receipt-meta {
                    display: grid;

                    grid-template-columns:
                        repeat(3, minmax(0, 1fr));

                    gap: 12px;

                    margin-top: 22px;
                }

                .customer-card {
                    grid-column: 1 / -1;
                }

                .customer-card .meta-value {
                    font-size: 22px;
                }

                .meta-card {
                    padding: 13px 15px;

                    background: #eceff5;

                    border: 1px solid #b7bfcc;

                    border-radius: 12px;
                }

                .meta-label {
                    display: block;

                    color: #475569;

                    font-size: 12px;

                    font-weight: 800;

                    letter-spacing: 0.09em;

                    text-transform: uppercase;
                }

                .meta-value {
                    display: block;

                    margin-top: 5px;

                    color: #0b1220;

                    font-size: 16px;

                    font-weight: 700;
                }


                /* =========================================
                   SECTION TITLE
                   ========================================= */

                .items-section {
                    margin-top: 28px;
                }

                .section-heading {
                    display: flex;

                    align-items: center;
                    justify-content: space-between;

                    margin-bottom: 10px;
                }

                .section-heading strong {
                    color: #05080f;

                    font-size: 16px;

                    font-weight: 800;

                    letter-spacing: 0.04em;

                    text-transform: uppercase;
                }

                .section-heading span {
                    color: #475569;

                    font-size: 13px;

                    font-weight: 600;
                }


                /* =========================================
                   TABLE
                   ========================================= */

                .items-table {
                    width: 100%;

                    border-collapse: separate;

                    border-spacing: 0;

                    overflow: hidden;

                    border: 1px solid #9aa3b2;

                    border-radius: 14px;
                }

                .items-table thead th {
                    padding: 12px 13px;

                    background: #dfe4ee;

                    color: #2f3a4d;

                    border-bottom: 1px solid #8b95a7;

                    font-size: 12px;

                    font-weight: 800;

                    letter-spacing: 0.07em;

                    text-align: left;

                    text-transform: uppercase;
                }

                .items-table thead th:first-child {
                    width: 52px;

                    text-align: center;
                }

                .items-table th.num {
                    text-align: right;
                }

                .items-table tbody td {
                    padding: 13px;

                    border-bottom: 1px solid #b7bfcc;

                    color: #0b1220;

                    font-size: 16px;

                    font-weight: 500;
                }

                .items-table tbody tr:last-child td {
                    border-bottom: none;
                }

                .item-number {
                    color: #475569;

                    text-align: center;

                    font-size: 13px !important;

                    font-weight: 700 !important;
                }

                .item-name {
                    color: #05080f !important;

                    font-weight: 700 !important;
                }

                .items-table td.num {
                    text-align: right;

                    white-space: nowrap;
                }

                .items-table td.amount {
                    color: #05080f;

                    font-weight: 800;
                }


                /* =========================================
                   SUMMARY
                   ========================================= */

                .summary-area {
                    display: flex;

                    justify-content: flex-end;

                    margin-top: 18px;
                }

                .summary-box {
                    width: 390px;

                    padding: 17px;

                    background: #eceff5;

                    border: 1px solid #9aa3b2;

                    border-radius: 15px;
                }

                .summary-row {
                    display: flex;

                    align-items: center;
                    justify-content: space-between;

                    padding: 6px 0;

                    color: #2f3a4d;

                    font-size: 14px;
                }

                .summary-row strong {
                    color: #0b1220;

                    font-weight: 700;
                }

                .summary-total {
                    display: flex;

                    align-items: center;
                    justify-content: space-between;

                    margin-top: 10px;

                    padding-top: 14px;

                    border-top: 1px solid #8b95a7;
                }

                .summary-total span {
                    color: #05080f;

                    font-size: 17px;

                    font-weight: 800;
                }

                .summary-total strong {
                    color: #312e81;

                    font-size: 27px;

                    font-weight: 900;
                }


                /* =========================================
                   PAYMENT STATUS
                   ========================================= */

                .payment-status {
                    display: flex;

                    align-items: center;

                    justify-content: center;

                    gap: 8px;

                    margin-top: 20px;

                    padding: 10px 14px;

                    background: #dcf5e4;

                    border: 1px solid #7fc79a;

                    border-radius: 10px;

                    color: #0b5a2c;

                    font-size: 13px;

                    font-weight: 800;

                    letter-spacing: 0.05em;

                    text-transform: uppercase;
                }

                .payment-dot {
                    width: 7px;
                    height: 7px;

                    border-radius: 50%;

                    background: #22c55e;
                }


                /* =========================================
                   FOOTER
                   ========================================= */

                .receipt-footer {
                    margin-top: 32px;

                    padding-top: 20px;

                    border-top: 1px dashed #6b7587;

                    text-align: center;
                }

                .footer-thanks {
                    color: #05080f;

                    font-size: 17px;

                    font-weight: 800;
                }

                .footer-sub {
                    margin-top: 6px;

                    color: #475569;

                    font-size: 13px;

                    line-height: 1.6;
                }

                .footer-brand {
                    margin-top: 13px;

                    color: #312e81;

                    font-size: 12px;

                    font-weight: 800;

                    letter-spacing: 0.12em;

                    text-transform: uppercase;
                }


                /* =========================================
                   PRINT
                   ========================================= */

                @page {
                    size: A4;
                    margin: 12mm;
                }

                @media print {

                    html,
                    body {
                        width: 100%;

                        margin: 0;

                        padding: 0;

                        background: #ffffff;
                    }

                    .receipt-page {
                        max-width: none;

                        padding: 0;

                        margin: 0;
                    }

                    .items-table {
                        page-break-inside: auto;
                    }

                    .items-table tr {
                        page-break-inside: avoid;
                    }

                    .summary-box {
                        page-break-inside: avoid;
                    }

                    .receipt-footer {
                        page-break-inside: avoid;
                    }
                }

            </style>

        </head>

        <body>

            <main class="receipt-page">

                <!-- BRAND HEADER -->

                <section class="brand">

                    <div class="brand-left">

                        <div class="brand-logo-wrap">

                            <img
                                class="brand-logo"
                                src="${logos}"
                                alt="AKR Communications"
                            />

                        </div>

                        <div>

                            <h1 class="brand-name">
                                AKR Communications
                            </h1>

                            <div class="brand-subtitle">
                                Digital Services &amp; Printing
                            </div>

                        </div>

                    </div>


                    <div class="receipt-label">

                        <span>Official</span>

                        <strong>
                            SALES RECEIPT
                        </strong>

                    </div>

                </section>


                <!-- META -->

                <section class="receipt-meta">

                    <div class="meta-card customer-card">

                        <span class="meta-label">
                            Customer Name
                        </span>

                        <span class="meta-value">
                            ${escapeHtml(customerLabel)}
                        </span>

                    </div>


                    <div class="meta-card">

                        <span class="meta-label">
                            Date
                        </span>

                        <span class="meta-value">
                            ${dateStr}
                        </span>

                    </div>


                    <div class="meta-card">

                        <span class="meta-label">
                            Time
                        </span>

                        <span class="meta-value">
                            ${timeStr}
                        </span>

                    </div>


                    <div class="meta-card">

                        <span class="meta-label">
                            Attendant
                        </span>

                        <span class="meta-value">
                            ${escapeHtml(attendantName)}
                        </span>

                    </div>

                </section>


                <!-- ITEMS -->

                <section class="items-section">

                    <div class="section-heading">

                        <strong>
                            Transaction Details
                        </strong>

                        <span>
                            ${itemCount} item${itemCount !== 1 ? "s" : ""}
                        </span>

                    </div>


                    <table class="items-table">

                        <thead>

                            <tr>

                                <th>#</th>

                                <th>
                                    Item / Service
                                </th>

                                <th class="num">
                                    Qty
                                </th>

                                <th class="num">
                                    Rate
                                </th>

                                <th class="num">
                                    Amount
                                </th>

                            </tr>

                        </thead>

                        <tbody>

                            ${rowsHtml}

                        </tbody>

                    </table>

                </section>


                <!-- SUMMARY -->

                <section class="summary-area">

                    <div class="summary-box">

                        <div class="summary-row">

                            <span>
                                Total Items
                            </span>

                            <strong>
                                ${itemCount}
                            </strong>

                        </div>


                        <div class="summary-row">

                            <span>
                                Payment Method
                            </span>

                            <strong>
                                ${paymentLabel}
                            </strong>

                        </div>


                        <div class="summary-total">

                            <span>
                                GRAND TOTAL
                            </span>

                            <strong>
                                ₹${Number(total).toLocaleString("en-IN")}
                            </strong>

                        </div>

                    </div>

                </section>


                <!-- PAYMENT -->

                <div class="payment-status">

                    <span class="payment-dot"></span>

                    Payment received · ${paymentLabel}

                </div>


                <!-- FOOTER -->

                <footer class="receipt-footer">

                    <div class="footer-thanks">
                        Thank you for choosing AKR Communications
                    </div>

                    <div class="footer-sub">
                        We appreciate your business.<br />
                        Please retain this receipt for your records.
                    </div>

                    <div class="footer-brand">
                        AKR Communications
                    </div>

                </footer>

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

            setTimeout(() => {

                iframe.contentWindow?.focus();

                iframe.contentWindow?.print();

                setTimeout(
                    cleanup,
                    1500
                );

            }, 250);

        };
    }

    /* =====================================================
       RENDER
       ===================================================== */

    return (
        <div className="new-transaction-page">

            {/* =============================================
                TOP NAVIGATION
            ============================================= */}

            <header className="transaction-topbar">

                <div className="transaction-topbar-left">

                    <Link
                        to="/attendant"
                        className="transaction-back"
                    >
                        <ArrowLeft size={17} />
                    </Link>

                    <div className="transaction-title-wrap">

                        <div className="transaction-eyebrow">
                            <span className="eyebrow-dot" />
                            AKR Communications
                        </div>

                        <h1>
                            New Transaction
                        </h1>

                        <p>
                            Create a quick bill and
                            complete the customer order.
                        </p>

                    </div>

                </div>

                <div className="transaction-topbar-right">

                    <div className="topbar-status">
                        <span className="status-live" />
                        Counter Active
                    </div>

                    <div className="topbar-user">
                        <div className="topbar-avatar">
                            {(
                                profile?.name ||
                                user?.email ||
                                "A"
                            )
                                .charAt(0)
                                .toUpperCase()}
                        </div>

                        <div>
                            <strong>
                                {profile?.name ||
                                    user?.displayName ||
                                    "Attendant"}
                            </strong>

                            <span>
                                {role || "Attendant"}
                            </span>
                        </div>
                    </div>

                </div>

            </header>


            {/* =============================================
                QUICK STATS
            ============================================= */}

            <div className="transaction-overview">

                <div className="overview-card">

                    <div className="overview-icon purple">
                        <Zap size={19} />
                    </div>

                    <div>
                        <span>
                            Billing Mode
                        </span>

                        <strong>
                            Fast Checkout
                        </strong>
                    </div>

                </div>

                <div className="overview-card">

                    <div className="overview-icon blue">
                        <ShoppingCart size={19} />
                    </div>

                    <div>
                        <span>
                            Current Items
                        </span>

                        <strong>
                            {cart.reduce(
                                (sum, item) =>
                                    sum +
                                    item.quantity,
                                0
                            )}
                        </strong>
                    </div>

                </div>

                <div className="overview-card">

                    <div className="overview-icon green">
                        <ReceiptText size={19} />
                    </div>

                    <div>
                        <span>
                            Current Total
                        </span>

                        <strong>
                            ₹
                            {Number(total).toLocaleString(
                                "en-IN"
                            )}
                        </strong>
                    </div>

                </div>

                <div className="overview-card">

                    <div className="overview-icon orange">
                        <ShieldCheck size={19} />
                    </div>

                    <div>
                        <span>
                            Payment
                        </span>

                        <strong>
                            {payment === "cash"
                                ? "Cash"
                                : payment.toUpperCase()}
                        </strong>
                    </div>

                </div>

            </div>


            {/* =============================================
                SERVICE ERROR
            ============================================= */}

            {!servicesLoading &&
                servicesError && (
                    <div className="service-alert">

                        <div className="service-alert-icon">
                            <AlertCircle size={19} />
                        </div>

                        <div className="service-alert-content">

                            <strong>
                                Using default services
                            </strong>

                            <p>
                                Firebase services could not
                                be loaded, so the available
                                default shop services are
                                being displayed.
                            </p>

                        </div>

                    </div>
                )}


            {/* =============================================
                MAIN BILLING AREA
            ============================================= */}

            <main className="transaction-workspace">

                {/* =========================================
                    LEFT — SERVICES
                ========================================= */}

                <section className="services-workspace">

                    <div className="workspace-heading">

                        <div>

                            <div className="section-kicker">
                                <Sparkles size={14} />
                                SERVICES
                            </div>

                            <h2>
                                Choose a service
                            </h2>

                            <p>
                                Select a service below to
                                instantly add it to the bill.
                            </p>

                        </div>

                        <div className="service-count">
                            <strong>
                                {availableServices.length}
                            </strong>

                            <span>
                                Available
                            </span>
                        </div>

                    </div>


                    <div className="service-selector-shell">

                        <ServiceSelector
                            services={
                                availableServices
                            }
                            onAdd={add}
                        />

                    </div>


                    {/* SERVICE FOOTER */}

                    <div className="service-helper">

                        <div className="helper-icon">
                            <Zap size={17} />
                        </div>

                        <div>

                            <strong>
                                Quick billing
                            </strong>

                            <span>
                                Tap any service to add it.
                                Tap again to increase quantity.
                            </span>

                        </div>

                        <ChevronRight
                            size={17}
                        />

                    </div>

                </section>


                {/* =========================================
                    RIGHT — BILL
                ========================================= */}

                <aside className="checkout-panel">

                    <div className="checkout-header">

                        <div>

                            <div className="checkout-label">
                                CURRENT ORDER
                            </div>

                            <h2>
                                Your Bill
                            </h2>

                            <span>
                                {cart.length
                                    ? `${cart.length} service${cart.length >
                                        1
                                        ? "s"
                                        : ""
                                    } added`
                                    : "No services added yet"}
                            </span>

                        </div>

                        <div className="receipt-icon">
                            <ReceiptText
                                size={21}
                            />
                        </div>

                    </div>


                    <div className="checkout-divider" />


                    {/* CART */}

                    <div className="checkout-cart">

                        {cart.map((item) => (
                            <CartRow
                                key={item.id}
                                item={item}
                                onQty={qty}
                                onSetQty={setQty}
                                onRemove={removeItem}
                            />
                        ))}

                    </div>


                    {/* PAYMENT */}

                    <div className="checkout-payment">

                        <div className="checkout-section-title">

                            <span>
                                Payment method
                            </span>

                            <small>
                                Select one
                            </small>

                        </div>

                        <PaymentSelector
                            value={payment}
                            onChange={
                                setPayment
                            }
                        />

                    </div>


                    {/* CUSTOMER */}

                    <div className="checkout-customer">

                        <div className="checkout-section-title">

                            <span>
                                Customer name
                            </span>

                            <small>
                                Shown on the bill
                            </small>

                        </div>

                        <input
                            type="text"
                            className="customer-input"
                            placeholder="Enter customer name"
                            value={customerName}
                            maxLength={60}
                            onChange={(event) =>
                                setCustomerName(
                                    event.target.value
                                )
                            }
                        />

                    </div>


                    {/* SUMMARY */}

                    <div className="checkout-summary">

                        <button
                            type="button"
                            className="bill-preview-trigger"
                            disabled={!cart.length}
                            onClick={() =>
                                setShowBillPreview(true)
                            }
                        >
                            <Eye size={15} />
                            Preview &amp; Print Bill
                        </button>

                        <BillSummary
                            total={total}
                            disabled={
                                !cart.length ||
                                saving
                            }
                            onComplete={
                                complete
                            }
                        />

                    </div>


                    {/* SECURE NOTE */}

                    <div className="checkout-security">

                        <ShieldCheck
                            size={15}
                        />

                        <span>
                            Secure transaction •
                            Firebase protected
                        </span>

                    </div>

                </aside>

            </main>


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
