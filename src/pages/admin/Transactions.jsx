import React, { useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  Eye,
  X,
  TrendingUp,
  ReceiptText,
  WalletCards,
  ArrowDownToLine,
  ArrowUpRight,
  Zap,
  UserRound,
  CalendarDays,
  CreditCard,
  CircleDollarSign,
  Filter,
  ChevronDown,
} from "lucide-react";

import { formatCurrency } from "../../utils/currency";
import { useTransactions } from "../../hooks/useTransactions";

import "./Transactions.css";

export default function Transactions() {
  const { transactions, loading, error } = useTransactions(500);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Date range defaults to today.
  const getLocalDateInputValue = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  };

  const [fromDate, setFromDate] = useState(() => getLocalDateInputValue());
  const [toDate, setToDate] = useState(() => getLocalDateInputValue());

  const [selectedTransaction, setSelectedTransaction] =
    useState(null);

  const [showProfitDetails, setShowProfitDetails] =
    useState(false);

  const getRecordType = (item) => {
    if (item?.recordType) return item.recordType;

    const type = String(item?.type || "").toLowerCase();

    if (
      type.includes("transfer") ||
      type.includes("money transfer")
    ) {
      return "moneyTransfer";
    }

    if (type.includes("withdraw")) {
      return "withdrawal";
    }

    if (
      type.includes("eb bill") ||
      type.includes("ebbill") ||
      type.includes("electricity")
    ) {
      return "ebBillPayment";
    }

    return "transaction";
  };

  const getTypeLabel = (item) => {
    const recordType = getRecordType(item);

    if (recordType === "moneyTransfer") {
      return "Money Transfer";
    }

    if (recordType === "withdrawal") {
      return "Withdrawal";
    }

    if (recordType === "ebBillPayment") {
      return "EB Bill Payment";
    }

    return (
      item?.type ||
      item?.serviceName ||
      item?.service ||
      "Transaction"
    );
  };

  const getTypeIcon = (item) => {
    const recordType = getRecordType(item);

    if (recordType === "moneyTransfer") {
      return <ArrowUpRight size={16} />;
    }

    if (recordType === "withdrawal") {
      return <ArrowDownToLine size={16} />;
    }

    if (recordType === "ebBillPayment") {
      return <Zap size={16} />;
    }

    return <ReceiptText size={16} />;
  };

  const getAmount = (item) => {
    const recordType = getRecordType(item);

    if (recordType === "moneyTransfer") {
      return Number(
        item?.customerPays ??
        item?.total ??
        item?.amount ??
        0
      );
    }

    if (recordType === "withdrawal") {
      return Number(
        item?.customerPays ??
        item?.total ??
        item?.amount ??
        0
      );
    }

    if (recordType === "ebBillPayment") {
      return Number(
        item?.customerPays ??
        item?.total ??
        item?.billAmount ??
        item?.amount ??
        0
      );
    }

    return Number(
      item?.total ??
      item?.grandTotal ??
      item?.amount ??
      0
    );
  };

  const getProfit = (item) => {
    const recordType = getRecordType(item);

    if (
      recordType === "moneyTransfer" ||
      recordType === "withdrawal" ||
      recordType === "ebBillPayment"
    ) {
      return Number(
        item?.serviceCharge ??
        item?.profit ??
        item?.grossProfit ??
        0
      );
    }

    return Number(
      item?.grossProfit ??
      item?.profit ??
      0
    );
  };

  const getStatus = (item) => {
    return String(
      item?.status || "completed"
    ).toLowerCase();
  };

  const getStatusLabel = (item) => {
    const status = getStatus(item);

    return status
      .replace(/[_-]/g, " ")
      .replace(/\b\w/g, (char) =>
        char.toUpperCase()
      );
  };

  const getCustomerName = (item) => {
    return (
      item?.customerName ||
      item?.customer?.name ||
      item?.customer ||
      item?.consumerName ||
      item?.name ||
      "Walk-in Customer"
    );
  };

  const getAttendantName = (item) => {
    return (
      item?.attendantName ||
      item?.staffName ||
      item?.createdByName ||
      item?.userName ||
      "—"
    );
  };

  const getPaymentMethod = (item) => {
    return (
      item?.paymentMethod ||
      item?.paymentMode ||
      item?.method ||
      "Cash"
    );
  };

  const getDateValue = (item) => {
    const value =
      item?.createdAt ||
      item?.timestamp ||
      item?.date ||
      item?.createdDate;

    if (!value) return 0;

    if (typeof value?.toDate === "function") {
      return value.toDate().getTime();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "number") {
      return value;
    }

    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime())
      ? 0
      : parsed.getTime();
  };

  const getTransactionLocalDate = (item) => {
    const timestamp = getDateValue(item);

    if (!timestamp) return "";

    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const formatDate = (item) => {
    const timestamp = getDateValue(item);

    if (!timestamp) return "—";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(timestamp));
  };

  const formatTime = (item) => {
    const timestamp = getDateValue(item);

    if (!timestamp) return "";

    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  };

  const normalizedTransactions = useMemo(() => {
    return Array.isArray(transactions)
      ? transactions
      : [];
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const queryText = search
      .trim()
      .toLowerCase();

    return normalizedTransactions.filter(
      (item) => {
        const type = getTypeLabel(item).toLowerCase();

        const customer =
          getCustomerName(item).toLowerCase();

        const attendant =
          getAttendantName(item).toLowerCase();

        const payment =
          getPaymentMethod(item).toLowerCase();

        const status =
          getStatus(item);

        const matchesSearch =
          !queryText ||
          type.includes(queryText) ||
          customer.includes(queryText) ||
          attendant.includes(queryText) ||
          payment.includes(queryText) ||
          status.includes(queryText) ||
          String(item?.id || "")
            .toLowerCase()
            .includes(queryText);

        const matchesType =
          typeFilter === "all" ||
          getRecordType(item) === typeFilter;

        const matchesStatus =
          statusFilter === "all" ||
          status === statusFilter;

        const transactionDate = getTransactionLocalDate(item);

        const matchesDate =
          (!fromDate || transactionDate >= fromDate) &&
          (!toDate || transactionDate <= toDate);

        return (
          matchesSearch &&
          matchesType &&
          matchesStatus &&
          matchesDate
        );
      }
    );
  }, [
    normalizedTransactions,
    search,
    typeFilter,
    statusFilter,
    fromDate,
    toDate,
  ]);

  const stats = useMemo(() => {
    const totalSales =
      filteredTransactions.reduce(
        (sum, item) =>
          sum + getAmount(item),
        0
      );

    const totalProfit =
      filteredTransactions.reduce(
        (sum, item) =>
          sum + getProfit(item),
        0
      );

    const completed =
      filteredTransactions.filter(
        (item) =>
          getStatus(item) === "completed"
      ).length;

    const profitableRecords =
      filteredTransactions.filter(
        (item) => getProfit(item) > 0
      ).length;

    return {
      totalSales,
      totalProfit,
      completed,
      profitableRecords,
      count: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  /*
   * Only records that actually generated profit.
   *
   * This is intentionally based on the current
   * search/type/status filters so the profit card
   * reflects the same data visible in the table.
   */
  const profitTransactions = useMemo(() => {
    return filteredTransactions
      .filter((item) => getProfit(item) > 0)
      .sort(
        (a, b) =>
          getProfit(b) - getProfit(a)
      );
  }, [filteredTransactions]);

  const exportCSV = () => {
    if (!filteredTransactions.length) {
      return;
    }

    const headers = [
      "Transaction ID",
      "Type",
      "Customer",
      "Attendant",
      "Payment Method",
      "Amount",
      "Profit",
      "Status",
      "Date",
    ];

    const rows = filteredTransactions.map(
      (item) => [
        item?.id || "",
        getTypeLabel(item),
        getCustomerName(item),
        getAttendantName(item),
        getPaymentMethod(item),
        getAmount(item),
        getProfit(item),
        getStatusLabel(item),
        `${formatDate(item)} ${formatTime(item)}`,
      ]
    );

    const csv = [
      headers,
      ...rows,
    ]
      .map((row) =>
        row
          .map((value) => {
            const safeValue =
              String(value ?? "");

            return `"${safeValue.replace(
              /"/g,
              '""'
            )}"`;
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

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download = `transactions-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const refreshTransactions = () => {
    window.location.reload();
  };

  const clearFilters = () => {
    const today = getLocalDateInputValue();

    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
    setFromDate(today);
    setToDate(today);
  };

  return (
    <div className="transactions-page">
      {/* PAGE HEADER */}
      <div className="page-head transactions-page-head">
        <div>
          <div className="eyebrow">
            MANAGEMENT
          </div>

          <h1>Transactions</h1>

          <p>
            Search, review and manage every
            shop transaction.
          </p>
        </div>

        <div className="transactions-head-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={refreshTransactions}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            type="button"
            className="primary-btn"
            onClick={exportCSV}
            disabled={
              !filteredTransactions.length
            }
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* STATS */}
      <section className="transaction-stats-grid">
        <div className="transaction-stat-card">
          <div className="stat-icon blue">
            <ReceiptText size={19} />
          </div>

          <div>
            <span>Total Records</span>
            <strong>
              {stats.count.toLocaleString(
                "en-IN"
              )}
            </strong>
            <small>
              Current filtered records
            </small>
          </div>
        </div>

        <div className="transaction-stat-card">
          <div className="stat-icon green">
            <WalletCards size={19} />
          </div>

          <div>
            <span>Total Sales</span>
            <strong>
              {formatCurrency(
                stats.totalSales
              )}
            </strong>
            <small>
              Total transaction value
            </small>
          </div>
        </div>

        {/* CLICKABLE PROFIT CARD */}
        <button
          type="button"
          className="transaction-stat-card profit-stat-card"
          onClick={() =>
            setShowProfitDetails(true)
          }
        >
          <div className="stat-icon purple">
            <TrendingUp size={19} />
          </div>

          <div className="profit-stat-content">
            <span>Total Profit</span>

            <strong>
              {formatCurrency(
                stats.totalProfit
              )}
            </strong>

            <small>
              {stats.profitableRecords} profitable
              transaction
              {stats.profitableRecords !== 1
                ? "s"
                : ""}
            </small>
          </div>

          <Eye
            size={17}
            className="profit-view-icon"
          />
        </button>

        <div className="transaction-stat-card">
          <div className="stat-icon orange">
            <CircleDollarSign size={19} />
          </div>

          <div>
            <span>Completed</span>
            <strong>
              {stats.completed.toLocaleString(
                "en-IN"
              )}
            </strong>
            <small>
              Completed transactions
            </small>
          </div>
        </div>
      </section>

      {/* MAIN PANEL */}
      <section className="panel transactions-panel">
        {/* TOOLBAR */}
        <div className="transactions-toolbar">
          <div className="transactions-search">
            <Search size={17} />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search transaction, customer, attendant..."
            />

            {search && (
              <button
                type="button"
                className="clear-search"
                onClick={() =>
                  setSearch("")
                }
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="transaction-filter">
            <Filter size={15} />

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All Types
              </option>

              <option value="transaction">
                Transactions
              </option>

              <option value="moneyTransfer">
                Money Transfer
              </option>

              <option value="withdrawal">
                Withdrawal
              </option>

              <option value="ebBillPayment">
                EB Bill Payment
              </option>
            </select>

            <ChevronDown size={15} />
          </div>

          <div className="transaction-filter">
            <CircleDollarSign size={15} />

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value
                )
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

              <option value="cancelled">
                Cancelled
              </option>

              <option value="failed">
                Failed
              </option>
            </select>

            <ChevronDown size={15} />
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
                  onChange={(event) => setFromDate(event.target.value)}
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
                  onChange={(event) => setToDate(event.target.value)}
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

          {(search ||
            typeFilter !== "all" ||
            statusFilter !== "all" ||
            fromDate !== getLocalDateInputValue() ||
            toDate !== getLocalDateInputValue()) && (
              <button
                type="button"
                className="clear-filters-btn"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
        </div>

        {/* RESULT INFO */}
        <div className="transactions-result-bar">
          <div>
            <strong>
              {filteredTransactions.length.toLocaleString(
                "en-IN"
              )}
            </strong>{" "}
            records found
          </div>

          {search && (
            <span>
              Searching for{" "}
              <b>"{search}"</b>
            </span>
          )}
        </div>

        {/* LOADING */}
        {loading && (
          <div className="transactions-state">
            <div className="loading-spinner">
              <RefreshCw size={22} />
            </div>

            <h3>
              Loading transactions...
            </h3>

            <p>
              Fetching the latest shop
              transaction records.
            </p>
          </div>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="transactions-state error-state">
            <div className="state-icon error">
              !
            </div>

            <h3>
              Could not load transactions
            </h3>

            <p>
              {error?.message ||
                "An error occurred while loading Firestore records."}
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={refreshTransactions}
            >
              <RefreshCw size={16} />
              Try Again
            </button>
          </div>
        )}

        {/* EMPTY */}
        {!loading &&
          !error &&
          !filteredTransactions.length && (
            <div className="transactions-state">
              <div className="state-icon">
                <ReceiptText size={24} />
              </div>

              <h3>
                No transactions found
              </h3>

              <p>
                There are no transactions
                matching your current search
                and filters.
              </p>

              {(search ||
                typeFilter !== "all" ||
                statusFilter !== "all" ||
                fromDate !== getLocalDateInputValue() ||
                toDate !== getLocalDateInputValue()) && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                )}
            </div>
          )}

        {/* TABLE */}
        {!loading &&
          !error &&
          filteredTransactions.length > 0 && (
            <div className="transactions-table-wrapper">
              <table className="transactions-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Customer</th>
                    <th>Attendant</th>
                    <th>Payment</th>
                    <th>Amount</th>
                    <th>Profit</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTransactions.map(
                    (item) => {
                      const profit =
                        getProfit(item);

                      return (
                        <tr
                          key={`${getRecordType(
                            item
                          )}-${item.id}`}
                        >
                          <td>
                            <div className="transaction-main">
                              <div
                                className={`transaction-type-icon ${getRecordType(
                                  item
                                )}`}
                              >
                                {getTypeIcon(
                                  item
                                )}
                              </div>

                              <div>
                                <strong>
                                  {getTypeLabel(
                                    item
                                  )}
                                </strong>

                                <span>
                                  #
                                  {String(
                                    item?.id ||
                                    ""
                                  ).slice(
                                    0,
                                    10
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="customer-cell">
                              <UserRound
                                size={15}
                              />

                              <span>
                                {getCustomerName(
                                  item
                                )}
                              </span>
                            </div>
                          </td>

                          <td>
                            <span className="attendant-cell">
                              {getAttendantName(
                                item
                              )}
                            </span>
                          </td>

                          <td>
                            <span className="payment-cell">
                              <CreditCard
                                size={14}
                              />

                              {getPaymentMethod(
                                item
                              )}
                            </span>
                          </td>

                          <td>
                            <strong className="amount-cell">
                              {formatCurrency(
                                getAmount(
                                  item
                                )
                              )}
                            </strong>
                          </td>

                          <td>
                            <strong
                              className={`profit-cell ${profit > 0
                                  ? "positive"
                                  : profit < 0
                                    ? "negative"
                                    : "zero"
                                }`}
                            >
                              {profit > 0
                                ? "+"
                                : ""}
                              {formatCurrency(
                                profit
                              )}
                            </strong>
                          </td>

                          <td>
                            <span
                              className={`status-badge ${getStatus(
                                item
                              )}`}
                            >
                              <span className="status-dot" />
                              {getStatusLabel(
                                item
                              )}
                            </span>
                          </td>

                          <td>
                            <div className="date-cell">
                              <span>
                                {formatDate(
                                  item
                                )}
                              </span>

                              <small>
                                {formatTime(
                                  item
                                )}
                              </small>
                            </div>
                          </td>

                          <td>
                            <button
                              type="button"
                              className="view-btn"
                              onClick={() =>
                                setSelectedTransaction(
                                  item
                                )
                              }
                              title="View transaction"
                            >
                              <Eye size={16} />
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
      </section>

      {/* PROFIT DETAILS MODAL */}
      {showProfitDetails && (
        <div
          className="transaction-modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowProfitDetails(false);
            }
          }}
        >
          <div className="transaction-modal profit-modal">
            <div className="transaction-modal-header">
              <div className="modal-title-group">
                <div className="modal-icon profit">
                  <TrendingUp size={21} />
                </div>

                <div>
                  <h2>
                    Profit Details
                  </h2>

                  <p>
                    Transactions that generated
                    profit
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() =>
                  setShowProfitDetails(false)
                }
              >
                <X size={18} />
              </button>
            </div>

            {/* PROFIT SUMMARY */}
            <div className="profit-summary">
              <div className="profit-summary-main">
                <span>Total Profit</span>

                <strong>
                  {formatCurrency(
                    stats.totalProfit
                  )}
                </strong>
              </div>

              <div className="profit-summary-divider" />

              <div>
                <span>
                  Profit Sources
                </span>

                <strong>
                  {profitTransactions.length}
                </strong>
              </div>
            </div>

            {/* PROFIT LIST */}
            <div className="profit-details-content">
              {profitTransactions.length ===
                0 ? (
                <div className="profit-empty">
                  <div className="state-icon">
                    <TrendingUp size={22} />
                  </div>

                  <h3>
                    No profit records
                  </h3>

                  <p>
                    No transaction in the
                    current filtered results
                    generated profit.
                  </p>
                </div>
              ) : (
                <>
                  <div className="profit-list-header">
                    <span>
                      Profit sources
                    </span>

                    <span>
                      {profitTransactions.length}{" "}
                      record
                      {profitTransactions.length !==
                        1
                        ? "s"
                        : ""}
                    </span>
                  </div>

                  <div className="profit-list">
                    {profitTransactions.map(
                      (item, index) => {
                        const profit =
                          getProfit(item);

                        const amount =
                          getAmount(item);

                        return (
                          <div
                            className="profit-detail-row"
                            key={`profit-${getRecordType(
                              item
                            )}-${item.id}`}
                          >
                            <div className="profit-row-number">
                              {index + 1}
                            </div>

                            <div className="profit-row-icon">
                              {getTypeIcon(
                                item
                              )}
                            </div>

                            <div className="profit-row-info">
                              <div className="profit-row-title">
                                <strong>
                                  {getTypeLabel(
                                    item
                                  )}
                                </strong>

                                <span>
                                  #{String(
                                    item?.id ||
                                    ""
                                  ).slice(
                                    0,
                                    10
                                  )}
                                </span>
                              </div>

                              <div className="profit-row-meta">
                                <span>
                                  <UserRound
                                    size={13}
                                  />
                                  {getCustomerName(
                                    item
                                  )}
                                </span>

                                <span>
                                  <CalendarDays
                                    size={13}
                                  />
                                  {formatDate(
                                    item
                                  )}{" "}
                                  {formatTime(
                                    item
                                  )}
                                </span>

                                <span>
                                  <CreditCard
                                    size={13}
                                  />
                                  {getPaymentMethod(
                                    item
                                  )}
                                </span>
                              </div>
                            </div>

                            <div className="profit-row-amount">
                              <span>
                                Transaction
                              </span>

                              <strong>
                                {formatCurrency(
                                  amount
                                )}
                              </strong>
                            </div>

                            <div className="profit-row-profit">
                              <span>
                                Profit
                              </span>

                              <strong>
                                +
                                {formatCurrency(
                                  profit
                                )}
                              </strong>
                            </div>

                            <button
                              type="button"
                              className="profit-row-view"
                              onClick={() => {
                                setShowProfitDetails(
                                  false
                                );
                                setSelectedTransaction(
                                  item
                                );
                              }}
                            >
                              <Eye size={16} />
                            </button>
                          </div>
                        );
                      }
                    )}
                  </div>

                  <div className="profit-total-footer">
                    <span>
                      Total profit from listed
                      transactions
                    </span>

                    <strong>
                      {formatCurrency(
                        profitTransactions.reduce(
                          (sum, item) =>
                            sum +
                            getProfit(
                              item
                            ),
                          0
                        )
                      )}
                    </strong>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION DETAILS MODAL */}
      {selectedTransaction && (
        <div
          className="transaction-modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedTransaction(
                null
              );
            }
          }}
        >
          <div className="transaction-modal">
            <div className="transaction-modal-header">
              <div className="modal-title-group">
                <div className="modal-icon">
                  {getTypeIcon(
                    selectedTransaction
                  )}
                </div>

                <div>
                  <h2>
                    Transaction Details
                  </h2>

                  <p>
                    {getTypeLabel(
                      selectedTransaction
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() =>
                  setSelectedTransaction(
                    null
                  )
                }
              >
                <X size={18} />
              </button>
            </div>

            <div className="transaction-detail-grid">
              <div className="detail-item full">
                <span>Transaction ID</span>

                <strong>
                  {selectedTransaction.id ||
                    "—"}
                </strong>
              </div>

              <div className="detail-item">
                <span>Type</span>

                <strong>
                  {getTypeLabel(
                    selectedTransaction
                  )}
                </strong>
              </div>

              <div className="detail-item">
                <span>Status</span>

                <strong>
                  {getStatusLabel(
                    selectedTransaction
                  )}
                </strong>
              </div>

              <div className="detail-item">
                <span>Customer</span>

                <strong>
                  {getCustomerName(
                    selectedTransaction
                  )}
                </strong>
              </div>

              <div className="detail-item">
                <span>Attendant</span>

                <strong>
                  {getAttendantName(
                    selectedTransaction
                  )}
                </strong>
              </div>

              <div className="detail-item">
                <span>Payment Method</span>

                <strong>
                  {getPaymentMethod(
                    selectedTransaction
                  )}
                </strong>
              </div>

              <div className="detail-item">
                <span>Date</span>

                <strong>
                  {formatDate(
                    selectedTransaction
                  )}
                </strong>
              </div>

              <div className="detail-item">
                <span>Transaction Amount</span>

                <strong>
                  {formatCurrency(
                    getAmount(
                      selectedTransaction
                    )
                  )}
                </strong>
              </div>

              <div className="detail-item profit-detail">
                <span>Profit Generated</span>

                <strong>
                  {getProfit(
                    selectedTransaction
                  ) > 0
                    ? "+"
                    : ""}
                  {formatCurrency(
                    getProfit(
                      selectedTransaction
                    )
                  )}
                </strong>
              </div>
            </div>

            {/* RAW PROFIT INFORMATION */}
            {(getRecordType(
              selectedTransaction
            ) === "moneyTransfer" ||
              getRecordType(
                selectedTransaction
              ) === "withdrawal" ||
              getRecordType(
                selectedTransaction
              ) === "ebBillPayment") && (
                <div className="profit-source-box">
                  <div className="profit-source-icon">
                    <TrendingUp size={18} />
                  </div>

                  <div>
                    <strong>
                      Profit source
                    </strong>

                    <p>
                      This record generated profit
                      from its service charge.
                    </p>

                    <div className="profit-source-values">
                      <span>
                        Service Charge
                      </span>

                      <strong>
                        +
                        {formatCurrency(
                          Number(
                            selectedTransaction?.serviceCharge ??
                            0
                          )
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

            {getRecordType(
              selectedTransaction
            ) === "transaction" && (
                <div className="profit-source-box">
                  <div className="profit-source-icon">
                    <TrendingUp size={18} />
                  </div>

                  <div>
                    <strong>
                      Profit source
                    </strong>

                    <p>
                      This transaction's profit is
                      taken from its stored gross
                      profit / profit value.
                    </p>

                    <div className="profit-source-values">
                      <span>
                        Recorded Profit
                      </span>

                      <strong>
                        {getProfit(
                          selectedTransaction
                        ) > 0
                          ? "+"
                          : ""}
                        {formatCurrency(
                          getProfit(
                            selectedTransaction
                          )
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

            <div className="transaction-modal-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() =>
                  setSelectedTransaction(
                    null
                  )
                }
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}