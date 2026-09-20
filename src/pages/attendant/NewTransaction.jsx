import { useMemo, useState } from "react";
import {
    ArrowLeft,
    AlertCircle,
    ShoppingCart,
    ReceiptText,
    Sparkles,
    ShieldCheck,
    Zap,
    ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";

import ServiceSelector from "../../components/billing/ServiceSelector";
import Cart from "../../components/billing/Cart";
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
                            COUNTER BILLING
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

                        <Cart
                            items={cart}
                            onQty={qty}
                            onRemove={
                                removeItem
                            }
                        />

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


                    {/* SUMMARY */}

                    <div className="checkout-summary">

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

        </div>
    );
}