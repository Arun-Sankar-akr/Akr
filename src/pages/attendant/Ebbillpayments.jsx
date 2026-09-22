import { useEffect, useMemo, useState } from "react";

import {
    Plus,
    Search,
    Download,
    Zap,
    User,
    Hash,
    IndianRupee,
    WalletCards,
    X,
    CheckCircle2,
    TrendingUp,
    ReceiptText,
    Loader2,
} from "lucide-react";

import {
    addDoc,
    collection,
    onSnapshot,
    serverTimestamp,
} from "firebase/firestore";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatCurrency } from "../../utils/currency";

import "./EbbillPayments.css";


/* =========================================================
   EB BILL PAYMENTS
   ========================================================= */

export default function EBBillPayments() {

    const {
        user,
        profile,
        role,
    } = useAuth();


    /* =====================================================
       STATE
       ===================================================== */

    const [search, setSearch] =
        useState("");

    const [showForm, setShowForm] =
        useState(false);

    const [saving, setSaving] =
        useState(false);

    const [loading, setLoading] =
        useState(true);

    const [bills, setBills] =
        useState([]);

    const [error, setError] =
        useState(null);


    const [form, setForm] = useState({
        consumerName: "",
        consumerNumber: "",
        billAmount: "",
        serviceCharge: "",
        paymentMethod: "cash",
    });


    /* =====================================================
       LOAD FIREBASE BILLS
       ===================================================== */

    useEffect(() => {

        const billsRef =
            collection(
                db,
                "ebBillPayments"
            );


        /*
          IMPORTANT:
    
          Do NOT use:
    
          query(
            billsRef,
            orderBy("createdAt", "desc")
          )
    
          here.
    
          We load the complete collection and
          sort it locally. This prevents records
          from disappearing when an older Firebase
          document does not contain createdAt.
        */

        const unsubscribe =
            onSnapshot(
                billsRef,

                (snapshot) => {

                    const data =
                        snapshot.docs.map(
                            (doc) => ({
                                id: doc.id,
                                ...doc.data(),
                            })
                        );


                    /* =========================================
                       SORT NEWEST FIRST
                       ========================================= */

                    data.sort(
                        (a, b) => {

                            const getTimestamp =
                                (item) => {

                                    if (
                                        !item?.createdAt
                                    ) {
                                        return 0;
                                    }


                                    try {

                                        /*
                                          Firestore Timestamp
                                        */

                                        if (
                                            typeof item.createdAt.toDate ===
                                            "function"
                                        ) {

                                            return item.createdAt
                                                .toDate()
                                                .getTime();

                                        }


                                        /*
                                          Normal JavaScript date
                                        */

                                        const date =
                                            new Date(
                                                item.createdAt
                                            );

                                        const time =
                                            date.getTime();

                                        return Number.isNaN(
                                            time
                                        )
                                            ? 0
                                            : time;

                                    } catch {

                                        return 0;

                                    }

                                };


                            return (
                                getTimestamp(b) -
                                getTimestamp(a)
                            );

                        }
                    );


                    console.log(
                        "EB bill payments loaded:",
                        data
                    );


                    setBills(
                        data
                    );

                    setLoading(
                        false
                    );

                    setError(
                        null
                    );

                },

                (firebaseError) => {

                    console.error(
                        "EB bill payment listener error:",
                        firebaseError
                    );


                    setError(
                        firebaseError
                    );

                    setLoading(
                        false
                    );

                    setBills(
                        []
                    );

                }
            );


        return () =>
            unsubscribe();

    }, []);


    /* =====================================================
       FORM CHANGE
       ===================================================== */

    function handleChange(
        event
    ) {

        const {
            name,
            value,
        } = event.target;


        setForm(
            (current) => ({
                ...current,
                [name]: value,
            })
        );

    }


    /* =====================================================
       RESET FORM
       ===================================================== */

    function resetForm() {

        setForm({
            consumerName: "",
            consumerNumber: "",
            billAmount: "",
            serviceCharge: "",
            paymentMethod: "cash",
        });

    }


    /* =====================================================
       CALCULATED VALUES
       ===================================================== */

    const billAmount =
        Number(
            form.billAmount
        ) || 0;


    const serviceCharge =
        Number(
            form.serviceCharge
        ) || 0;


    const customerPays =
        billAmount +
        serviceCharge;


    /* =====================================================
       SAVE BILL PAYMENT
       ===================================================== */

    async function saveBillPayment(
        event
    ) {

        event.preventDefault();


        if (saving) {
            return;
        }


        /* =========================================
           LOGIN CHECK
           ========================================= */

        if (!user?.uid) {

            alert(
                "Your login session has expired. Please login again."
            );

            return;

        }


        /* =========================================
           CONSUMER NAME
           ========================================= */

        if (
            !form.consumerName.trim()
        ) {

            alert(
                "Please enter consumer name."
            );

            return;

        }


        /* =========================================
           CONSUMER NUMBER
           ========================================= */

        if (
            !form.consumerNumber.trim()
        ) {

            alert(
                "Please enter EB consumer number."
            );

            return;

        }


        /* =========================================
           BILL AMOUNT
           ========================================= */

        if (
            billAmount <= 0
        ) {

            alert(
                "Please enter a valid bill amount."
            );

            return;

        }


        /* =========================================
           SERVICE CHARGE
           ========================================= */

        if (
            serviceCharge < 0
        ) {

            alert(
                "Service charge cannot be negative."
            );

            return;

        }


        setSaving(
            true
        );


        try {

            /* =========================================
               CURRENT DATE
               ========================================= */

            const now =
                new Date();


            const dateKey =
                now
                    .toISOString()
                    .slice(
                        0,
                        10
                    );


            const monthKey =
                now
                    .toISOString()
                    .slice(
                        0,
                        7
                    );


            const yearKey =
                now
                    .getFullYear()
                    .toString();


            /* =========================================
               BILL DATA
               ========================================= */

            const billData = {

                /* Consumer */

                consumerName:
                    form.consumerName.trim(),

                consumerNumber:
                    form.consumerNumber.trim(),


                /* Money */

                billAmount:
                    billAmount,

                serviceCharge:
                    serviceCharge,

                customerPays:
                    customerPays,


                /* Payment */

                paymentMethod:
                    form.paymentMethod,


                /* Staff */

                attendantId:
                    user.uid,

                attendantName:
                    profile?.name ||
                    user.displayName ||
                    user.email ||
                    "Attendant",


                /* Status */

                status:
                    "completed",


                /* Date */

                createdAt:
                    serverTimestamp(),

                dateKey:
                    dateKey,

                monthKey:
                    monthKey,

                yearKey:
                    yearKey,
            };


            console.log(
                "Saving EB bill payment:",
                billData
            );


            /* =========================================
               SAVE TO FIREBASE
               ========================================= */

            const docRef =
                await addDoc(
                    collection(
                        db,
                        "ebBillPayments"
                    ),
                    billData
                );


            console.log(
                "EB bill payment saved successfully. Document ID:",
                docRef.id
            );


            alert(
                "EB bill payment saved successfully."
            );


            /* =========================================
               RESET
               ========================================= */

            resetForm();

            setShowForm(
                false
            );


        } catch (
        firebaseError
        ) {

            console.error(
                "EB bill payment save failed:",
                firebaseError
            );


            alert(
                `Unable to save EB bill payment.\n\n${firebaseError?.message ||
                "Unknown Firebase error"
                }`
            );


        } finally {

            setSaving(
                false
            );

        }

    }


    /* =====================================================
       FILTER
       ===================================================== */

    const filteredBills =
        useMemo(
            () => {

                const keyword =
                    search
                        .trim()
                        .toLowerCase();


                if (!keyword) {

                    return bills;

                }


                return bills.filter(
                    (item) =>

                        String(
                            item.consumerName ||
                            ""
                        )
                            .toLowerCase()
                            .includes(
                                keyword
                            ) ||

                        String(
                            item.consumerNumber ||
                            ""
                        )
                            .toLowerCase()
                            .includes(
                                keyword
                            ) ||

                        String(
                            item.attendantName ||
                            ""
                        )
                            .toLowerCase()
                            .includes(
                                keyword
                            )

                );

            },
            [
                bills,
                search,
            ]
        );


    /* =====================================================
       TODAY STATS
       ===================================================== */

    const todayKey =
        new Date()
            .toISOString()
            .slice(
                0,
                10
            );


    const todayBills =
        bills.filter(
            (item) =>
                item.dateKey ===
                todayKey
        );


    const todayBillAmount =
        todayBills.reduce(
            (
                sum,
                item
            ) =>
                sum +
                Number(
                    item.billAmount ||
                    0
                ),
            0
        );


    const todayProfit =
        todayBills.reduce(
            (
                sum,
                item
            ) =>
                sum +
                Number(
                    item.serviceCharge ||
                    0
                ),
            0
        );


    const todayCount =
        todayBills.length;


    /* =====================================================
       DATE FORMAT
       ===================================================== */

    function formatDate(
        timestamp
    ) {

        if (
            !timestamp
        ) {

            return "Just now";

        }


        try {

            const date =
                timestamp?.toDate
                    ? timestamp.toDate()
                    : new Date(
                        timestamp
                    );


            return date.toLocaleString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                }
            );

        } catch {

            return "Unknown date";

        }

    }


    /* =====================================================
       EXPORT CSV
       ===================================================== */

    function exportBills() {

        if (
            !filteredBills.length
        ) {

            alert(
                "No EB bill payment records to export."
            );

            return;

        }


        const headers = [

            "Consumer Name",

            "Consumer Number",

            "Bill Amount",

            "Service Charge",

            "Customer Pays",

            "Payment Method",

            "Attendant",

            "Date",

        ];


        const rows =
            filteredBills.map(
                (item) => [

                    item.consumerName ||
                    "",

                    item.consumerNumber ||
                    "",

                    item.billAmount ||
                    0,

                    item.serviceCharge ||
                    0,

                    item.customerPays ||
                    0,

                    item.paymentMethod ||
                    "",

                    item.attendantName ||
                    "",

                    formatDate(
                        item.createdAt
                    ),

                ]
            );


        const csv = [
            headers,
            ...rows,
        ]
            .map(
                (row) =>
                    row
                        .map(
                            (value) =>
                                `"${String(
                                    value
                                ).replace(
                                    /"/g,
                                    '""'
                                )}"`
                        )
                        .join(",")
            )
            .join("\n");


        const blob =
            new Blob(
                [csv],
                {
                    type:
                        "text/csv;charset=utf-8;",
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        link.download =
            `eb-bill-payments-${todayKey}.csv`;


        document.body.appendChild(
            link
        );


        link.click();


        document.body.removeChild(
            link
        );


        URL.revokeObjectURL(
            url
        );

    }


    /* =====================================================
       UI
       ===================================================== */

    return (

        <div className="eb-bill-page">


            {/* =============================================
          HEADER
      ============================================= */}

            <div className="eb-header">

                <div className="eb-header-left">

                    <div className="eb-icon-main">

                        <Zap
                            size={24}
                        />

                    </div>


                    <div>

                        <div className="eb-eyebrow">
                            ELECTRICITY SERVICES
                        </div>


                        <h1>
                            EB Bill Payments
                        </h1>


                        <p>
                            Record customer electricity bill
                            payments and track your service earnings.
                        </p>

                    </div>

                </div>


                <button
                    type="button"
                    className="eb-add-btn"
                    onClick={() =>
                        setShowForm(true)
                    }
                >

                    <Plus size={17} />

                    New Bill Payment

                </button>

            </div>


            {/* =============================================
          STATS
      ============================================= */}

            <div className="eb-stats">


                {/* TODAY COUNT */}

                <div className="eb-stat-card">

                    <div className="eb-stat-icon blue">

                        <Zap
                            size={19}
                        />

                    </div>


                    <div>

                        <span>
                            Today's Bills
                        </span>


                        <strong>
                            {todayCount}
                        </strong>

                    </div>

                </div>


                {/* BILL AMOUNT */}

                <div className="eb-stat-card">

                    <div className="eb-stat-icon purple">

                        <IndianRupee
                            size={19}
                        />

                    </div>


                    <div>

                        <span>
                            Bill Amount
                        </span>


                        <strong>
                            {formatCurrency(
                                todayBillAmount
                            )}
                        </strong>

                    </div>

                </div>


                {/* PROFIT */}

                <div className="eb-stat-card">

                    <div className="eb-stat-icon green">

                        <TrendingUp
                            size={19}
                        />

                    </div>


                    <div>

                        <span>
                            Today's Profit
                        </span>


                        <strong>
                            {formatCurrency(
                                todayProfit
                            )}
                        </strong>

                    </div>

                </div>


                {/* TOTAL */}

                <div className="eb-stat-card">

                    <div className="eb-stat-icon orange">

                        <ReceiptText
                            size={19}
                        />

                    </div>


                    <div>

                        <span>
                            Total Records
                        </span>


                        <strong>
                            {bills.length}
                        </strong>

                    </div>

                </div>

            </div>


            {/* =============================================
          RECORDS
      ============================================= */}

            <section className="eb-records-panel">


                <div className="eb-panel-header">

                    <div>

                        <div className="eb-section-label">
                            PAYMENT HISTORY
                        </div>


                        <h2>
                            EB Bill Payments
                        </h2>


                        <p>
                            View and search previous
                            customer bill payment records.
                        </p>

                    </div>


                    <button
                        type="button"
                        className="eb-export-btn"
                        onClick={
                            exportBills
                        }
                    >

                        <Download size={15} />

                        Export

                    </button>

                </div>


                {/* SEARCH */}

                <div className="eb-toolbar">

                    <div className="eb-search">

                        <Search size={17} />


                        <input
                            value={search}
                            onChange={(e) =>
                                setSearch(
                                    e.target.value
                                )
                            }
                            placeholder="Search consumer, number or attendant..."
                        />


                        {search && (

                            <button
                                type="button"
                                onClick={() =>
                                    setSearch("")
                                }
                            >

                                <X size={15} />

                            </button>

                        )}

                    </div>


                    <div className="eb-result-count">

                        {filteredBills.length}
                        {" "}
                        records

                    </div>

                </div>


                {/* =========================================
            LOADING
        ========================================= */}

                {loading && (

                    <div className="eb-state">

                        <Loader2
                            className="spin"
                            size={28}
                        />


                        <strong>
                            Loading bill payments...
                        </strong>

                    </div>

                )}


                {/* =========================================
            ERROR
        ========================================= */}

                {!loading &&
                    error && (

                        <div className="eb-state error">

                            <div className="state-circle">
                                !
                            </div>


                            <strong>
                                Unable to load bill payments
                            </strong>


                            <p>
                                {error.message}
                            </p>

                        </div>

                    )}


                {/* =========================================
            EMPTY
        ========================================= */}

                {!loading &&
                    !error &&
                    !filteredBills.length && (

                        <div className="eb-empty">

                            <div className="empty-eb-icon">

                                <Zap
                                    size={25}
                                />

                            </div>


                            <h3>
                                No EB bill payments yet
                            </h3>


                            <p>
                                Create your first customer
                                EB bill payment to see it here.
                            </p>


                            <button
                                type="button"
                                onClick={() =>
                                    setShowForm(true)
                                }
                            >

                                <Plus size={16} />

                                Create Bill Payment

                            </button>

                        </div>

                    )}


                {/* =========================================
            TABLE
        ========================================= */}

                {!loading &&
                    !error &&
                    filteredBills.length > 0 && (

                        <div className="eb-table-wrap">

                            <table className="eb-table">

                                <thead>

                                    <tr>

                                        <th>
                                            Consumer
                                        </th>

                                        <th>
                                            Bill Amount
                                        </th>

                                        <th>
                                            Service Charge
                                        </th>

                                        <th>
                                            Customer Pays
                                        </th>

                                        <th>
                                            Payment
                                        </th>

                                        <th>
                                            Attendant
                                        </th>

                                        <th>
                                            Date
                                        </th>

                                    </tr>

                                </thead>


                                <tbody>

                                    {filteredBills.map(
                                        (item) => (

                                            <tr
                                                key={
                                                    item.id
                                                }
                                            >

                                                {/* CONSUMER */}

                                                <td>

                                                    <div className="consumer-cell">

                                                        <div className="consumer-avatar">

                                                            {(
                                                                item.consumerName ||
                                                                "C"
                                                            )
                                                                .charAt(0)
                                                                .toUpperCase()}

                                                        </div>


                                                        <div>

                                                            <strong>
                                                                {
                                                                    item.consumerName
                                                                }
                                                            </strong>


                                                            <span>
                                                                {
                                                                    item.consumerNumber
                                                                }
                                                            </span>

                                                        </div>

                                                    </div>

                                                </td>


                                                {/* BILL AMOUNT */}

                                                <td>

                                                    <strong className="amount-text">

                                                        {formatCurrency(
                                                            item.billAmount ||
                                                            0
                                                        )}

                                                    </strong>

                                                </td>


                                                {/* SERVICE CHARGE */}

                                                <td>

                                                    <strong className="profit-text">

                                                        +

                                                        {formatCurrency(
                                                            item.serviceCharge ||
                                                            0
                                                        )}

                                                    </strong>

                                                </td>


                                                {/* CUSTOMER PAYS */}

                                                <td>

                                                    <strong>

                                                        {formatCurrency(
                                                            item.customerPays ||
                                                            0
                                                        )}

                                                    </strong>

                                                </td>


                                                {/* PAYMENT */}

                                                <td>

                                                    <span className="payment-badge">

                                                        {String(
                                                            item.paymentMethod ||
                                                            "cash"
                                                        ).toUpperCase()}

                                                    </span>

                                                </td>


                                                {/* ATTENDANT */}

                                                <td>

                                                    <span className="attendant-name">

                                                        {
                                                            item.attendantName
                                                        }

                                                    </span>

                                                </td>


                                                {/* DATE */}

                                                <td>

                                                    <span className="date-text">

                                                        {formatDate(
                                                            item.createdAt
                                                        )}

                                                    </span>

                                                </td>

                                            </tr>

                                        )
                                    )}

                                </tbody>

                            </table>

                        </div>

                    )}

            </section>


            {/* =============================================
          NEW BILL PAYMENT MODAL
      ============================================= */}

            {showForm && (

                <div
                    className="eb-modal-backdrop"

                    onMouseDown={(e) => {

                        if (
                            e.target ===
                            e.currentTarget
                        ) {

                            setShowForm(
                                false
                            );

                        }

                    }}
                >

                    <div className="eb-modal">


                        {/* MODAL HEADER */}

                        <div className="eb-modal-header">

                            <div>

                                <div className="eb-modal-icon">

                                    <Zap
                                        size={21}
                                    />

                                </div>


                                <div>

                                    <div className="eb-section-label">
                                        NEW BILL PAYMENT
                                    </div>


                                    <h2>
                                        EB Bill Payment
                                    </h2>

                                </div>

                            </div>


                            <button
                                type="button"
                                className="modal-close"
                                onClick={() =>
                                    setShowForm(
                                        false
                                    )
                                }
                            >

                                <X size={18} />

                            </button>

                        </div>


                        {/* FORM */}

                        <form
                            onSubmit={
                                saveBillPayment
                            }
                        >

                            <div className="eb-form-grid">


                                {/* CONSUMER NAME */}

                                <div className="eb-field">

                                    <label>
                                        Consumer Name
                                    </label>


                                    <div className="eb-input">

                                        <User size={16} />


                                        <input
                                            name="consumerName"
                                            value={
                                                form.consumerName
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            placeholder="Enter consumer name"
                                            autoComplete="off"
                                        />

                                    </div>

                                </div>


                                {/* CONSUMER NUMBER */}

                                <div className="eb-field">

                                    <label>
                                        EB Consumer Number
                                    </label>


                                    <div className="eb-input">

                                        <Hash size={16} />


                                        <input
                                            name="consumerNumber"
                                            value={
                                                form.consumerNumber
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            placeholder="Enter EB consumer number"
                                            inputMode="numeric"
                                            maxLength={20}
                                            autoComplete="off"
                                        />

                                    </div>

                                </div>


                                {/* BILL AMOUNT */}

                                <div className="eb-field">

                                    <label>
                                        Bill Amount
                                    </label>


                                    <div className="eb-input eb-input-large">

                                        <IndianRupee
                                            size={17}
                                        />


                                        <input
                                            name="billAmount"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={
                                                form.billAmount
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            placeholder="0.00"
                                        />

                                    </div>


                                    <small>
                                        Amount shown on
                                        the electricity bill
                                    </small>

                                </div>


                                {/* SERVICE CHARGE */}

                                <div className="eb-field">

                                    <label>
                                        Service Charge / Profit
                                    </label>


                                    <div className="eb-input eb-input-large profit-input">

                                        <TrendingUp
                                            size={17}
                                        />


                                        <input
                                            name="serviceCharge"
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={
                                                form.serviceCharge
                                            }
                                            onChange={
                                                handleChange
                                            }
                                            placeholder="0.00"
                                        />

                                    </div>


                                    <small>
                                        Your shop's earning
                                        from this payment
                                    </small>

                                </div>

                            </div>


                            {/* PAYMENT */}

                            <div className="payment-form-section">

                                <label>
                                    Payment Method
                                </label>


                                <div className="payment-method-grid">

                                    {[
                                        {
                                            id: "cash",
                                            label: "Cash",
                                        },
                                        {
                                            id: "upi",
                                            label: "UPI",
                                        },
                                        {
                                            id: "card",
                                            label: "Card",
                                        },
                                    ].map(
                                        (
                                            method
                                        ) => (

                                            <button
                                                type="button"
                                                key={
                                                    method.id
                                                }
                                                className={
                                                    form.paymentMethod ===
                                                        method.id
                                                        ? "payment-method active"
                                                        : "payment-method"
                                                }
                                                onClick={() =>
                                                    setForm(
                                                        (
                                                            current
                                                        ) => ({
                                                            ...current,
                                                            paymentMethod:
                                                                method.id,
                                                        })
                                                    )
                                                }
                                            >

                                                <WalletCards
                                                    size={17}
                                                />

                                                {
                                                    method.label
                                                }

                                            </button>

                                        )
                                    )}

                                </div>

                            </div>


                            {/* CALCULATION */}

                            <div className="bill-calculation">


                                <div>

                                    <span>
                                        Bill Amount
                                    </span>


                                    <strong>

                                        {formatCurrency(
                                            billAmount
                                        )}

                                    </strong>

                                </div>


                                <div>

                                    <span>
                                        Service Charge
                                    </span>


                                    <strong className="calculation-profit">

                                        +

                                        {formatCurrency(
                                            serviceCharge
                                        )}

                                    </strong>

                                </div>


                                <div className="calculation-total">

                                    <span>
                                        Customer Pays
                                    </span>


                                    <strong>

                                        {formatCurrency(
                                            customerPays
                                        )}

                                    </strong>

                                </div>

                            </div>


                            {/* ACTIONS */}

                            <div className="eb-modal-actions">

                                <button
                                    type="button"
                                    className="cancel-eb-btn"
                                    onClick={() =>
                                        setShowForm(
                                            false
                                        )
                                    }
                                    disabled={
                                        saving
                                    }
                                >

                                    Cancel

                                </button>


                                <button
                                    type="submit"
                                    className="save-eb-btn"
                                    disabled={
                                        saving
                                    }
                                >

                                    {saving ? (

                                        <>

                                            <Loader2
                                                size={17}
                                                className="spin"
                                            />

                                            Saving...

                                        </>

                                    ) : (

                                        <>

                                            <CheckCircle2
                                                size={17}
                                            />

                                            Save Bill Payment

                                        </>

                                    )}

                                </button>

                            </div>

                        </form>

                    </div>

                </div>

            )}

        </div>

    );

}