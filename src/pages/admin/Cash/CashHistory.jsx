import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  WalletCards,
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  X,
  Eye,
} from "lucide-react";

import {
  collection,
  onSnapshot,
} from "firebase/firestore";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";

import "./CashRegister.css";

export default function CashHistory() {
  const [registers, setRegisters] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedRegister, setSelectedRegister] =
    useState(null);

  const [loading, setLoading] = useState(true);

  /* =====================================================
     LOAD HISTORY
  ===================================================== */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "cashRegisters"),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        data.sort((a, b) => {
          const aTime =
            a.closedAt?.seconds ||
            a.openedAt?.seconds ||
            0;

          const bTime =
            b.closedAt?.seconds ||
            b.openedAt?.seconds ||
            0;

          return bTime - aTime;
        });

        setRegisters(data);
        setLoading(false);
      },
      (error) => {
        console.error(
          "Cash history error:",
          error
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* =====================================================
     FILTER
  ===================================================== */

  const filteredRegisters = useMemo(() => {
    const value = search.trim().toLowerCase();

    return registers.filter((register) => {
      const matchesSearch =
        !value ||
        [
          register.registerName,
          register.openedByName,
          register.closedByName,
          register.notes,
          register.closingNotes,
        ]
          .filter(Boolean)
          .some((field) =>
            String(field)
              .toLowerCase()
              .includes(value)
          );

      const matchesStatus =
        status === "all" ||
        register.status === status;

      return matchesSearch && matchesStatus;
    });
  }, [registers, search, status]);

  /* =====================================================
     STATS
  ===================================================== */

  const closed = registers.filter(
    (item) => item.status === "closed"
  );

  const totalExpected = closed.reduce(
    (sum, item) =>
      sum + Number(item.expectedCash || 0),
    0
  );

  const totalActual = closed.reduce(
    (sum, item) =>
      sum + Number(item.actualCash || 0),
    0
  );

  const totalDifference = closed.reduce(
    (sum, item) =>
      sum + Number(item.difference || 0),
    0
  );

  const shortageCount = closed.filter(
    (item) => Number(item.difference || 0) < 0
  ).length;

  /* =====================================================
     EXPORT
  ===================================================== */

  const exportHistory = () => {
    if (!filteredRegisters.length) {
      alert("No cash history available.");
      return;
    }

    const headers = [
      "Date",
      "Register",
      "Status",
      "Opening Cash",
      "Expected Cash",
      "Actual Cash",
      "Difference",
      "Opened By",
      "Closed By",
    ];

    const rows = filteredRegisters.map((item) => [
      formatDate(
        item.closedAt || item.openedAt
      ),
      item.registerName ||
      "Main Cash Register",
      item.status || "",
      Number(item.openingCash || 0),
      Number(item.expectedCash || 0),
      Number(item.actualCash || 0),
      Number(item.difference || 0),
      item.openedByName || "",
      item.closedByName || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) =>
            `"${String(value).replace(/"/g, '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `cash-history-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="cash-history-page">

      {/* HEADER */}

      <div className="page-head">

        <div>
          <div className="eyebrow">
            CASH MANAGEMENT
          </div>

          <h1>Cash History</h1>

          <p>
            Review opening, expected and actual cash.
          </p>
        </div>

        <button
          className="secondary-btn"
          onClick={exportHistory}
        >
          <Download size={15} />
          Export History
        </button>

      </div>

      {/* SUMMARY */}

      <div className="cash-history-stats">

        <HistoryStat
          icon={<WalletCards size={19} />}
          label="Closed Registers"
          value={closed.length}
        />

        <HistoryStat
          icon={<CircleDollarSign size={19} />}
          label="Expected Cash"
          value={formatCurrency(totalExpected)}
        />

        <HistoryStat
          icon={<CircleDollarSign size={19} />}
          label="Actual Cash"
          value={formatCurrency(totalActual)}
        />

        <HistoryStat
          icon={
            totalDifference >= 0 ? (
              <TrendingUp size={19} />
            ) : (
              <TrendingDown size={19} />
            )
          }
          label="Net Difference"
          value={formatCurrency(totalDifference)}
          className={
            totalDifference < 0
              ? "negative"
              : "positive"
          }
        />

      </div>

      {/* SHORTAGE NOTICE */}

      {shortageCount > 0 && (
        <div className="cash-notice">
          <TrendingDown size={17} />

          <div>
            <strong>
              {shortageCount} register
              {shortageCount > 1 ? "s" : ""} had a
              cash shortage.
            </strong>

            <span>
              Review the individual register records
              below for reconciliation details.
            </span>
          </div>
        </div>
      )}

      {/* HISTORY PANEL */}

      <section className="panel cash-history-panel">

        <div className="history-toolbar">

          <div className="search-bar">
            <Search size={16} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search register history..."
            />

            {search && (
              <button
                className="clear-search"
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="history-filters">

            <button
              className={
                status === "all"
                  ? "filter-btn active"
                  : "filter-btn"
              }
              onClick={() => setStatus("all")}
            >
              All
            </button>

            <button
              className={
                status === "open"
                  ? "filter-btn active"
                  : "filter-btn"
              }
              onClick={() => setStatus("open")}
            >
              Open
            </button>

            <button
              className={
                status === "closed"
                  ? "filter-btn active"
                  : "filter-btn"
              }
              onClick={() => setStatus("closed")}
            >
              Closed
            </button>

            <button
              className="secondary-btn"
              onClick={exportHistory}
            >
              <Download size={14} />
              Export
            </button>

          </div>

        </div>

        {loading ? (
          <div className="cash-loading">
            <div className="cash-spinner" />
            <span>Loading cash history...</span>
          </div>
        ) : filteredRegisters.length === 0 ? (
          <div className="cash-empty">

            <div className="cash-empty-icon">
              <WalletCards size={28} />
            </div>

            <h2>No history found</h2>

            <p>
              No cash register records match your
              current filters.
            </p>

          </div>
        ) : (
          <div className="cash-table-wrap">

            <table className="cash-table">

              <thead>
                <tr>
                  <th>Date</th>
                  <th>Register</th>
                  <th>Opening</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Difference</th>
                  <th>Opened By</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {filteredRegisters.map((register) => {
                  const difference = Number(
                    register.difference || 0
                  );

                  return (
                    <tr key={register.id}>

                      <td>
                        <strong>
                          {formatDate(
                            register.closedAt ||
                            register.openedAt
                          )}
                        </strong>
                      </td>

                      <td>
                        <div className="register-name">

                          <div className="register-mini-icon">
                            <WalletCards size={15} />
                          </div>

                          <div>
                            <strong>
                              {register.registerName ||
                                "Main Cash Register"}
                            </strong>

                            <small>
                              {register.closedByName
                                ? `Closed by ${register.closedByName}`
                                : "Still active"}
                            </small>
                          </div>

                        </div>
                      </td>

                      <td>
                        {formatCurrency(
                          Number(
                            register.openingCash || 0
                          )
                        )}
                      </td>

                      <td>
                        {formatCurrency(
                          Number(
                            register.expectedCash || 0
                          )
                        )}
                      </td>

                      <td>
                        {register.status === "open"
                          ? "—"
                          : formatCurrency(
                            Number(
                              register.actualCash ||
                              0
                            )
                          )}
                      </td>

                      <td>
                        {register.status === "open" ? (
                          "—"
                        ) : (
                          <strong
                            className={
                              difference < 0
                                ? "negative"
                                : difference > 0
                                  ? "positive"
                                  : "balanced"
                            }
                          >
                            {difference > 0
                              ? "+"
                              : ""}
                            {formatCurrency(
                              difference
                            )}
                          </strong>
                        )}
                      </td>

                      <td>
                        {register.openedByName ||
                          "User"}
                      </td>

                      <td>
                        <span
                          className={`status-pill ${register.status ===
                              "open"
                              ? "status-open"
                              : "status-closed"
                            }`}
                        >
                          {register.status ===
                            "open"
                            ? "Open"
                            : "Closed"}
                        </span>
                      </td>

                      <td>
                        <button
                          className="icon-action"
                          onClick={() =>
                            setSelectedRegister(
                              register
                            )
                          }
                        >
                          <Eye size={16} />
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}

        <div className="cash-footer">
          Showing {filteredRegisters.length} of{" "}
          {registers.length} records
        </div>

      </section>

      {/* DETAILS */}

      {selectedRegister && (
        <CashHistoryDetails
          register={selectedRegister}
          onClose={() =>
            setSelectedRegister(null)
          }
        />
      )}

    </div>
  );
}

/* =========================================================
   STAT
========================================================= */

function HistoryStat({
  icon,
  label,
  value,
  className = "",
}) {
  return (
    <div className="cash-stat-card">

      <div className="cash-stat-icon">
        {icon}
      </div>

      <div>
        <span>{label}</span>

        <strong className={className}>
          {value}
        </strong>
      </div>

    </div>
  );
}

/* =========================================================
   DETAILS
========================================================= */

function CashHistoryDetails({
  register,
  onClose,
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="register-details-modal"
        onMouseDown={(e) =>
          e.stopPropagation()
        }
      >

        <div className="cash-modal-head">

          <div>
            <span className="modal-eyebrow">
              CASH HISTORY
            </span>

            <h2>
              {register.registerName ||
                "Main Cash Register"}
            </h2>

            <p>
              {formatDate(
                register.closedAt ||
                register.openedAt
              )}
            </p>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            <X size={18} />
          </button>

        </div>

        <div className="register-detail-grid">

          <Detail
            label="Status"
            value={
              register.status === "open"
                ? "Open"
                : "Closed"
            }
          />

          <Detail
            label="Opening Cash"
            value={formatCurrency(
              Number(register.openingCash || 0)
            )}
          />

          <Detail
            label="Cash Sales"
            value={formatCurrency(
              Number(register.cashSales || 0)
            )}
          />

          <Detail
            label="Cash In"
            value={formatCurrency(
              Number(register.cashIn || 0)
            )}
          />

          <Detail
            label="Cash Out"
            value={formatCurrency(
              Number(register.cashOut || 0)
            )}
          />

          <Detail
            label="Expected Cash"
            value={formatCurrency(
              Number(register.expectedCash || 0)
            )}
          />

          <Detail
            label="Actual Cash"
            value={
              register.status === "open"
                ? "—"
                : formatCurrency(
                  Number(
                    register.actualCash || 0
                  )
                )
            }
          />

          <Detail
            label="Difference"
            value={
              register.status === "open"
                ? "—"
                : formatCurrency(
                  Number(
                    register.difference || 0
                  )
                )
            }
          />

          <Detail
            label="Opened By"
            value={
              register.openedByName || "User"
            }
          />

          <Detail
            label="Closed By"
            value={
              register.closedByName || "—"
            }
          />

        </div>

        {register.notes && (
          <div className="register-note">
            <span>Opening Notes</span>
            <p>{register.notes}</p>
          </div>
        )}

        {register.closingNotes && (
          <div className="register-note">
            <span>Closing Notes</span>
            <p>{register.closingNotes}</p>
          </div>
        )}

        <div className="cash-modal-actions">
          <button
            className="secondary-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="register-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/* =========================================================
   DATE
========================================================= */

function formatDate(value) {
  if (!value) return "—";

  try {
    const date = value?.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}