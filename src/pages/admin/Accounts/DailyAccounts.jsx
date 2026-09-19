import React, { useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  WalletCards,
  ReceiptText,
  ArrowUpRight,
  ArrowDownToLine,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { formatCurrency } from "../../../utils/currency";
import { useTransactions } from "../../../hooks/useTransactions";

import "./AccountsReports.css";

export default function DailyAccounts() {
  const {
    transactions,
    loading,
    error,
  } = useTransactions(5000);

  const [search, setSearch] = useState("");

  const [selectedDate, setSelectedDate] =
    useState(
      new Date()
        .toISOString()
        .slice(0, 10)
    );

  const [showDetails, setShowDetails] =
    useState(false);

  const getRecordType = (item) => {
    if (item?.recordType) {
      return item.recordType;
    }

    const type = String(
      item?.type || ""
    ).toLowerCase();

    if (type.includes("transfer")) {
      return "moneyTransfer";
    }

    if (type.includes("withdraw")) {
      return "withdrawal";
    }

    return "transaction";
  };

  const getAmount = (item) => {
    return Number(
      item?.total ??
      item?.grandTotal ??
      item?.customerPays ??
      item?.amount ??
      0
    );
  };

  const getProfit = (item) => {
    return Number(
      item?.grossProfit ??
      item?.profit ??
      item?.serviceCharge ??
      0
    );
  };

  const getDateValue = (item) => {
    const value =
      item?.createdAt ||
      item?.timestamp ||
      item?.date ||
      item?.createdDate;

    if (!value) return 0;

    if (
      typeof value?.toDate ===
      "function"
    ) {
      return value.toDate().getTime();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "number") {
      return value;
    }

    const parsed = new Date(value);

    return Number.isNaN(
      parsed.getTime()
    )
      ? 0
      : parsed.getTime();
  };

  const getDateKey = (item) => {
    const timestamp = getDateValue(item);

    if (!timestamp) return "";

    const date = new Date(timestamp);

    return `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
  };

  const getTypeLabel = (item) => {
    const type = getRecordType(item);

    if (type === "moneyTransfer") {
      return "Money Transfer";
    }

    if (type === "withdrawal") {
      return "Withdrawal";
    }

    return (
      item?.type ||
      item?.serviceName ||
      item?.service ||
      "Transaction"
    );
  };

  const formatDate = (dateKey) => {
    if (!dateKey) return "—";

    const date = new Date(
      `${dateKey}T00:00:00`
    );

    return new Intl.DateTimeFormat(
      "en-IN",
      {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }
    ).format(date);
  };

  const filteredDayTransactions =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      return (
        transactions || []
      ).filter((item) => {
        const dateMatches =
          getDateKey(item) ===
          selectedDate;

        if (!dateMatches) {
          return false;
        }

        if (!query) {
          return true;
        }

        const searchable = [
          item?.id,
          item?.type,
          item?.serviceName,
          item?.service,
          item?.customerName,
          item?.attendantName,
          item?.paymentMethod,
          item?.paymentMode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(
          query
        );
      });
    }, [
      transactions,
      selectedDate,
      search,
    ]);

  const dayStats = useMemo(() => {
    let sales = 0;
    let profit = 0;
    let withdrawals = 0;
    let moneyTransfers = 0;

    filteredDayTransactions.forEach(
      (item) => {
        const type = getRecordType(item);

        const amount = getAmount(item);
        const itemProfit =
          getProfit(item);

        if (type === "withdrawal") {
          withdrawals += amount;
        } else if (
          type === "moneyTransfer"
        ) {
          moneyTransfers += amount;
        } else {
          sales += amount;
        }

        profit += itemProfit;
      }
    );

    return {
      sales,
      profit,
      withdrawals,
      moneyTransfers,
      records:
        filteredDayTransactions.length,
    };
  }, [filteredDayTransactions]);

  const previousDay = () => {
    const date = new Date(
      `${selectedDate}T00:00:00`
    );

    date.setDate(date.getDate() - 1);

    setSelectedDate(
      date.toISOString().slice(0, 10)
    );
  };

  const nextDay = () => {
    const date = new Date(
      `${selectedDate}T00:00:00`
    );

    date.setDate(date.getDate() + 1);

    setSelectedDate(
      date.toISOString().slice(0, 10)
    );
  };

  const exportCSV = () => {
    if (!filteredDayTransactions.length) {
      return;
    }

    const headers = [
      "Transaction ID",
      "Type",
      "Amount",
      "Profit",
      "Date",
    ];

    const rows =
      filteredDayTransactions.map(
        (item) => [
          item?.id || "",
          getTypeLabel(item),
          getAmount(item),
          getProfit(item),
          getDateKey(item),
        ]
      );

    const csv = [
      headers,
      ...rows,
    ]
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(
                value ?? ""
              ).replace(/"/g, '""')}"`
          )
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
    link.download = `daily-accounts-${selectedDate}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="accounts-report-page">
      <div className="report-page-head">
        <div>
          <div className="report-eyebrow">
            MANAGEMENT
          </div>

          <h1>Daily Accounts</h1>

          <p>
            Daily sales, service costs,
            expenses, cash and net profit.
          </p>
        </div>

        <div className="report-head-actions">
          <button
            className="report-secondary-btn"
            onClick={() =>
              window.location.reload()
            }
          >
            <RefreshCw size={15} />
            Refresh
          </button>

          <button
            className="report-primary-btn"
            onClick={exportCSV}
            disabled={
              !filteredDayTransactions.length
            }
          >
            <Download size={15} />
            Export
          </button>
        </div>
      </div>

      <section className="report-date-bar">
        <button
          className="date-nav-btn"
          onClick={previousDay}
        >
          <ChevronLeft size={17} />
        </button>

        <div className="selected-date">
          <CalendarDays size={17} />

          <div>
            <strong>
              {formatDate(selectedDate)}
            </strong>

            <span>
              {selectedDate}
            </span>
          </div>
        </div>

        <button
          className="date-nav-btn"
          onClick={nextDay}
        >
          <ChevronRight size={17} />
        </button>

        <input
          type="date"
          value={selectedDate}
          onChange={(event) =>
            setSelectedDate(
              event.target.value
            )
          }
        />
      </section>

      <section className="report-stats-grid">
        <div className="report-stat-card">
          <div className="report-stat-icon blue">
            <WalletCards size={19} />
          </div>

          <span>Daily Sales</span>

          <strong>
            {formatCurrency(
              dayStats.sales
            )}
          </strong>

          <small>
            Regular shop transactions
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon green">
            <TrendingUp size={19} />
          </div>

          <span>Daily Profit</span>

          <strong>
            {formatCurrency(
              dayStats.profit
            )}
          </strong>

          <small>
            Gross profit generated
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon orange">
            <ArrowDownToLine size={19} />
          </div>

          <span>Withdrawals</span>

          <strong>
            {formatCurrency(
              dayStats.withdrawals
            )}
          </strong>

          <small>
            Withdrawal records
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon purple">
            <ArrowUpRight size={19} />
          </div>

          <span>Money Transfers</span>

          <strong>
            {formatCurrency(
              dayStats.moneyTransfers
            )}
          </strong>

          <small>
            Transfer transaction value
          </small>
        </div>
      </section>

      <section className="report-panel">
        <div className="report-toolbar">
          <div className="report-search">
            <Search size={16} />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search today's accounts..."
            />
          </div>

          <div className="report-record-count">
            <ReceiptText size={15} />

            <span>
              {dayStats.records} records
            </span>
          </div>
        </div>

        {loading && (
          <div className="report-empty-state">
            <RefreshCw
              className="report-loading-icon"
              size={25}
            />

            <h3>
              Loading daily accounts...
            </h3>
          </div>
        )}

        {!loading && error && (
          <div className="report-empty-state error">
            <h3>
              Unable to load accounts
            </h3>

            <p>
              {error?.message ||
                "Firestore data could not be loaded."}
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          !filteredDayTransactions.length && (
            <div className="report-empty-state">
              <div className="empty-report-icon">
                <CalendarDays size={25} />
              </div>

              <h3>
                No records for this day
              </h3>

              <p>
                No transaction records were
                found for {formatDate(
                  selectedDate
                )}.
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          filteredDayTransactions.length >
          0 && (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Transaction ID</th>
                    <th>Amount</th>
                    <th>Profit</th>
                    <th>Time</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDayTransactions.map(
                    (item) => {
                      const timestamp =
                        getDateValue(item);

                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="report-type">
                              <span>
                                {getTypeLabel(
                                  item
                                )}
                              </span>
                            </div>
                          </td>

                          <td>
                            <code>
                              {String(
                                item.id
                              ).slice(
                                0,
                                14
                              )}
                            </code>
                          </td>

                          <td>
                            <strong>
                              {formatCurrency(
                                getAmount(
                                  item
                                )
                              )}
                            </strong>
                          </td>

                          <td>
                            <strong className="positive-value">
                              +
                              {formatCurrency(
                                getProfit(
                                  item
                                )
                              )}
                            </strong>
                          </td>

                          <td>
                            {timestamp
                              ? new Intl.DateTimeFormat(
                                "en-IN",
                                {
                                  hour: "2-digit",
                                  minute:
                                    "2-digit",
                                }
                              ).format(
                                new Date(
                                  timestamp
                                )
                              )
                              : "—"}
                          </td>

                          <td>
                            <button
                              className="report-view-btn"
                              onClick={() =>
                                setShowDetails(
                                  true
                                )
                              }
                            >
                              <Eye size={15} />
                              View
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

      {showDetails && (
        <div
          className="report-modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowDetails(false);
            }
          }}
        >
          <div className="report-modal">
            <div className="report-modal-head">
              <div>
                <h2>Daily Account Summary</h2>
                <p>
                  {formatDate(selectedDate)}
                </p>
              </div>

              <button
                onClick={() =>
                  setShowDetails(false)
                }
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-summary-grid">
              <div>
                <span>Sales</span>
                <strong>
                  {formatCurrency(
                    dayStats.sales
                  )}
                </strong>
              </div>

              <div>
                <span>Profit</span>
                <strong className="positive-value">
                  {formatCurrency(
                    dayStats.profit
                  )}
                </strong>
              </div>

              <div>
                <span>Withdrawals</span>
                <strong>
                  {formatCurrency(
                    dayStats.withdrawals
                  )}
                </strong>
              </div>

              <div>
                <span>Transfers</span>
                <strong>
                  {formatCurrency(
                    dayStats.moneyTransfers
                  )}
                </strong>
              </div>
            </div>

            <div className="report-modal-footer">
              <button
                className="report-secondary-btn"
                onClick={() =>
                  setShowDetails(false)
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