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
  RefreshCw,
  ChevronDown,
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

import "./MyTransactions.css";


// --------------------------------------------------
// Helpers
// --------------------------------------------------

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
      "Unknown Customer",

    mobile:
      data.mobile ||
      data.phone ||
      data.phoneNumber ||
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    let transactionsLoaded = false;
    let transfersLoaded = false;
    let withdrawalsLoaded = false;

    const checkLoaded = () => {
      if (
        transactionsLoaded &&
        transfersLoaded &&
        withdrawalsLoaded
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


    return () => {
      unsubscribeTransactions();
      unsubscribeTransfers();
      unsubscribeWithdrawals();
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
    ].sort(
      (a, b) =>
        getTimestamp(b.createdAt) -
        getTimestamp(a.createdAt)
    );
  }, [
    transactions,
    moneyTransfers,
    withdrawals,
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

      return (
        matchesSearch &&
        matchesType &&
        matchesStatus
      );
    });
  }, [
    allTransactions,
    search,
    typeFilter,
    statusFilter,
  ]);


  // --------------------------------------------------
  // Statistics
  // --------------------------------------------------

  const stats = useMemo(() => {
    const total = allTransactions.length;

    const completed = allTransactions.filter(
      (item) => item.status === "completed"
    ).length;

    const pending = allTransactions.filter(
      (item) =>
        item.status === "pending" ||
        item.status === "processing"
    ).length;

    const totalValue = allTransactions.reduce(
      (sum, item) =>
        sum + Number(item.customerPays || 0),
      0
    );

    const totalCharges = allTransactions.reduce(
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
  }, [allTransactions]);


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
              View your services, money transfers and
              withdrawals in one place.
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

            <h2>All Activity</h2>

            <p>
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
                : "Your completed services, transfers and withdrawals will appear here."}
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