import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Eye,
  EyeOff,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Smartphone,
  WalletCards,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTransactions } from "../../hooks/useTransactions";
import { formatCurrency } from "../../utils/currency";
import { useRegisterProfit } from "../../utils/registerProfit";
import FloatingCalculator from "./FloatingCalculator";
import "./AttendantDashboard.css";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

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
  return Number(transaction?.profit ?? transaction?.grossProfit ?? 0);
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

function getPaymentTone(method) {
  const label = getPaymentLabel(method);

  if (label === "UPI") return "upi";
  if (label === "Card") return "card";
  if (label === "Bank") return "bank";

  return "cash";
}

function getStatusKey(status) {
  const value = String(status || "completed").toLowerCase();

  if (value === "pending") return "pending";
  if (value === "cancelled" || value === "canceled") return "cancelled";

  return "completed";
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatAmount(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-IN");
}

function formatCompact(value) {
  const number = Number(value) || 0;

  if (number >= 100000) return `₹${+(number / 100000).toFixed(1)}L`;
  if (number >= 1000) return `₹${+(number / 1000).toFixed(1)}K`;

  return `₹${Math.round(number)}`;
}

/* Round axis ceiling (1 / 2 / 2.5 / 5 / 10 x 10^n) so the top label is
 * always a clean number like the reference video (e.g. max 2.8K -> 5K). */
function getNiceMax(value) {
  const v = Math.max(Number(value) || 0, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= v) || 10;

  return step * pow;
}

function formatSigned(value) {
  const number = Math.round(Number(value) || 0);
  const text = Math.abs(number).toLocaleString("en-IN");

  return number < 0 ? `-₹${text}` : `₹${text}`;
}

/*
 * Odometer-style number: every digit sits in a 0-9 strip and slides
 * to its value (like the reference video). Digits are keyed from the
 * right so a digit keeps its column when the number gets longer.
 */
function RollingNumber({ value, masked }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (masked) return <span className="att-roll-mask">••••</span>;

  const chars = Math.abs(Math.round(Number(value) || 0))
    .toLocaleString("en-IN")
    .split("");

  return (
    <span className="att-roll" aria-label={String(Math.round(value || 0))}>
      {chars.map((char, index) => {
        const fromRight = chars.length - 1 - index;

        if (!/\d/.test(char)) {
          return (
            <span className="att-roll-sep" key={`s${fromRight}`} aria-hidden="true">
              {char}
            </span>
          );
        }

        const digit = ready ? Number(char) : 0;

        return (
          <span className="att-roll-digit" key={`d${fromRight}`} aria-hidden="true">
            <span
              className="att-roll-strip"
              style={{
                transform: `translateY(calc(var(--roll-h) * -${digit}))`,
                transitionDelay: `${Math.min(fromRight, 6) * 55}ms`,
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const PAYMENT_ROWS = [
  { key: "cash", label: "Cash" },
  { key: "upi", label: "UPI" },
  { key: "card", label: "Card" },
];

const PAYMENT_FILTERS = [
  { key: "all", label: "All" },
  { key: "cash", label: "Cash" },
  { key: "upi", label: "UPI" },
  { key: "card", label: "Card" },
];

const QUICK_ACTIONS = [
  ["New bill", "/attendant/new-transaction", Plus],
  ["EB bill", "/attendant/eb", Zap],
  ["Transfer", "/attendant/money-transfer", ArrowLeftRight],
  ["Cash", "/attendant/cash", Banknote],
];

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

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
  const [range, setRange] = useState("week"); // "week" | "month"

  // Profit = "Diff Without Credit" of the closed cash registers.
  const registerProfit = useRegisterProfit(user?.uid);

  const money = (value) => (hideAmounts ? "₹ ••••" : formatCurrency(value));

  const transactions = Array.isArray(rawTransactions) ? rawTransactions : [];

  /*
   * Filter by the logged-in attendant.
   * Supports both the new `attendantId` field and the older
   * `staffId` field so existing records continue to work.
   */
  const myTransactions = useMemo(() => {
    if (!user?.uid) return [];

    return transactions.filter((transaction) => {
      const transactionAttendant =
        transaction.attendantId || transaction.staffId;

      return transactionAttendant === user.uid;
    });
  }, [transactions, user?.uid]);

  const todayTransactions = useMemo(() => {
    const todayKey = getDateKey();

    return myTransactions.filter((transaction) => {
      if (transaction.dateKey) {
        return transaction.dateKey === todayKey;
      }

      const transactionDate = getTransactionDate(transaction);

      return transactionDate && getDateKey(transactionDate) === todayKey;
    });
  }, [myTransactions]);

  const totals = useMemo(() => {
    return todayTransactions.reduce(
      (acc, transaction) => {
        const total = getTransactionTotal(transaction);
        const profit = getTransactionProfit(transaction);
        const payment = getPaymentLabel(transaction.paymentMethod);

        acc.sales += total;
        acc.profit += profit;
        acc.transactions += 1;

        if (payment === "Cash") acc.cash += total;
        if (payment === "UPI") acc.upi += total;
        if (payment === "Card") acc.card += total;

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

  /* ---------- week / month chart ---------- */
  const chart = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let buckets = [];
    let bucketDays = 1;
    let elapsedDays = 1;

    if (range === "week") {
      const mondayOffset = (today.getDay() + 6) % 7;
      const start = new Date(today);
      start.setDate(today.getDate() - mondayOffset);

      buckets = WEEK_LABELS.map((label, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + index);

        return {
          label,
          showLabel: true,
          key: getDateKey(day),
          total: 0,
          future: day > today,
          current: index === mondayOffset,
        };
      });

      bucketDays = 1;
      elapsedDays = mondayOffset + 1;

      registerProfit.forEach((entry) => {
        const bucket = buckets.find((item) => item.key === entry.dateKey);

        if (bucket) bucket.total += entry.profit;
      });
    } else {
      const year = today.getFullYear();
      const month = today.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const todayDate = today.getDate();

      // one thin bar per day, labels on 1 / 8 / 15 / 22 / 29
      buckets = Array.from({ length: daysInMonth }, (_, index) => ({
        label: String(index + 1),
        showLabel: index % 7 === 0,
        total: 0,
        future: index + 1 > todayDate,
        current: index + 1 === todayDate,
      }));

      bucketDays = 1;
      elapsedDays = todayDate;

      registerProfit.forEach((entry) => {
        const date = new Date(`${entry.dateKey}T00:00:00`);

        if (Number.isNaN(date.getTime())) return;
        if (date.getFullYear() !== year || date.getMonth() !== month) return;

        const bucket = buckets[date.getDate() - 1];

        if (bucket) bucket.total += entry.profit;
      });
    }

    const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
    const dailyAverage = elapsedDays > 0 ? total / elapsedDays : 0;
    const limit = dailyAverage * bucketDays;
    const max = Math.max(...buckets.map((bucket) => bucket.total), 1);
    const axisMax = getNiceMax(max);

    const bars = buckets.map((bucket) => {
      const over =
        !bucket.current && limit > 0 && bucket.total > limit
          ? bucket.total - limit
          : 0;

      return {
        ...bucket,
        over,
        base: Math.max(bucket.total - over, 0),
        height: (Math.max(bucket.total, 0) / axisMax) * 100,
        loss: bucket.total < 0,
      };
    });

    return { bars, total, dailyAverage, max, axisMax, range };
  }, [registerProfit, range]);

  /* Bars collapse, then regrow when switching week <-> month (like the
   * reference video). Plain data updates swap in immediately. */
  const [plot, setPlot] = useState(chart);
  const [collapsing, setCollapsing] = useState(false);
  const plotRangeRef = useRef(range);

  useEffect(() => {
    if (plotRangeRef.current === range) {
      setPlot(chart);
      setCollapsing(false);
      return undefined;
    }

    plotRangeRef.current = range;
    setCollapsing(true);

    const timer = setTimeout(() => {
      setPlot(chart);
      setCollapsing(false);
    }, 280);

    return () => clearTimeout(timer);
  }, [chart, range]);

  const todayProfit = useMemo(() => {
    const todayKey = getDateKey();

    return registerProfit
      .filter((entry) => entry.dateKey === todayKey)
      .reduce((sum, entry) => sum + entry.profit, 0);
  }, [registerProfit]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...todayTransactions]
      .sort((a, b) => {
        const dateA = getTransactionDate(a)?.getTime() || 0;
        const dateB = getTransactionDate(b)?.getTime() || 0;

        return dateB - dateA;
      })
      .filter((transaction) => {
        const payment = getPaymentLabel(transaction.paymentMethod);

        const matchesPayment =
          paymentFilter === "all" ||
          payment.toLowerCase() === paymentFilter.toLowerCase();

        if (!matchesPayment) return false;
        if (!query) return true;

        const invoice =
          transaction.invoiceNo ||
          transaction.invoiceNumber ||
          transaction.id ||
          "";

        const serviceText = Array.isArray(transaction.items)
          ? transaction.items
              .map((item) => item.serviceName || item.name || "")
              .join(" ")
          : "";

        return `${invoice} ${payment} ${serviceText}`
          .toLowerCase()
          .includes(query);
      });
  }, [todayTransactions, search, paymentFilter]);

  const paymentTotal = totals.cash + totals.upi + totals.card;

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

  const hasFilters = Boolean(search) || paymentFilter !== "all";

  const heroLabel = range === "week" ? "Profit this week" : "Profit this month";

  return (
    <div className="attendant-dashboard">
      {/* ============ TOP BAR ============ */}
      <header className="att-top">
        <div className="att-brand">
          <span>{getGreeting()}</span>
          <strong>
            {attendantName}
            <i className="att-brand-dot" />
          </strong>
        </div>

        <div className="att-top-right">
          <button
            type="button"
            className="att-pill att-icon-pill"
            onClick={() => setHideAmounts((value) => !value)}
            aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
          >
            {hideAmounts ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>

          <span className="att-pill att-date-pill">
            <span className="att-live-pulse" />
            {new Date().toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
            })}
          </span>

          <div className="att-avatar" aria-label="Signed in">
            {initials || "A"}
            <span className="att-online" />
          </div>
        </div>
      </header>

      {/* ============ ERROR ============ */}
      {error && (
        <div className="att-alert error">
          <div className="att-alert-icon">!</div>

          <div>
            <strong>Unable to load transactions</strong>
            <span>Check your Firebase connection and Firestore permissions.</span>
          </div>
        </div>
      )}

      <div className="att-grid">
        {/* ============ HERO ============ */}
        <section className="att-card att-hero">
          <div className="att-hero-head">
            <span className="att-hero-label">{heroLabel}</span>

            <div
              className="att-toggle"
              role="tablist"
              aria-label="Range"
              data-range={range}
            >
              <span className="att-toggle-thumb" aria-hidden="true" />
              {["week", "month"].map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={range === item}
                  className={range === item ? "active" : ""}
                  onClick={() => setRange(item)}
                >
                  {item === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>
          </div>

          <div
            className={`att-hero-value${chart.total < 0 ? " neg" : ""}`}
          >
            {!hideAmounts && chart.total < 0 && (
              <span className="att-hero-sign">-</span>
            )}
            <span className="att-hero-cur">₹</span>
            <RollingNumber value={chart.total} masked={hideAmounts} />
          </div>

          <div className="att-hero-avg">
            Daily average{" "}
            <strong>
              {hideAmounts ? "₹ ••••" : formatSigned(chart.dailyAverage)}
            </strong>
          </div>

          {/* chart */}
          <div className="att-chart">
            <div className="att-chart-main">
              <div className="att-chart-grid" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>

              <div
                className={`att-chart-plot ${plot.range}${
                  collapsing ? " collapsing" : ""
                }`}
                key={plot.range}
              >
                {plot.bars.map((bar, index) => (
                  <div
                    className="att-bar-col"
                    key={`${bar.label}-${index}`}
                    style={{ "--i": index }}
                  >
                    <div className="att-bar-track">
                      <div
                        className={`att-bar${bar.current ? " current" : ""}${
                          bar.total <= 0 ? " empty" : ""
                        }${bar.loss ? " loss" : ""}`}
                        style={{
                          height: bar.total > 0 ? `${bar.height}%` : undefined,
                        }}
                        title={hideAmounts ? "" : formatSigned(bar.total)}
                      >
                        {bar.base > 0 && (
                          <span
                            className="att-bar-base"
                            style={{ flexGrow: bar.base }}
                          />
                        )}
                        {bar.over > 0 && (
                          <span
                            className="att-bar-over"
                            style={{ flexGrow: bar.over }}
                          />
                        )}
                      </div>
                    </div>

                    {bar.showLabel && (
                      <span
                        className={`att-bar-label${
                          bar.current ? " current" : ""
                        }`}
                      >
                        {bar.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="att-chart-axis" aria-hidden="true">
              <span>{hideAmounts ? "••" : formatCompact(plot.axisMax)}</span>
              <span>{hideAmounts ? "••" : formatCompact(plot.axisMax / 2)}</span>
              <span>0</span>
            </div>
          </div>

          <div className="att-legend">
            <span className="att-legend-swatch" />
            Striped part is above your daily average profit
          </div>

          <div className="att-stats">
            <div>
              <span>Today's profit</span>
              <strong className={todayProfit < 0 ? "neg" : "pos"}>
                {hideAmounts ? "₹ ••••" : formatSigned(todayProfit)}
              </strong>
            </div>

            <div>
              <span>Sales</span>
              <strong>{money(totals.sales)}</strong>
            </div>

            <div>
              <span>Bills</span>
              <strong>{totals.transactions}</strong>
            </div>
          </div>
        </section>

        {/* ============ QUICK ACTIONS ============ */}
        <section className="att-quick">
          {QUICK_ACTIONS.map(([label, to, Icon]) => (
            <Link to={to} className="att-quick-tile" key={to}>
              <span className="att-quick-icon">
                <Icon size={19} />
              </span>
              <span>{label}</span>
            </Link>
          ))}
        </section>

        {/* ============ LATEST ============ */}
        <section className="att-card att-latest">
          <div className="att-latest-head">
            <h2>Latest</h2>

            <Link to="/attendant/transactions" className="att-text-link">
              All transactions
              <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="att-toolbar">
            <div className="att-search">
              <Search size={16} />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoice or service"
              />

              {search && (
                <button
                  type="button"
                  className="att-search-clear"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="att-chips">
              {PAYMENT_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={paymentFilter === key ? "active" : ""}
                  onClick={() => setPaymentFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="att-day-row">
            <span>Today</span>
            <em>
              {hideAmounts ? "₹ ••••" : formatCurrency(totals.sales)} collected
            </em>
          </div>

          {loading && (
            <div className="att-loading">
              <div className="att-spinner">
                <RefreshCw size={18} />
              </div>

              <div>
                <strong>Loading activity</strong>
                <span>Syncing with Firebase...</span>
              </div>
            </div>
          )}

          {!loading && !error && filteredTransactions.length === 0 && (
            <div className="att-empty">
              <div className="att-empty-icon">
                <ReceiptText size={22} />
              </div>

              <h3>
                {hasFilters ? "No matching transactions" : "No transactions yet"}
              </h3>

              <p>
                {hasFilters
                  ? "Try changing your search or payment filter."
                  : "Your completed bills will appear here automatically."}
              </p>

              {!hasFilters && (
                <Link to="/attendant/new-transaction" className="att-empty-btn">
                  <Plus size={16} />
                  Create first bill
                </Link>
              )}
            </div>
          )}

          {!loading && filteredTransactions.length > 0 && (
            <div className="att-transaction-list">
              {filteredTransactions.slice(0, 8).map((transaction) => {
                const total = getTransactionTotal(transaction);
                const payment = getPaymentLabel(transaction.paymentMethod);
                const PaymentIcon = getPaymentIcon(payment);
                const tone = getPaymentTone(payment);
                const status = getStatusKey(transaction.status);

                const invoice =
                  transaction.invoiceNo ||
                  transaction.invoiceNumber ||
                  `#${String(transaction.id || "").slice(0, 8)}`;

                const serviceNames = Array.isArray(transaction.items)
                  ? transaction.items
                      .slice(0, 2)
                      .map((item) => item.serviceName || item.name || "Service")
                      .join(", ")
                  : "Shop service";

                return (
                  <div className="att-transaction-row" key={transaction.id}>
                    <div className={`att-tx-icon ${tone}`}>
                      <PaymentIcon size={18} />
                    </div>

                    <div className="att-tx-main">
                      <strong className="att-tx-name">
                        {serviceNames || "Shop service"}
                      </strong>

                      <span className="att-tx-sub">
                        {payment} · {invoice} · {formatTime(transaction.createdAt)}
                      </span>
                    </div>

                    <div className="att-tx-right">
                      <strong className={`att-tx-amount ${status}`}>
                        {hideAmounts ? "₹ ••••" : `+${formatCurrency(total)}`}
                      </strong>

                      {status !== "completed" && (
                        <span className={`att-tx-status ${status}`}>
                          {status === "pending" ? "Pending" : "Cancelled"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filteredTransactions.length > 8 && (
            <Link to="/attendant/transactions" className="att-view-more">
              View all today's transactions
              <ArrowUpRight size={15} />
            </Link>
          )}
        </section>

        {/* ============ PAYMENT OVERVIEW ============ */}
        <section className="att-card att-payment">
          <div className="att-payment-head">
            <h2>Payment overview</h2>
            <span>Today</span>
          </div>

          <div className="att-payment-total">{money(totals.sales)}</div>

          <div className="att-payment-split" aria-hidden="true">
            {PAYMENT_ROWS.map(({ key }) => (
              <span
                key={key}
                className={key}
                style={{
                  width:
                    paymentTotal > 0
                      ? `${(totals[key] / paymentTotal) * 100}%`
                      : "0%",
                }}
              />
            ))}
          </div>

          <div className="att-payment-items">
            {PAYMENT_ROWS.map(({ key, label }) => {
              const percent =
                paymentTotal > 0
                  ? Math.round((totals[key] / paymentTotal) * 100)
                  : 0;

              return (
                <div className="att-payment-item" key={key}>
                  <span className={`att-payment-dot ${key}`} />
                  <span className="att-payment-name">
                    {label}
                    <em>{percent}%</em>
                  </span>
                  <strong>{money(totals[key])}</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* FLOATING CALCULATOR */}
      <FloatingCalculator />
    </div>
  );
}