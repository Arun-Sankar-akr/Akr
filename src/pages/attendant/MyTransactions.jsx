import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  X,
  Receipt,
  IndianRupee,
  CheckCircle2,
  Clock3,
  Eye,
  Printer,
  FileText,
  Palette,
  ScanLine,
  Smartphone,
  WalletCards,
  ArrowLeftRight,
  Banknote,
  Zap,
  RefreshCw,
  ChevronDown,
  CalendarDays,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../../services/firebase";
import { formatCurrency } from "../../utils/currency";
import logos from "../../assets/logo.png";

import "./MyTransactions.css";


// --------------------------------------------------
// Helpers
// --------------------------------------------------

const getLocalDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTransactionLocalDate = (value) => {
  const timestamp = getTimestamp(value);
  if (!timestamp) return "";
  return getLocalDateInputValue(new Date(timestamp));
};

const getTimestamp = (value) => {
  if (!value) return 0;

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.seconds === "number") {
    return value.seconds * 1000;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed) ? 0 : parsed;
};


const formatDate = (value) => {
  const timestamp = getTimestamp(value);

  if (!timestamp) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
};


const formatTime = (value) => {
  const timestamp = getTimestamp(value);

  if (!timestamp) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
};


const getStatus = (transaction) => {
  return String(transaction?.status || "completed").toLowerCase();
};


const getPaymentMethod = (transaction) => {
  return (
    transaction?.paymentMethod ||
    transaction?.paymentMode ||
    transaction?.mode ||
    "Cash"
  );
};


// --------------------------------------------------
// Purpose / Type
// --------------------------------------------------

const getPurpose = (transaction) => {
  const source = transaction?.source;

  // Money Transfer
  if (
    source === "moneyTransfer" ||
    transaction?.transactionType === "money_transfer" ||
    transaction?.transactionType === "moneyTransfer" ||
    String(transaction?.purpose || "").toLowerCase() === "money transfer"
  ) {
    return {
      label: "Money Transfer",
      shortLabel: "Transfer",
      type: "money-transfer",
      icon: ArrowLeftRight,
    };
  }

  // Withdrawal
  if (
    source === "withdrawal" ||
    transaction?.transactionType === "withdrawal" ||
    String(transaction?.purpose || "").toLowerCase() === "withdrawal"
  ) {
    return {
      label: "Withdrawal",
      shortLabel: "Withdrawal",
      type: "withdrawal",
      icon: Banknote,
    };
  }

  // EB Bill Payment
  if (
    source === "ebBillPayment" ||
    transaction?.transactionType === "eb_bill_payment" ||
    transaction?.transactionType === "ebBillPayment" ||
    String(transaction?.purpose || "").toLowerCase() === "eb bill payment"
  ) {
    return {
      label: "EB Bill Payment",
      shortLabel: "EB Bill",
      type: "eb-bill",
      icon: Zap,
    };
  }

  // Normal service
  const serviceName =
    transaction?.serviceName ||
    transaction?.service ||
    transaction?.purpose ||
    transaction?.serviceType ||
    "Service";

  const normalized = String(serviceName).toLowerCase();

  if (
    normalized.includes("color") ||
    normalized.includes("colour")
  ) {
    return {
      label: serviceName,
      shortLabel: "Color Print",
      type: "color",
      icon: Palette,
    };
  }

  if (
    normalized.includes("print") ||
    normalized.includes("printing")
  ) {
    return {
      label: serviceName,
      shortLabel: "Printout",
      type: "print",
      icon: Printer,
    };
  }

  if (
    normalized.includes("xerox") ||
    normalized.includes("copy") ||
    normalized.includes("photocopy")
  ) {
    return {
      label: serviceName,
      shortLabel: "Xerox",
      type: "xerox",
      icon: FileText,
    };
  }

  if (
    normalized.includes("scan") ||
    normalized.includes("scanning")
  ) {
    return {
      label: serviceName,
      shortLabel: "Scan",
      type: "scan",
      icon: ScanLine,
    };
  }

  if (
    normalized.includes("online") ||
    normalized.includes("digital")
  ) {
    return {
      label: serviceName,
      shortLabel: "Online Service",
      type: "online",
      icon: Smartphone,
    };
  }

  return {
    label: serviceName,
    shortLabel: serviceName,
    type: "service",
    icon: Receipt,
  };
};


// --------------------------------------------------
// Normalize transaction
// --------------------------------------------------

const normalizeTransaction = (data, id, source) => {
  let amount = 0;
  let serviceCharge = 0;
  let customerPays = 0;

  if (source === "transactions") {
    amount = Number(
      data.amount ??
      data.total ??
      data.customerPays ??
      0
    );

    serviceCharge = Number(
      data.serviceCharge ??
      data.charge ??
      0
    );

    customerPays = Number(
      data.customerPays ??
      data.total ??
      data.amount ??
      0
    );
  }

  if (source === "moneyTransfer") {
    amount = Number(
      data.transferAmount ??
      data.amount ??
      0
    );

    serviceCharge = Number(
      data.serviceCharge ??
      0
    );

    customerPays = Number(
      data.customerPays ??
      data.total ??
      amount + serviceCharge
    );
  }

  if (source === "withdrawal") {
    amount = Number(
      data.withdrawalAmount ??
      data.amount ??
      0
    );

    serviceCharge = Number(
      data.serviceCharge ??
      0
    );

    customerPays = Number(
      data.customerPays ??
      data.total ??
      amount + serviceCharge
    );
  }

  if (source === "ebBillPayment") {
    amount = Number(
      data.billAmount ??
      data.amount ??
      0
    );

    serviceCharge = Number(
      data.serviceCharge ??
      0
    );

    customerPays = Number(
      data.customerPays ??
      data.total ??
      amount + serviceCharge
    );
  }

  return {
    ...data,

    id,
    source,

    amount,
    serviceCharge,
    customerPays,

    customerName:
      data.customerName ||
      data.name ||
      data.consumerName ||
      "Unknown Customer",

    mobile:
      data.mobile ||
      data.phone ||
      data.phoneNumber ||
      data.consumerNumber ||
      "—",

    paymentMethod: getPaymentMethod(data),

    status: getStatus(data),

    createdAt:
      data.createdAt ||
      data.timestamp ||
      data.date ||
      null,
  };
};


// --------------------------------------------------
// Component
// --------------------------------------------------

export default function MyTransactions() {
  const [user, setUser] = useState(null);

  const [transactions, setTransactions] = useState([]);
  const [moneyTransfers, setMoneyTransfers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [ebBillPayments, setEbBillPayments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => getLocalDateInputValue());
  const [toDate, setToDate] = useState(() => getLocalDateInputValue());

  const [selectedTransaction, setSelectedTransaction] =
    useState(null);

  // --------------------------------------------------
  // Authentication
  // --------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);


  // --------------------------------------------------
  // Firestore listeners
  // --------------------------------------------------

  useEffect(() => {
    if (!user?.uid) {
      setTransactions([]);
      setMoneyTransfers([]);
      setWithdrawals([]);
      setEbBillPayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    let transactionsLoaded = false;
    let transfersLoaded = false;
    let withdrawalsLoaded = false;
    let ebBillPaymentsLoaded = false;

    const checkLoaded = () => {
      if (
        transactionsLoaded &&
        transfersLoaded &&
        withdrawalsLoaded &&
        ebBillPaymentsLoaded
      ) {
        setLoading(false);
      }
    };


    // -------------------------------
    // Normal Transactions
    // -------------------------------

    const transactionsQuery = query(
      collection(db, "transactions"),
      where("attendantId", "==", user.uid)
    );

    const unsubscribeTransactions = onSnapshot(
      transactionsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((doc) =>
          normalizeTransaction(
            doc.data(),
            doc.id,
            "transactions"
          )
        );

        setTransactions(records);

        transactionsLoaded = true;
        checkLoaded();
      },
      (err) => {
        console.error("Transactions error:", err);

        setError(
          "Unable to load service transactions. Please check your Firestore rules."
        );

        transactionsLoaded = true;
        checkLoaded();
      }
    );


    // -------------------------------
    // Money Transfers
    // -------------------------------

    const transfersQuery = query(
      collection(db, "moneyTransfers"),
      where("attendantId", "==", user.uid)
    );

    const unsubscribeTransfers = onSnapshot(
      transfersQuery,
      (snapshot) => {
        const records = snapshot.docs.map((doc) =>
          normalizeTransaction(
            doc.data(),
            doc.id,
            "moneyTransfer"
          )
        );

        setMoneyTransfers(records);

        transfersLoaded = true;
        checkLoaded();
      },
      (err) => {
        console.error("Money transfer error:", err);

        setError(
          "Unable to load money transfers. Please check your Firestore rules."
        );

        transfersLoaded = true;
        checkLoaded();
      }
    );


    // -------------------------------
    // Withdrawals
    // -------------------------------

    const withdrawalsQuery = query(
      collection(db, "withdrawals"),
      where("attendantId", "==", user.uid)
    );

    const unsubscribeWithdrawals = onSnapshot(
      withdrawalsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((doc) =>
          normalizeTransaction(
            doc.data(),
            doc.id,
            "withdrawal"
          )
        );

        setWithdrawals(records);

        withdrawalsLoaded = true;
        checkLoaded();
      },
      (err) => {
        console.error("Withdrawals error:", err);

        setError(
          "Unable to load withdrawals. Please check your Firestore rules."
        );

        withdrawalsLoaded = true;
        checkLoaded();
      }
    );


    // -------------------------------
    // EB Bill Payments
    // -------------------------------

    const ebBillPaymentsQuery = query(
      collection(db, "ebBillPayments"),
      where("attendantId", "==", user.uid)
    );

    const unsubscribeEbBillPayments = onSnapshot(
      ebBillPaymentsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((doc) =>
          normalizeTransaction(
            doc.data(),
            doc.id,
            "ebBillPayment"
          )
        );

        setEbBillPayments(records);

        ebBillPaymentsLoaded = true;
        checkLoaded();
      },
      (err) => {
        console.error("EB bill payment error:", err);

        setError(
          "Unable to load EB bill payments. Please check your Firestore rules."
        );

        ebBillPaymentsLoaded = true;
        checkLoaded();
      }
    );


    return () => {
      unsubscribeTransactions();
      unsubscribeTransfers();
      unsubscribeWithdrawals();
      unsubscribeEbBillPayments();
    };
  }, [user?.uid]);


  // --------------------------------------------------
  // Combine all transactions
  // --------------------------------------------------

  const allTransactions = useMemo(() => {
    return [
      ...transactions,
      ...moneyTransfers,
      ...withdrawals,
      ...ebBillPayments,
    ].sort(
      (a, b) =>
        getTimestamp(b.createdAt) -
        getTimestamp(a.createdAt)
    );
  }, [
    transactions,
    moneyTransfers,
    withdrawals,
    ebBillPayments,
  ]);


  // --------------------------------------------------
  // Filter
  // --------------------------------------------------

  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();

    return allTransactions.filter((transaction) => {
      const purpose = getPurpose(transaction);

      const matchesSearch =
        !term ||
        String(transaction.customerName)
          .toLowerCase()
          .includes(term) ||
        String(transaction.mobile)
          .toLowerCase()
          .includes(term) ||
        String(purpose.label)
          .toLowerCase()
          .includes(term) ||
        String(transaction.paymentMethod)
          .toLowerCase()
          .includes(term) ||
        String(transaction.status)
          .toLowerCase()
          .includes(term) ||
        String(transaction.id)
          .toLowerCase()
          .includes(term);

      const matchesType =
        typeFilter === "all" ||
        purpose.type === typeFilter;

      const matchesStatus =
        statusFilter === "all" ||
        transaction.status === statusFilter;

      const transactionDate = getTransactionLocalDate(transaction.createdAt);

      const matchesDate =
        (!fromDate || transactionDate >= fromDate) &&
        (!toDate || transactionDate <= toDate);

      return (
        matchesSearch &&
        matchesType &&
        matchesStatus &&
        matchesDate
      );
    });
  }, [
    allTransactions,
    search,
    typeFilter,
    statusFilter,
    fromDate,
    toDate,
  ]);


  // --------------------------------------------------
  // Statistics
  // --------------------------------------------------

  const stats = useMemo(() => {
    const total = filteredTransactions.length;

    const completed = filteredTransactions.filter(
      (item) => item.status === "completed"
    ).length;

    const pending = filteredTransactions.filter(
      (item) =>
        item.status === "pending" ||
        item.status === "processing"
    ).length;

    const totalValue = filteredTransactions.reduce(
      (sum, item) =>
        sum + Number(item.customerPays || 0),
      0
    );

    const totalCharges = filteredTransactions.reduce(
      (sum, item) =>
        sum + Number(item.serviceCharge || 0),
      0
    );

    return {
      total,
      completed,
      pending,
      totalValue,
      totalCharges,
    };
  }, [filteredTransactions]);


  // --------------------------------------------------
  // CSV Export
  // --------------------------------------------------

  const exportCSV = () => {
    if (!filteredTransactions.length) {
      return;
    }

    const headers = [
      "Date",
      "Time",
      "Purpose",
      "Customer",
      "Mobile",
      "Amount",
      "Service Charge",
      "Customer Pays",
      "Payment Method",
      "Status",
      "Source",
      "Transaction ID",
    ];

    const rows = filteredTransactions.map((transaction) => {
      const purpose = getPurpose(transaction);

      return [
        formatDate(transaction.createdAt),
        formatTime(transaction.createdAt),
        purpose.label,
        transaction.customerName,
        transaction.mobile,
        transaction.amount,
        transaction.serviceCharge,
        transaction.customerPays,
        transaction.paymentMethod,
        transaction.status,
        transaction.source,
        transaction.id,
      ];
    });

    const csv = [
      headers,
      ...rows,
    ]
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob(
      [csv],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `my-transactions-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };


  // --------------------------------------------------
  // Print saved transaction receipt
  // --------------------------------------------------

  const printTransactionReceipt = (transaction) => {
    if (!transaction) return;

    const purpose = getPurpose(transaction);
    const timestamp = getTimestamp(transaction.createdAt);
    const date = timestamp ? new Date(timestamp) : new Date();

    const dateStr = date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const timeStr = date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const attendantName =
      transaction.attendantName ||
      user?.displayName ||
      user?.email ||
      "Attendant";

    const paymentMethod =
      transaction.paymentMethod || "Cash";

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

    let items = [];

    if (
      transaction.source === "transactions" &&
      Array.isArray(transaction.items) &&
      transaction.items.length
    ) {
      items = transaction.items.map((item) => ({
        name:
          item.serviceName ||
          item.name ||
          "Service",
        quantity: Number(item.quantity) || 0,
        rate: Number(
          item.unitPrice ??
          item.sellingPrice ??
          0
        ),
      }));
    }

    // Money transfer / withdrawal records may not have an items array.
    if (!items.length) {
      items = [
        {
          name: purpose.label,
          quantity: 1,
          rate: Number(
            transaction.amount ??
            transaction.customerPays ??
            0
          ),
        },
      ];
    }

    const itemCount = items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    const serviceCharge = Number(
      transaction.serviceCharge || 0
    );

    const itemSubtotal = items.reduce(
      (sum, item) =>
        sum +
        Number(item.quantity || 0) *
        Number(item.rate || 0),
      0
    );

    const grandTotal = Number(
      transaction.customerPays ??
      transaction.total ??
      itemSubtotal + serviceCharge
    );

    const rowsHtml = items
      .map((item, index) => {
        const amount =
          Number(item.quantity || 0) *
          Number(item.rate || 0);

        return `
          <tr>
            <td class="number">
              ${String(index + 1).padStart(2, "0")}
            </td>
            <td class="service">
              ${escapeHtml(item.name)}
            </td>
            <td class="right">
              ${item.quantity}
            </td>
            <td class="right">
              ₹${Number(item.rate).toLocaleString("en-IN")}
            </td>
            <td class="right amount">
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
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AKR Communications - Sales Receipt</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: #fff;
      color: #172033;
      font-family: Inter, Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      padding: 38px 42px 45px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e6e9ef;
    }
    .brand { display: flex; align-items: center; gap: 17px; }
    .logo-box {
      width: 78px;
      height: 78px;
      padding: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      border: 1px solid #e5e8ee;
      border-radius: 17px;
      box-shadow: 0 8px 22px rgba(15,23,42,.08);
    }
    .logo { width: 100%; height: 100%; object-fit: contain; }
    .business-name {
      margin: 0;
      color: #111827;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -.04em;
    }
    .business-subtitle {
      margin-top: 6px;
      color: #697386;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .1em;
      text-transform: uppercase;
    }
    .receipt-title { text-align: right; }
    .receipt-title span {
      display: block;
      color: #6366f1;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    .receipt-title strong {
      display: block;
      margin-top: 5px;
      color: #111827;
      font-size: 17px;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 20px;
    }
    .meta-box {
      padding: 12px 14px;
      background: #f8f9fc;
      border: 1px solid #edf0f4;
      border-radius: 11px;
    }
    .meta-label {
      display: block;
      color: #98a1b2;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: .09em;
      text-transform: uppercase;
    }
    .meta-value {
      display: block;
      margin-top: 5px;
      color: #273142;
      font-size: 11px;
      font-weight: 700;
    }
    .customer {
      margin-top: 22px;
      padding: 13px 15px;
      background: #fafbff;
      border: 1px solid #edf0f5;
      border-radius: 12px;
    }
    .customer-label {
      color: #98a1b2;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: .09em;
      text-transform: uppercase;
    }
    .customer-name {
      margin-top: 5px;
      color: #172033;
      font-size: 12px;
      font-weight: 800;
    }
    .customer-mobile {
      margin-top: 3px;
      color: #697386;
      font-size: 10px;
    }
    .items { margin-top: 24px; }
    .items-heading {
      display: flex;
      justify-content: space-between;
      margin-bottom: 9px;
    }
    .items-heading strong {
      color: #172033;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .items-heading span { color: #98a1b2; font-size: 9px; }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid #e6e9ef;
      border-radius: 13px;
      overflow: hidden;
    }
    thead th {
      padding: 11px;
      background: #f5f6fa;
      border-bottom: 1px solid #e5e8ee;
      color: #697386;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: .07em;
      text-align: left;
      text-transform: uppercase;
    }
    tbody td {
      padding: 12px;
      border-bottom: 1px solid #edf0f4;
      color: #273142;
      font-size: 11px;
    }
    tbody tr:last-child td { border-bottom: none; }
    .number {
      width: 45px;
      color: #a0a7b4;
      text-align: center;
      font-size: 9px;
    }
    .service { color: #172033; font-weight: 700; }
    .right { text-align: right; white-space: nowrap; }
    .amount { color: #172033; font-weight: 800; }
    .summary { display: flex; justify-content: flex-end; margin-top: 18px; }
    .summary-box {
      width: 310px;
      padding: 16px;
      background: #f8f9fc;
      border: 1px solid #e7eaf0;
      border-radius: 14px;
    }
    .summary-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 0;
      color: #697386;
      font-size: 10px;
    }
    .summary-row strong { color: #273142; }
    .total {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 9px;
      padding-top: 13px;
      border-top: 1px solid #dfe3ea;
    }
    .total span { color: #172033; font-size: 12px; font-weight: 800; }
    .total strong { color: #6366f1; font-size: 20px; font-weight: 900; }
    .payment {
      margin-top: 17px;
      padding: 10px;
      background: #f0fdf4;
      border: 1px solid #d8f3df;
      border-radius: 9px;
      color: #168044;
      text-align: center;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .footer {
      margin-top: 28px;
      padding-top: 18px;
      border-top: 1px dashed #d7dce4;
      text-align: center;
    }
    .footer strong { color: #172033; font-size: 12px; }
    .footer p {
      margin: 5px 0 0;
      color: #98a1b2;
      font-size: 9px;
      line-height: 1.5;
    }
    .footer-brand {
      margin-top: 11px;
      color: #6366f1;
      font-size: 8px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }
    @page { size: A4; margin: 12mm; }
    @media print {
      body { background: #fff; }
      .receipt { max-width: none; margin: 0; padding: 0; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      .summary-box, .footer { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="receipt">
    <section class="header">
      <div class="brand">
        <div class="logo-box">
          <img class="logo" src="${logos}" alt="AKR Communications" />
        </div>
        <div>
          <h1 class="business-name">AKR Communications</h1>
          <div class="business-subtitle">Digital Services &amp; Printing</div>
        </div>
      </div>
      <div class="receipt-title">
        <span>Official</span>
        <strong>SALES RECEIPT</strong>
      </div>
    </section>

    <section class="meta">
      <div class="meta-box">
        <span class="meta-label">Date</span>
        <span class="meta-value">${dateStr}</span>
      </div>
      <div class="meta-box">
        <span class="meta-label">Time</span>
        <span class="meta-value">${timeStr}</span>
      </div>
      <div class="meta-box">
        <span class="meta-label">Attendant</span>
        <span class="meta-value">${escapeHtml(attendantName)}</span>
      </div>
    </section>

    <section class="customer">
      <div class="customer-label">Customer</div>
      <div class="customer-name">${escapeHtml(transaction.customerName || "Walk-in Customer")}</div>
      <div class="customer-mobile">${escapeHtml(transaction.mobile || "—")}</div>
    </section>

    <section class="items">
      <div class="items-heading">
        <strong>Transaction Details</strong>
        <span>${itemCount} item${itemCount !== 1 ? "s" : ""}</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item / Service</th>
            <th style="text-align:right">Qty</th>
            <th style="text-align:right">Rate</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </section>

    <section class="summary">
      <div class="summary-box">
        <div class="summary-row">
          <span>Items</span>
          <strong>${itemCount}</strong>
        </div>
        ${serviceCharge > 0 ? `
          <div class="summary-row">
            <span>Service Charge</span>
            <strong>₹${serviceCharge.toLocaleString("en-IN")}</strong>
          </div>
        ` : ""}
        <div class="summary-row">
          <span>Payment</span>
          <strong>${escapeHtml(paymentMethod)}</strong>
        </div>
        <div class="total">
          <span>GRAND TOTAL</span>
          <strong>₹${grandTotal.toLocaleString("en-IN")}</strong>
        </div>
      </div>
    </section>

    <div class="payment">✓ Payment Received · ${escapeHtml(paymentMethod)}</div>

    <footer class="footer">
      <strong>Thank you for choosing AKR Communications</strong>
      <p>We appreciate your business.<br />Please retain this receipt for your records.</p>
      <div class="footer-brand">AKR Communications</div>
    </footer>
  </main>
</body>
</html>`;

    const iframe = document.createElement("iframe");
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
        setTimeout(cleanup, 1500);
      }, 400);
    };
  };

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div className="my-transactions-page">

      {/* ---------------------------------------------
          Header
      ---------------------------------------------- */}

      <div className="transactions-page-header">

        <div className="transactions-header-left">

          <div className="transactions-main-icon">
            <Receipt size={24} />
          </div>

          <div>
            <div className="transactions-eyebrow">
              TRANSACTION MANAGEMENT
            </div>

            <h1>My Transactions</h1>

            <p>
              View your services, money transfers,
              withdrawals and EB bill payments by
              date in one place.
            </p>
          </div>

        </div>

        <button
          className="transactions-export-btn"
          onClick={exportCSV}
          disabled={!filteredTransactions.length}
        >
          <Download size={17} />
          Export CSV
        </button>

      </div>


      {/* ---------------------------------------------
          Statistics
      ---------------------------------------------- */}

      <div className="transactions-stats">

        <div className="transaction-stat-card">

          <div className="transaction-stat-icon blue">
            <Receipt size={20} />
          </div>

          <div>
            <span>Total Transactions</span>
            <strong>{stats.total}</strong>
          </div>

        </div>


        <div className="transaction-stat-card">

          <div className="transaction-stat-icon green">
            <CheckCircle2 size={20} />
          </div>

          <div>
            <span>Completed</span>
            <strong>{stats.completed}</strong>
          </div>

        </div>


        <div className="transaction-stat-card">

          <div className="transaction-stat-icon orange">
            <Clock3 size={20} />
          </div>

          <div>
            <span>Pending</span>
            <strong>{stats.pending}</strong>
          </div>

        </div>


        <div className="transaction-stat-card">

          <div className="transaction-stat-icon purple">
            <IndianRupee size={20} />
          </div>

          <div>
            <span>Total Customer Value</span>
            <strong>
              {formatCurrency(stats.totalValue)}
            </strong>
          </div>

        </div>


        <div className="transaction-stat-card">

          <div className="transaction-stat-icon cyan">
            <WalletCards size={20} />
          </div>

          <div>
            <span>Service Charges</span>
            <strong>
              {formatCurrency(stats.totalCharges)}
            </strong>
          </div>

        </div>

      </div>


      {/* ---------------------------------------------
          Main Panel
      ---------------------------------------------- */}

      <div className="transactions-panel">

        <div className="transactions-panel-top">

          <div>
            <span className="transactions-section-label">
              TRANSACTION HISTORY
            </span>

            <h2>{fromDate === toDate ? "Daily Activity" : "Transaction Activity"}</h2>

            <p>
              {fromDate === toDate
                ? `Transactions for ${new Date(`${fromDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                : `${fromDate ? new Date(`${fromDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Start"} → ${toDate ? new Date(`${toDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "End"}`}
              {" • "}
              {filteredTransactions.length} transaction
              {filteredTransactions.length !== 1 ? "s" : ""}
              {" "}found
            </p>
          </div>

          <button
            className="refresh-transactions"
            onClick={() => window.location.reload()}
            title="Refresh"
          >
            <RefreshCw size={17} />
          </button>

        </div>


        {/* -------------------------------------------
            Toolbar
        -------------------------------------------- */}

        <div className="transactions-toolbar">

          <div className="transactions-search">

            <Search size={18} />

            <input
              type="text"
              placeholder="Search customer, mobile, purpose..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />

            {search && (
              <button
                className="clear-search"
                onClick={() => setSearch("")}
              >
                <X size={15} />
              </button>
            )}

          </div>


          <div className="transaction-date-filter">
            <div className="date-range-field">
              <CalendarDays size={15} />
              <div>
                <span>From</span>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                  aria-label="From date"
                />
              </div>
            </div>

            <span className="date-range-arrow">→</span>

            <div className="date-range-field">
              <CalendarDays size={15} />
              <div>
                <span>To</span>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                  aria-label="To date"
                />
              </div>
            </div>

            <button
              type="button"
              className="today-date-btn"
              onClick={() => {
                const today = getLocalDateInputValue();
                setFromDate(today);
                setToDate(today);
              }}
              disabled={
                fromDate === getLocalDateInputValue() &&
                toDate === getLocalDateInputValue()
              }
            >
              Today
            </button>
          </div>


          <div className="transaction-select">

            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value)
              }
            >
              <option value="all">
                All Purposes
              </option>

              <option value="print">
                Printout
              </option>

              <option value="xerox">
                Xerox
              </option>

              <option value="color">
                Color Print
              </option>

              <option value="scan">
                Scan
              </option>

              <option value="online">
                Online Service
              </option>

              <option value="money-transfer">
                Money Transfer
              </option>

              <option value="withdrawal">
                Withdrawal
              </option>

              <option value="eb-bill">
                EB Bill Payment
              </option>

              <option value="service">
                Other Services
              </option>
            </select>

            <ChevronDown size={15} />

          </div>


          <div className="transaction-select">

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
            >
              <option value="all">
                All Status
              </option>

              <option value="completed">
                Completed
              </option>

              <option value="pending">
                Pending
              </option>

              <option value="processing">
                Processing
              </option>

              <option value="cancelled">
                Cancelled
              </option>

            </select>

            <ChevronDown size={15} />

          </div>

        </div>


        {/* -------------------------------------------
            Error
        -------------------------------------------- */}

        {error && (
          <div className="transactions-error">
            <strong>Some data could not be loaded.</strong>
            <span>{error}</span>
          </div>
        )}


        {/* -------------------------------------------
            Loading
        -------------------------------------------- */}

        {loading ? (

          <div className="transactions-state">

            <div className="transactions-loader">
              <RefreshCw size={23} />
            </div>

            <h3>Loading transactions...</h3>

            <p>
              Fetching your transaction history.
            </p>

          </div>

        ) : filteredTransactions.length === 0 ? (

          <div className="transactions-state empty">

            <div className="transactions-empty-icon">
              <Receipt size={30} />
            </div>

            <h3>
              {search ||
                typeFilter !== "all" ||
                statusFilter !== "all"
                ? "No matching transactions"
                : "No transactions yet"}
            </h3>

            <p>
              {search ||
                typeFilter !== "all" ||
                statusFilter !== "all"
                ? "Try changing your search or filters."
                : "Your completed services, transfers, withdrawals and EB bill payments will appear here."}
            </p>

            {(search ||
              typeFilter !== "all" ||
              statusFilter !== "all") && (
                <button
                  className="clear-filters-btn"
                  onClick={() => {
                    setSearch("");
                    setTypeFilter("all");
                    setStatusFilter("all");
                  }}
                >
                  Clear Filters
                </button>
              )}

          </div>

        ) : (

          <div className="transactions-table-wrap">

            <table className="transactions-table">

              <thead>
                <tr>
                  <th>Purpose</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Charge</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>

                {filteredTransactions.map(
                  (transaction) => {

                    const purpose =
                      getPurpose(transaction);

                    const PurposeIcon =
                      purpose.icon;

                    return (
                      <tr
                        key={`${transaction.source}-${transaction.id}`}
                      >

                        {/* Purpose */}

                        <td>

                          <div
                            className={`purpose-cell ${purpose.type}`}
                          >

                            <div className="purpose-icon">
                              <PurposeIcon size={17} />
                            </div>

                            <div>
                              <strong>
                                {purpose.label}
                              </strong>

                              <span>
                                {transaction.source ===
                                  "moneyTransfer"
                                  ? "Money Transfer"
                                  : transaction.source ===
                                    "withdrawal"
                                    ? "Cash Withdrawal"
                                    : transaction.source ===
                                      "ebBillPayment"
                                      ? "EB Bill Payment"
                                      : "Service"}
                              </span>
                            </div>

                          </div>

                        </td>


                        {/* Customer */}

                        <td>

                          <div className="customer-cell">

                            <div className="customer-avatar">
                              {String(
                                transaction.customerName ||
                                "C"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div>
                              <strong>
                                {transaction.customerName}
                              </strong>

                              <span>
                                {transaction.mobile}
                              </span>
                            </div>

                          </div>

                        </td>


                        {/* Amount */}

                        <td>

                          <div className="amount-cell">

                            <strong>
                              {formatCurrency(
                                transaction.amount
                              )}
                            </strong>

                            {transaction.source !==
                              "transactions" && (
                                <span>
                                  Base Amount
                                </span>
                              )}

                          </div>

                        </td>


                        {/* Charge */}

                        <td>

                          <span className="charge-value">
                            {formatCurrency(
                              transaction.serviceCharge
                            )}
                          </span>

                        </td>


                        {/* Payment */}

                        <td>

                          <span
                            className={`payment-badge ${String(
                              transaction.paymentMethod
                            )
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {transaction.paymentMethod}
                          </span>

                        </td>


                        {/* Status */}

                        <td>

                          <span
                            className={`status-badge ${transaction.status}`}
                          >
                            {transaction.status ===
                              "completed" ? (
                              <CheckCircle2 size={13} />
                            ) : (
                              <Clock3 size={13} />
                            )}

                            {transaction.status}
                          </span>

                        </td>


                        {/* Date */}

                        <td>

                          <div className="date-cell">

                            <strong>
                              {formatDate(
                                transaction.createdAt
                              )}
                            </strong>

                            <span>
                              {formatTime(
                                transaction.createdAt
                              )}
                            </span>

                          </div>

                        </td>


                        {/* View */}

                        <td>

                          <div className="transaction-actions">
                            <button
                              className="view-transaction-btn"
                              onClick={() =>
                                setSelectedTransaction(
                                  transaction
                                )
                              }
                              title="View details"
                            >
                              <Eye size={17} />
                            </button>

                            <button
                              className="print-transaction-btn"
                              onClick={() =>
                                printTransactionReceipt(
                                  transaction
                                )
                              }
                              title="Print bill"
                            >
                              <Printer size={17} />
                            </button>
                          </div>

                        </td>

                      </tr>
                    );
                  }
                )}

              </tbody>

            </table>

          </div>

        )}

      </div>


      {/* ---------------------------------------------
          Details Modal
      ---------------------------------------------- */}

      {selectedTransaction && (() => {

        const purpose =
          getPurpose(selectedTransaction);

        const PurposeIcon =
          purpose.icon;

        return (

          <div
            className="transaction-modal-backdrop"
            onMouseDown={(e) => {
              if (
                e.target === e.currentTarget
              ) {
                setSelectedTransaction(null);
              }
            }}
          >

            <div className="transaction-modal">

              <div className="transaction-modal-header">

                <div className="transaction-modal-title">

                  <div
                    className={`modal-purpose-icon ${purpose.type}`}
                  >
                    <PurposeIcon size={21} />
                  </div>

                  <div>
                    <span>
                      TRANSACTION DETAILS
                    </span>

                    <h2>
                      {purpose.label}
                    </h2>
                  </div>

                </div>

                <button
                  className="transaction-modal-close"
                  onClick={() =>
                    setSelectedTransaction(null)
                  }
                >
                  <X size={19} />
                </button>

              </div>


              <div className="transaction-modal-body">

                {/* Amount */}

                <div className="modal-total-box">

                  <span>
                    {selectedTransaction.source ===
                      "moneyTransfer"
                      ? "TRANSFER AMOUNT"
                      : selectedTransaction.source ===
                        "withdrawal"
                        ? "WITHDRAWAL AMOUNT"
                        : selectedTransaction.source ===
                          "ebBillPayment"
                          ? "BILL AMOUNT"
                          : "TRANSACTION AMOUNT"}
                  </span>

                  <strong>
                    {formatCurrency(
                      selectedTransaction.amount
                    )}
                  </strong>

                  <small>
                    +
                    {" "}
                    {formatCurrency(
                      selectedTransaction.serviceCharge
                    )}
                    {" "}service charge
                  </small>

                </div>


                <div className="transaction-detail-grid">

                  <div className="transaction-detail-item">
                    <span>Customer</span>
                    <strong>
                      {selectedTransaction.customerName}
                    </strong>
                  </div>

                  <div className="transaction-detail-item">
                    <span>Mobile</span>
                    <strong>
                      {selectedTransaction.mobile}
                    </strong>
                  </div>

                  <div className="transaction-detail-item">
                    <span>Purpose</span>
                    <strong>
                      {purpose.label}
                    </strong>
                  </div>

                  <div className="transaction-detail-item">
                    <span>Payment Method</span>
                    <strong>
                      {selectedTransaction.paymentMethod}
                    </strong>
                  </div>

                  <div className="transaction-detail-item">
                    <span>Service Charge</span>
                    <strong>
                      {formatCurrency(
                        selectedTransaction.serviceCharge
                      )}
                    </strong>
                  </div>

                  <div className="transaction-detail-item">
                    <span>Customer Pays</span>
                    <strong>
                      {formatCurrency(
                        selectedTransaction.customerPays
                      )}
                    </strong>
                  </div>

                  <div className="transaction-detail-item">
                    <span>Status</span>

                    <strong>
                      <span
                        className={`status-badge ${selectedTransaction.status}`}
                      >
                        {selectedTransaction.status}
                      </span>
                    </strong>
                  </div>

                  <div className="transaction-detail-item">
                    <span>Date</span>

                    <strong>
                      {formatDate(
                        selectedTransaction.createdAt
                      )}
                    </strong>
                  </div>

                </div>


                <div className="transaction-id-box">

                  <span>
                    Transaction ID
                  </span>

                  <code>
                    {selectedTransaction.id}
                  </code>

                </div>

              </div>


              <div className="transaction-modal-footer">

                <button
                  onClick={() =>
                    setSelectedTransaction(null)
                  }
                >
                  Close
                </button>

              </div>

            </div>

          </div>
        );
      })()}

    </div>
  );
}