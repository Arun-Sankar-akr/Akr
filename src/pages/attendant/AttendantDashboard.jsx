import React, { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Smartphone,
  WalletCards,
  CreditCard,
  Eye,
  EyeOff,
  Zap,
  ArrowLeftRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTransactions } from "../../hooks/useTransactions";
import { formatCurrency } from "../../utils/currency";
import FloatingCalculator from "./FloatingCalculator";
import "./AttendantDashboard.css";

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(timestamp) {
  if (!timestamp) return "Just now";

  try {
    const date =
      typeof timestamp?.toDate === "function"
        ? timestamp.toDate()
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "Recently";
    }

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Recently";
  }
}

function getTransactionDate(transaction) {
  if (transaction?.createdAt) {
    if (typeof transaction.createdAt.toDate === "function") {
      return transaction.createdAt.toDate();
    }

    const parsed = new Date(transaction.createdAt);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (transaction?.dateKey) {
    const parsed = new Date(`${transaction.dateKey}T00:00:00`);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function getTransactionTotal(transaction) {
  return Number(
    transaction?.total ??
    transaction?.amount ??
    transaction?.grandTotal ??
    0
  );
}

function getTransactionProfit(transaction) {
  return Number(
    transaction?.profit ??
    transaction?.grossProfit ??
    0
  );
}

function getPaymentLabel(method) {
  const value = String(method || "cash").toLowerCase();

  if (value.includes("upi")) return "UPI";
  if (value.includes("card")) return "Card";
  if (value.includes("cash")) return "Cash";
  if (value.includes("bank")) return "Bank";
  if (value.includes("wallet")) return "Wallet";

  return method || "Cash";
}

function getPaymentIcon(method) {
  const label = getPaymentLabel(method);

  if (label === "UPI") return Smartphone;
  if (label === "Card") return CreditCard;
  if (label === "Bank") return Banknote;

  return WalletCards;
}

function getStatusLabel(status) {
  const value = String(status || "completed").toLowerCase();

  if (
    value === "completed" ||
    value === "paid" ||
    value === "success" ||
    value === "successful"
  ) {
    return "Completed";
  }

  if (value === "pending") {
    return "Pending";
  }

  if (value === "cancelled" || value === "canceled") {
    return "Cancelled";
  }

  return status || "Completed";
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const PAYMENT_ROWS = [
  { key: "cash", label: "Cash", Icon: WalletCards },
  { key: "upi", label: "UPI", Icon: Smartphone },
  { key: "card", label: "Card", Icon: CreditCard },
];

const QUICK_ACTIONS = [
  ["New bill", "/attendant/new-transaction", Plus],
  ["EB bill", "/attendant/eb", Zap],
  ["Transfer", "/attendant/money-transfer", ArrowLeftRight],
  ["Cash", "/attendant/cash", Banknote],
];

export default function AttendantDashboard() {
  const { user, profile } = useAuth();

  const {
    transactions: rawTransactions,
    loading,
    error,
  } = useTransactions(100);

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [hideAmounts, setHideAmounts] = useState(false);

  const money = (value) =>
    hideAmounts ? "₹ ••••" : formatCurrency(value);

  const transactions = Array.isArray(rawTransactions)
    ? rawTransactions
    : [];

  /*
   * Filter by the logged-in attendant.
   *
   * Supports both the new `attendantId` field and the
   * older `staffId` field so existing records continue
   * to work.
   */
  const myTransactions = useMemo(() => {
    if (!user?.uid) return [];

    return transactions.filter((transaction) => {
      const transactionAttendant =
        transaction.attendantId ||
        transaction.staffId;

      return transactionAttendant === user.uid;
    });
  }, [transactions, user?.uid]);

  const todayTransactions = useMemo(() => {
    const todayKey = getDateKey();

    return myTransactions.filter((transaction) => {
      if (transaction.dateKey) {
        return transaction.dateKey === todayKey;
      }

      const transactionDate =
        getTransactionDate(transaction);

      return (
        transactionDate &&
        getDateKey(transactionDate) === todayKey
      );
    });
  }, [myTransactions]);

  const totals = useMemo(() => {
    return todayTransactions.reduce(
      (acc, transaction) => {
        const total =
          getTransactionTotal(transaction);

        const profit =
          getTransactionProfit(transaction);

        const payment =
          getPaymentLabel(
            transaction.paymentMethod
          );

        acc.sales += total;
        acc.profit += profit;
        acc.transactions += 1;

        if (payment === "Cash") {
          acc.cash += total;
        }

        if (payment === "UPI") {
          acc.upi += total;
        }

        if (payment === "Card") {
          acc.card += total;
        }

        return acc;
      },
      {
        sales: 0,
        profit: 0,
        transactions: 0,
        cash: 0,
        upi: 0,
        card: 0,
      }
    );
  }, [todayTransactions]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...todayTransactions]
      .sort((a, b) => {
        const dateA =
          getTransactionDate(a)?.getTime() || 0;

        const dateB =
          getTransactionDate(b)?.getTime() || 0;

        return dateB - dateA;
      })
      .filter((transaction) => {
        const payment =
          getPaymentLabel(
            transaction.paymentMethod
          );

        const matchesPayment =
          paymentFilter === "all" ||
          payment.toLowerCase() ===
          paymentFilter.toLowerCase();

        if (!matchesPayment) {
          return false;
        }

        if (!query) return true;

        const invoice =
          transaction.invoiceNo ||
          transaction.invoiceNumber ||
          transaction.id ||
          "";

        const serviceText =
          Array.isArray(transaction.items)
            ? transaction.items
              .map(
                (item) =>
                  item.serviceName ||
                  item.name ||
                  ""
              )
              .join(" ")
            : "";

        return `${invoice} ${payment} ${serviceText}`
          .toLowerCase()
          .includes(query);
      });
  }, [
    todayTransactions,
    search,
    paymentFilter,
  ]);

  const paymentTotal =
    totals.cash + totals.upi + totals.card;

  const attendantName =
    profile?.name ||
    profile?.displayName ||
    user?.displayName ||
    "Attendant";

  const initials = attendantName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="attendant-dashboard">
      {/* HERO */}
      <section className="att-hero">
        <div className="att-hero-top">
          <div className="att-hero-avatar">{initials || "A"}</div>

          <div className="att-hero-hello">
            <span>{getGreeting()}!</span>
            <strong>{attendantName}</strong>
          </div>

          <span className="att-live-status">
            <span className="att-live-pulse" />
            Live
          </span>
        </div>

        <div className="att-hero-label">
          Today's sales
          <button
            type="button"
            className="att-eye"
            onClick={() => setHideAmounts((value) => !value)}
            aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
          >
            {hideAmounts ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <strong className="att-hero-value">{money(totals.sales)}</strong>

        <div className="att-hero-sub">
          <span>
            <ReceiptText size={13} />
            {totals.transactions} transaction
            {totals.transactions === 1 ? "" : "s"}
          </span>
          <span>
            <Clock3 size={13} />
            {new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        <div className="att-hero-actions">
          <Link to="/attendant/new-transaction" className="att-hero-btn">
            <Plus size={17} />
            New transaction
          </Link>

          <Link to="/attendant/transactions" className="att-hero-btn">
            <ReceiptText size={17} />
            My transactions
          </Link>
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <section className="att-quick-wrap">
        <h3 className="att-section-title">Quick Actions</h3>

        <div className="att-quick">
          {QUICK_ACTIONS.map(([label, to, Icon]) => (
            <Link to={to} className="att-quick-tile" key={to}>
              <Icon size={22} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ERROR */}
      {error && (
        <div className="att-alert error">
          <div className="att-alert-icon">
            !
          </div>

          <div>
            <strong>
              Unable to load transactions
            </strong>

            <span>
              Check your Firebase connection
              and Firestore permissions.
            </span>
          </div>
        </div>
      )}

      {/* MAIN GRID */}
      <section className="att-main-grid">
        {/* ACTIVITY */}
        <div className="att-panel att-activity-panel">
          <div className="att-panel-head">
            <div>
              <span className="att-panel-kicker">
                TODAY
              </span>

              <h2>
                Your activity
              </h2>

              <p>
                Latest transactions from
                your counter.
              </p>
            </div>

            <Link
              to="/attendant/transactions"
              className="att-text-link"
            >
              View all
              <ArrowUpRight size={14} />
            </Link>
          </div>

          {/* SEARCH */}
          <div className="att-toolbar">
            <div className="att-search">
              <Search size={17} />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search invoice or service..."
              />

              {search && (
                <button
                  type="button"
                  className="att-search-clear"
                  onClick={() =>
                    setSearch("")
                  }
                >
                  ×
                </button>
              )}
            </div>

            <select
              value={paymentFilter}
              onChange={(event) =>
                setPaymentFilter(
                  event.target.value
                )
              }
              className="att-filter"
            >
              <option value="all">
                All payments
              </option>
              <option value="cash">
                Cash
              </option>
              <option value="upi">
                UPI
              </option>
              <option value="card">
                Card
              </option>
            </select>
          </div>

          {/* LOADING */}
          {loading && (
            <div className="att-loading">
              <div className="att-spinner">
                <RefreshCw size={18} />
              </div>

              <div>
                <strong>
                  Loading activity
                </strong>

                <span>
                  Syncing with Firebase...
                </span>
              </div>
            </div>
          )}

          {/* EMPTY */}
          {!loading &&
            !error &&
            filteredTransactions.length ===
            0 && (
              <div className="att-empty">
                <div className="att-empty-icon">
                  <ReceiptText size={24} />
                </div>

                <h3>
                  {search ||
                    paymentFilter !==
                    "all"
                    ? "No matching transactions"
                    : "No transactions yet"}
                </h3>

                <p>
                  {search ||
                    paymentFilter !==
                    "all"
                    ? "Try changing your search or payment filter."
                    : "Your completed bills will appear here automatically."}
                </p>

                {!search &&
                  paymentFilter ===
                  "all" && (
                    <Link
                      to="/attendant/new-transaction"
                      className="att-empty-btn"
                    >
                      <Plus size={16} />
                      Create first bill
                    </Link>
                  )}
              </div>
            )}

          {/* TRANSACTION LIST */}
          {!loading &&
            filteredTransactions.length >
            0 && (
              <div className="att-transaction-list">
                {filteredTransactions
                  .slice(0, 8)
                  .map(
                    (
                      transaction
                    ) => {
                      const total =
                        getTransactionTotal(
                          transaction
                        );

                      const payment =
                        getPaymentLabel(
                          transaction.paymentMethod
                        );

                      const PaymentIcon =
                        getPaymentIcon(
                          payment
                        );

                      const invoice =
                        transaction.invoiceNo ||
                        transaction.invoiceNumber ||
                        `#${String(
                          transaction.id ||
                          ""
                        ).slice(
                          0,
                          8
                        )}`;

                      const serviceNames =
                        Array.isArray(
                          transaction.items
                        )
                          ? transaction.items
                            .slice(
                              0,
                              2
                            )
                            .map(
                              (
                                item
                              ) =>
                                item.serviceName ||
                                item.name ||
                                "Service"
                            )
                            .join(
                              ", "
                            )
                          : "Shop service";

                      return (
                        <div
                          className="att-transaction-row"
                          key={
                            transaction.id
                          }
                        >
                          <div className="att-tx-icon">
                            <ReceiptText
                              size={
                                18
                              }
                            />
                          </div>

                          <div className="att-tx-main">
                            <div className="att-tx-title">
                              <strong>
                                {
                                  invoice
                                }
                              </strong>

                              <span className="att-status">
                                <CheckCircle2
                                  size={
                                    12
                                  }
                                />
                                {getStatusLabel(
                                  transaction.status
                                )}
                              </span>
                            </div>

                            <span className="att-tx-services">
                              {
                                serviceNames
                              }
                            </span>
                          </div>

                          <div className="att-tx-meta">
                            <span className="att-tx-payment">
                              <PaymentIcon size={13} />
                              {payment}
                            </span>

                            <span className="att-tx-time">
                              <Clock3 size={12} />
                              {formatTime(transaction.createdAt)}
                            </span>
                          </div>

                          <strong className="att-tx-amount">
                            {formatCurrency(
                              total
                            )}
                          </strong>

                        </div>
                      );
                    }
                  )}
              </div>
            )}

          {!loading &&
            filteredTransactions.length >
            8 && (
              <Link
                to="/attendant/transactions"
                className="att-view-more"
              >
                View all today's transactions
                <ArrowUpRight
                  size={15}
                />
              </Link>
            )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="att-side-column">
          {/* PAYMENT CARD */}
          <div className="att-panel att-payment-panel">
            <div className="att-panel-head compact">
              <div>
                <span className="att-panel-kicker">
                  COLLECTION
                </span>

                <h2>
                  Payment overview
                </h2>
              </div>
            </div>

            <div className="att-payment-total">
              <span>
                Today's collection
              </span>

              <strong>
                {money(totals.sales)}
              </strong>
            </div>

            <div className="att-payment-bars">
              {PAYMENT_ROWS.map(({ key, label }) => {
                const percent =
                  paymentTotal > 0
                    ? Math.round((totals[key] / paymentTotal) * 100)
                    : 0;

                return (
                  <div className="att-payment-item" key={key}>
                    <div className="att-payment-bar-row">
                      <div className="att-payment-label">
                        <span className={`att-payment-dot ${key}`} />
                        {label}
                        <em>{percent}%</em>
                      </div>

                      <strong>{money(totals[key])}</strong>
                    </div>

                    <div className="att-bar">
                      <span
                        className={key}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ATTENDANT PROFILE */}
          <div className="att-profile-card">
            <div className="att-profile-avatar">
              {initials || "A"}
            </div>

            <div className="att-profile-info">
              <span>
                SIGNED IN AS
              </span>

              <strong>
                {attendantName}
              </strong>

              <small>
                {profile?.role ||
                  "attendant"}
              </small>
            </div>

            <div className="att-profile-online">
              <span />
              Online
            </div>
          </div>
        </div>
      </section>

      {/* FLOATING CALCULATOR */}
      <FloatingCalculator />
    </div>
  );
}