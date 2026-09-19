import React, { useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  CalendarRange,
  TrendingUp,
  WalletCards,
  ReceiptText,
} from "lucide-react";

import { formatCurrency } from "../../../utils/currency";
import { useTransactions } from "../../../hooks/useTransactions";

import "./AccountsReports.css";

export default function MonthlyAccounts() {
  const {
    transactions,
    loading,
    error,
  } = useTransactions(5000);

  const currentYear =
    new Date().getFullYear();

  const [year, setYear] =
    useState(currentYear);

  const [search, setSearch] =
    useState("");

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

  const getAmount = (item) =>
    Number(
      item?.total ??
      item?.grandTotal ??
      item?.customerPays ??
      item?.amount ??
      0
    );

  const getProfit = (item) =>
    Number(
      item?.grossProfit ??
      item?.profit ??
      item?.serviceCharge ??
      0
    );

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

  const monthlyData = useMemo(() => {
    const months = Array.from(
      { length: 12 },
      (_, index) => ({
        month: index,
        sales: 0,
        profit: 0,
        withdrawals: 0,
        transfers: 0,
        records: 0,
      })
    );

    (transactions || []).forEach(
      (item) => {
        const timestamp =
          getDateValue(item);

        if (!timestamp) return;

        const date = new Date(
          timestamp
        );

        if (
          date.getFullYear() !== year
        ) {
          return;
        }

        const month =
          date.getMonth();

        const type =
          getRecordType(item);

        const amount =
          getAmount(item);

        months[month].records += 1;
        months[month].profit +=
          getProfit(item);

        if (type === "withdrawal") {
          months[month].withdrawals +=
            amount;
        } else if (
          type === "moneyTransfer"
        ) {
          months[month].transfers +=
            amount;
        } else {
          months[month].sales +=
            amount;
        }
      }
    );

    return months;
  }, [transactions, year]);

  const visibleMonths =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      if (!query) {
        return monthlyData;
      }

      return monthlyData.filter(
        (item) => {
          const name =
            new Intl.DateTimeFormat(
              "en-IN",
              {
                month: "long",
              }
            ).format(
              new Date(
                year,
                item.month,
                1
              )
            );

          return name
            .toLowerCase()
            .includes(query);
        }
      );
    }, [monthlyData, search, year]);

  const totals = useMemo(() => {
    return monthlyData.reduce(
      (acc, item) => {
        acc.sales += item.sales;
        acc.profit += item.profit;
        acc.withdrawals +=
          item.withdrawals;
        acc.transfers +=
          item.transfers;
        acc.records += item.records;

        return acc;
      },
      {
        sales: 0,
        profit: 0,
        withdrawals: 0,
        transfers: 0,
        records: 0,
      }
    );
  }, [monthlyData]);

  const exportCSV = () => {
    const headers = [
      "Month",
      "Sales",
      "Profit",
      "Withdrawals",
      "Money Transfers",
      "Records",
    ];

    const rows = monthlyData.map(
      (item) => {
        const month =
          new Intl.DateTimeFormat(
            "en-IN",
            {
              month: "long",
            }
          ).format(
            new Date(
              year,
              item.month,
              1
            )
          );

        return [
          month,
          item.sales,
          item.profit,
          item.withdrawals,
          item.transfers,
          item.records,
        ];
      }
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
    link.download = `monthly-accounts-${year}.csv`;

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

          <h1>Monthly Accounts</h1>

          <p>
            Monthly turnover, expenses and
            profitability.
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
          >
            <Download size={15} />
            Export
          </button>
        </div>
      </div>

      <section className="report-control-bar">
        <div className="report-search">
          <Search size={16} />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Search month..."
          />
        </div>

        <div className="year-selector">
          <CalendarRange size={16} />

          <select
            value={year}
            onChange={(event) =>
              setYear(
                Number(event.target.value)
              )
            }
          >
            {Array.from(
              { length: 8 },
              (_, index) =>
                currentYear - index
            ).map((itemYear) => (
              <option
                key={itemYear}
                value={itemYear}
              >
                {itemYear}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="report-stats-grid">
        <div className="report-stat-card">
          <div className="report-stat-icon blue">
            <WalletCards size={19} />
          </div>

          <span>Annual Turnover</span>

          <strong>
            {formatCurrency(
              totals.sales
            )}
          </strong>

          <small>
            {year} transaction sales
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon green">
            <TrendingUp size={19} />
          </div>

          <span>Total Profit</span>

          <strong>
            {formatCurrency(
              totals.profit
            )}
          </strong>

          <small>
            Gross profit generated
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon orange">
            <ReceiptText size={19} />
          </div>

          <span>Total Records</span>

          <strong>
            {totals.records}
          </strong>

          <small>
            Transaction records
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon purple">
            <CalendarRange size={19} />
          </div>

          <span>Average Monthly Sales</span>

          <strong>
            {formatCurrency(
              totals.sales / 12
            )}
          </strong>

          <small>
            Based on 12 months
          </small>
        </div>
      </section>

      <section className="report-panel">
        <div className="report-panel-heading">
          <div>
            <h2>
              {year} Monthly Overview
            </h2>

            <p>
              Sales, profit and account
              activity by month.
            </p>
          </div>
        </div>

        {loading && (
          <div className="report-empty-state">
            <RefreshCw
              className="report-loading-icon"
              size={25}
            />

            <h3>
              Loading monthly accounts...
            </h3>
          </div>
        )}

        {!loading && error && (
          <div className="report-empty-state error">
            <h3>
              Unable to load accounts
            </h3>

            <p>
              {error?.message}
            </p>
          </div>
        )}

        {!loading &&
          !error && (
            <div className="report-table-wrapper">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Sales</th>
                    <th>Profit</th>
                    <th>Withdrawals</th>
                    <th>Transfers</th>
                    <th>Records</th>
                    <th>Profit Margin</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleMonths.map(
                    (item) => {
                      const monthName =
                        new Intl.DateTimeFormat(
                          "en-IN",
                          {
                            month: "long",
                          }
                        ).format(
                          new Date(
                            year,
                            item.month,
                            1
                          )
                        );

                      const margin =
                        item.sales > 0
                          ? (item.profit /
                            item.sales) *
                          100
                          : 0;

                      return (
                        <tr key={item.month}>
                          <td>
                            <strong>
                              {monthName}
                            </strong>
                          </td>

                          <td>
                            {formatCurrency(
                              item.sales
                            )}
                          </td>

                          <td>
                            <strong className="positive-value">
                              +
                              {formatCurrency(
                                item.profit
                              )}
                            </strong>
                          </td>

                          <td>
                            {formatCurrency(
                              item.withdrawals
                            )}
                          </td>

                          <td>
                            {formatCurrency(
                              item.transfers
                            )}
                          </td>

                          <td>
                            <span className="record-pill">
                              {item.records}
                            </span>
                          </td>

                          <td>
                            <span className="margin-pill">
                              {margin.toFixed(
                                1
                              )}
                              %
                            </span>
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
    </div>
  );
}