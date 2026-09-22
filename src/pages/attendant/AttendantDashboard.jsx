import React, { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock3,
  IndianRupee,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Smartphone,
  TrendingUp,
  WalletCards,
  CreditCard,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTransactions } from "../../hooks/useTransactions";
import { formatCurrency } from "../../utils/currency";
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

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}) {
  return (
    <div className={`att-stat-card ${tone}`}>
      <div className="att-stat-top">
        <div className="att-stat-icon">
          <Icon size={19} strokeWidth={2.2} />
        </div>

        <span className="att-stat-dot" />
      </div>

      <div className="att-stat-content">
        <span className="att-stat-label">{label}</span>

        <strong className="att-stat-value">
          {value}
        </strong>

        <span className="att-stat-note">
          {note}
        </span>
      </div>
    </div>
  );
}

export default function AttendantDashboard() {
  const { user, profile } = useAuth();

  const {
    transactions: rawTransactions,
    loading,
    error,
  } = useTransactions(100);

  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");

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
      {/* HEADER */}
      <header className="att-dashboard-header">
        <div className="att-header-copy">
          <div className="att-eyebrow">
            <span className="att-live-dot" />
            COUNTER WORKSPACE
          </div>

          <h1>
            Good morning,{" "}
            <span>{attendantName}</span>
          </h1>

          <p>
            Keep track of today's sales,
            collections and counter activity.
          </p>
        </div>

        <div className="att-header-actions">
          <div className="att-live-status">
            <span className="att-live-pulse" />
            Live data
          </div>

          <Link
            to="/attendant/new-transaction"
            className="att-primary-btn"
          >
            <Plus size={17} />
            New transaction
          </Link>
        </div>
      </header>

      {/* QUICK STATS */}
      <section className="att-stat-grid">
        <StatCard
          icon={IndianRupee}
          label="Today's sales"
          value={formatCurrency(totals.sales)}
          note={`${totals.transactions} transaction${totals.transactions === 1
            ? ""
            : "s"
            } today`}
          tone="violet"
        />

        <StatCard
          icon={TrendingUp}
          label="Today's profit"
          value={formatCurrency(totals.profit)}
          note="Based on recorded service costs"
          tone="green"
        />

        <StatCard
          icon={ReceiptText}
          label="Transactions"
          value={totals.transactions}
          note="Your completed bills today"
          tone="blue"
        />

        <StatCard
          icon={Banknote}
          label="Cash collected"
          value={formatCurrency(totals.cash)}
          note="Cash payment collection"
          tone="amber"
        />
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

                          <div className="att-tx-payment">
                            <PaymentIcon
                              size={
                                14
                              }
                            />

                            {payment}
                          </div>

                          <div className="att-tx-time">
                            <Clock3
                              size={
                                13
                              }
                            />

                            {formatTime(
                              transaction.createdAt
                            )}
                          </div>

                          <strong className="att-tx-amount">
                            {formatCurrency(
                              total
                            )}
                          </strong>

                          <ChevronRight
                            size={
                              16
                            }
                            className="att-tx-chevron"
                          />
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
                {formatCurrency(
                  totals.sales
                )}
              </strong>
            </div>

            <div className="att-payment-bars">
              <div className="att-payment-bar-row">
                <div className="att-payment-label">
                  <span className="att-payment-dot cash" />
                  Cash
                </div>

                <strong>
                  {formatCurrency(
                    totals.cash
                  )}
                </strong>
              </div>

              <div className="att-bar">
                <span
                  style={{
                    width:
                      paymentTotal >
                        0
                        ? `${(totals.cash /
                          paymentTotal) *
                        100
                        }%`
                        : "0%",
                  }}
                />
              </div>

              <div className="att-payment-bar-row">
                <div className="att-payment-label">
                  <span className="att-payment-dot upi" />
                  UPI
                </div>

                <strong>
                  {formatCurrency(
                    totals.upi
                  )}
                </strong>
              </div>

              <div className="att-bar">
                <span
                  style={{
                    width:
                      paymentTotal >
                        0
                        ? `${(totals.upi /
                          paymentTotal) *
                        100
                        }%`
                        : "0%",
                  }}
                />
              </div>

              <div className="att-payment-bar-row">
                <div className="att-payment-label">
                  <span className="att-payment-dot card" />
                  Card
                </div>

                <strong>
                  {formatCurrency(
                    totals.card
                  )}
                </strong>
              </div>

              <div className="att-bar">
                <span
                  style={{
                    width:
                      paymentTotal >
                        0
                        ? `${(totals.card /
                          paymentTotal) *
                        100
                        }%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div className="att-panel att-actions-panel">
            <div className="att-panel-head compact">
              <div>
                <span className="att-panel-kicker">
                  SHORTCUTS
                </span>

                <h2>
                  Quick actions
                </h2>
              </div>
            </div>

            <div className="att-action-list">
              <Link
                to="/attendant/new-transaction"
                className="att-action-card primary"
              >
                <div className="att-action-icon">
                  <Plus size={19} />
                </div>

                <div>
                  <strong>
                    New transaction
                  </strong>

                  <span>
                    Create a new customer
                    bill
                  </span>
                </div>

                <ArrowUpRight
                  size={16}
                />
              </Link>

              <Link
                to="/attendant/transactions"
                className="att-action-card"
              >
                <div className="att-action-icon">
                  <ReceiptText
                    size={18}
                  />
                </div>

                <div>
                  <strong>
                    My transactions
                  </strong>

                  <span>
                    Review your sales
                    history
                  </span>
                </div>

                <ArrowUpRight
                  size={16}
                />
              </Link>

              <Link
                to="/attendant/cash"
                className="att-action-card"
              >
                <div className="att-action-icon">
                  <Banknote size={18} />
                </div>

                <div>
                  <strong>
                    Cash register
                  </strong>

                  <span>
                    Manage counter cash
                  </span>
                </div>

                <ArrowUpRight
                  size={16}
                />
              </Link>
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
    </div>
  );
}