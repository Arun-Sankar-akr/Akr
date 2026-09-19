import React, { useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  TrendingUp,
  WalletCards,
  ReceiptText,
  CalendarRange,
  ArrowDownToLine,
} from "lucide-react";

import { formatCurrency } from "../../../utils/currency";
import { useTransactions } from "../../../hooks/useTransactions";

import "./AccountsReports.css";

export default function ProfitReport() {
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

  const reportData = useMemo(() => {
    const months = Array.from(
      { length: 12 },
      (_, index) => ({
        month: index,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
        sales: 0,
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

        const profit =
          getProfit(item);

        months[month].records += 1;

        if (
          type === "withdrawal"
        ) {
          months[month].expenses +=
            amount;
        } else {
          months[month].sales +=
            amount;

          months[month].grossProfit +=
            profit;
        }
      }
    );

    months.forEach((item) => {
      item.netProfit =
        item.grossProfit -
        item.expenses;
    });

    return months;
  }, [transactions, year]);

  const totals = useMemo(() => {
    return reportData.reduce(
      (acc, item) => {
        acc.sales += item.sales;
        acc.grossProfit +=
          item.grossProfit;
        acc.expenses +=
          item.expenses;
        acc.netProfit +=
          item.netProfit;
        acc.records += item.records;

        return acc;
      },
      {
        sales: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
        records: 0,
      }
    );
  }, [reportData]);

  const visibleData =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      if (!query) {
        return reportData;
      }

      return reportData.filter(
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

          return month
            .toLowerCase()
            .includes(query);
        }
      );
    }, [reportData, search, year]);

  const exportCSV = () => {
    const headers = [
      "Month",
      "Sales",
      "Gross Profit",
      "Expenses",
      "Net Profit",
      "Records",
    ];

    const rows =
      reportData.map((item) => {
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
          item.grossProfit,
          item.expenses,
          item.netProfit,
          item.records,
        ];
      });

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
    link.download = `profit-report-${year}.csv`;

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

          <h1>Profit Report</h1>

          <p>
            Separate gross profit, operating
            expenses and net profit.
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
            placeholder="Search profit report..."
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

      <section className="profit-report-summary">
        <div className="profit-summary-card">
          <div className="report-stat-icon blue">
            <WalletCards size={19} />
          </div>

          <span>Total Sales</span>

          <strong>
            {formatCurrency(
              totals.sales
            )}
          </strong>
        </div>

        <div className="profit-summary-card">
          <div className="report-stat-icon green">
            <TrendingUp size={19} />
          </div>

          <span>Gross Profit</span>

          <strong>
            {formatCurrency(
              totals.grossProfit
            )}
          </strong>
        </div>

        <div className="profit-summary-card">
          <div className="report-stat-icon orange">
            <ArrowDownToLine size={19} />
          </div>

          <span>Expenses</span>

          <strong>
            {formatCurrency(
              totals.expenses
            )}
          </strong>
        </div>

        <div className="profit-summary-card net-profit">
          <div className="report-stat-icon purple">
            <TrendingUp size={19} />
          </div>

          <span>Net Profit</span>

          <strong>
            {formatCurrency(
              totals.netProfit
            )}
          </strong>
        </div>
      </section>

      <section className="report-panel">
        <div className="report-panel-heading">
          <div>
            <h2>
              {year} Profit Breakdown
            </h2>

            <p>
              Monthly gross profit, expenses
              and calculated net profit.
            </p>
          </div>

          <div className="profit-margin-display">
            <span>Annual Margin</span>

            <strong>
              {totals.sales > 0
                ? (
                  (totals.netProfit /
                    totals.sales) *
                  100
                ).toFixed(1)
                : "0.0"}
              %
            </strong>
          </div>
        </div>

        {loading && (
          <div className="report-empty-state">
            <RefreshCw
              className="report-loading-icon"
              size={25}
            />

            <h3>
              Loading profit report...
            </h3>
          </div>
        )}

        {!loading && error && (
          <div className="report-empty-state error">
            <h3>
              Unable to load report
            </h3>

            <p>
              {error?.message}
            </p>
          </div>
        )}

        {!loading &&
          !error && (
            <div className="report-table-wrapper">
              <table className="report-table profit-report-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Sales</th>
                    <th>Gross Profit</th>
                    <th>Expenses</th>
                    <th>Net Profit</th>
                    <th>Margin</th>
                    <th>Records</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleData.map(
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

                      const margin =
                        item.sales > 0
                          ? (item.netProfit /
                            item.sales) *
                          100
                          : 0;

                      return (
                        <tr key={item.month}>
                          <td>
                            <strong>
                              {month}
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
                                item.grossProfit
                              )}
                            </strong>
                          </td>

                          <td>
                            {formatCurrency(
                              item.expenses
                            )}
                          </td>

                          <td>
                            <strong
                              className={
                                item.netProfit >=
                                  0
                                  ? "positive-value"
                                  : "negative-value"
                              }
                            >
                              {item.netProfit >=
                                0
                                ? "+"
                                : ""}
                              {formatCurrency(
                                item.netProfit
                              )}
                            </strong>
                          </td>

                          <td>
                            <span className="margin-pill">
                              {margin.toFixed(
                                1
                              )}
                              %
                            </span>
                          </td>

                          <td>
                            {item.records}
                          </td>
                        </tr>
                      );
                    }
                  )}

                  <tr className="report-total-row">
                    <td>
                      <strong>
                        Total
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(
                          totals.sales
                        )}
                      </strong>
                    </td>

                    <td>
                      <strong className="positive-value">
                        +
                        {formatCurrency(
                          totals.grossProfit
                        )}
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(
                          totals.expenses
                        )}
                      </strong>
                    </td>

                    <td>
                      <strong
                        className={
                          totals.netProfit >=
                            0
                            ? "positive-value"
                            : "negative-value"
                        }
                      >
                        {totals.netProfit >=
                          0
                          ? "+"
                          : ""}
                        {formatCurrency(
                          totals.netProfit
                        )}
                      </strong>
                    </td>

                    <td>
                      {totals.sales > 0
                        ? (
                          (totals.netProfit /
                            totals.sales) *
                          100
                        ).toFixed(1)
                        : "0.0"}
                      %
                    </td>

                    <td>
                      {totals.records}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}