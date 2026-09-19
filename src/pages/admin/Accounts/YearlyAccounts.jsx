import React, { useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  TrendingUp,
  WalletCards,
  CalendarRange,
  ArrowUpRight,
} from "lucide-react";

import { formatCurrency } from "../../../utils/currency";
import { useTransactions } from "../../../hooks/useTransactions";

import "./AccountsReports.css";

export default function YearlyTurnover() {
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

  const yearlyData = useMemo(() => {
    const months = Array.from(
      { length: 12 },
      (_, index) => ({
        month: index,
        turnover: 0,
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

        months[month].turnover +=
          getAmount(item);

        months[month].records += 1;
      }
    );

    return months;
  }, [transactions, year]);

  const visibleMonths =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      if (!query) {
        return yearlyData;
      }

      return yearlyData.filter(
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
    }, [yearlyData, search, year]);

  const totalTurnover =
    yearlyData.reduce(
      (sum, item) =>
        sum + item.turnover,
      0
    );

  const totalRecords =
    yearlyData.reduce(
      (sum, item) =>
        sum + item.records,
      0
    );

  const highestMonth =
    yearlyData.reduce(
      (highest, current) =>
        current.turnover >
          highest.turnover
          ? current
          : highest,
      yearlyData[0] || {
        month: 0,
        turnover: 0,
      }
    );

  const averageMonthly =
    totalTurnover / 12;

  const exportCSV = () => {
    const headers = [
      "Month",
      "Turnover",
      "Records",
    ];

    const rows = yearlyData.map(
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
          item.turnover,
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
    link.download = `yearly-turnover-${year}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const getGrowth = (index) => {
    if (index === 0) {
      return null;
    }

    const previous =
      yearlyData[index - 1]
        ?.turnover || 0;

    const current =
      yearlyData[index]?.turnover ||
      0;

    if (previous === 0) {
      return current > 0
        ? 100
        : 0;
    }

    return (
      ((current - previous) /
        previous) *
      100
    );
  };

  return (
    <div className="accounts-report-page">
      <div className="report-page-head">
        <div>
          <div className="report-eyebrow">
            MANAGEMENT
          </div>

          <h1>Yearly Turnover</h1>

          <p>
            Month-by-month annual turnover
            and growth.
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
              totalTurnover
            )}
          </strong>

          <small>
            Total turnover in {year}
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon green">
            <TrendingUp size={19} />
          </div>

          <span>Average / Month</span>

          <strong>
            {formatCurrency(
              averageMonthly
            )}
          </strong>

          <small>
            Average across 12 months
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon purple">
            <ArrowUpRight size={19} />
          </div>

          <span>Highest Month</span>

          <strong>
            {formatCurrency(
              highestMonth.turnover
            )}
          </strong>

          <small>
            {new Intl.DateTimeFormat(
              "en-IN",
              {
                month: "long",
              }
            ).format(
              new Date(
                year,
                highestMonth.month,
                1
              )
            )}
          </small>
        </div>

        <div className="report-stat-card">
          <div className="report-stat-icon orange">
            <CalendarRange size={19} />
          </div>

          <span>Total Records</span>

          <strong>
            {totalRecords}
          </strong>

          <small>
            Transaction records
          </small>
        </div>
      </section>

      <section className="report-panel">
        <div className="report-panel-heading">
          <div>
            <h2>
              {year} Turnover Overview
            </h2>

            <p>
              Monthly turnover and growth
              compared with the previous
              month.
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
              Loading yearly turnover...
            </h3>
          </div>
        )}

        {!loading && error && (
          <div className="report-empty-state error">
            <h3>
              Unable to load turnover
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
                    <th>Turnover</th>
                    <th>Records</th>
                    <th>Monthly Average</th>
                    <th>Growth</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleMonths.map(
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

                      const growth =
                        getGrowth(
                          item.month
                        );

                      return (
                        <tr key={item.month}>
                          <td>
                            <strong>
                              {month}
                            </strong>
                          </td>

                          <td>
                            <strong className="turnover-value">
                              {formatCurrency(
                                item.turnover
                              )}
                            </strong>
                          </td>

                          <td>
                            <span className="record-pill">
                              {item.records}
                            </span>
                          </td>

                          <td>
                            {formatCurrency(
                              averageMonthly
                            )}
                          </td>

                          <td>
                            {growth === null ? (
                              <span className="growth-pill neutral">
                                —
                              </span>
                            ) : (
                              <span
                                className={`growth-pill ${growth >=
                                    0
                                    ? "up"
                                    : "down"
                                  }`}
                              >
                                {growth >=
                                  0
                                  ? "+"
                                  : ""}
                                {growth.toFixed(
                                  1
                                )}
                                %
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}

                  <tr className="report-total-row">
                    <td>
                      <strong>
                        Annual Total
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(
                          totalTurnover
                        )}
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {totalRecords}
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(
                          averageMonthly
                        )}
                      </strong>
                    </td>

                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
      </section>
    </div>
  );
}