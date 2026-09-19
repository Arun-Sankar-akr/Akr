import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCw,
  ClipboardList,
  User,
  CalendarDays,
  Filter,
  Trash2,
  Eye,
  X,
  CheckCircle2,
  AlertCircle,
  Settings2,
  ArrowRightLeft,
  ReceiptText,
} from "lucide-react";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

import { getAuth } from "firebase/auth";
import { db } from "../../services/firebase";

import "./AuditLogs.css";

const ACTION_STYLES = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LOGIN: "login",
  LOGOUT: "logout",
  PAYMENT: "payment",
  TRANSFER: "transfer",
  WITHDRAWAL: "withdrawal",
  SETTINGS: "settings",
};

function formatDate(value) {
  if (!value) return "—";

  try {
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getDateObject(value) {
  if (!value) return null;

  try {
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const [selectedLog, setSelectedLog] = useState(null);
  const [deletingId, setDeletingId] = useState("");

  const auth = getAuth();

  const loadLogs = async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError("Please sign in to view audit logs.");
        setLogs([]);
        return;
      }

      const logsQuery = query(
        collection(db, "auditLogs"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(logsQuery);

      const result = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      setLogs(result);
    } catch (err) {
      console.error("Audit log error:", err);

      if (
        err?.code === "permission-denied" ||
        err?.code === "PERMISSION_DENIED"
      ) {
        setError(
          "You do not have permission to view audit logs."
        );
      } else {
        setError(
          err?.message || "Unable to load audit logs."
        );
      }

      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        loadLogs();
      } else {
        setLoading(false);
        setLogs([]);
        setError("Please sign in to continue.");
      }
    });

    return unsubscribe;
  }, []);

  const modules = useMemo(() => {
    const values = logs
      .map(
        (item) =>
          item.module ||
          item.section ||
          item.resource ||
          "General"
      )
      .filter(Boolean);

    return [...new Set(values)].sort();
  }, [logs]);

  const actions = useMemo(() => {
    const values = logs
      .map((item) => String(item.action || "OTHER").toUpperCase())
      .filter(Boolean);

    return [...new Set(values)].sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();

    const now = new Date();

    return logs.filter((log) => {
      const action = String(
        log.action || "OTHER"
      ).toUpperCase();

      const module =
        log.module ||
        log.section ||
        log.resource ||
        "General";

      const userName =
        log.userName ||
        log.attendantName ||
        log.staffName ||
        log.createdByName ||
        log.email ||
        "";

      const description =
        log.description ||
        log.details ||
        log.message ||
        "";

      const searchMatch =
        !term ||
        [
          action,
          module,
          userName,
          description,
          log.email,
          log.documentId,
          log.referenceId,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(term)
          );

      const actionMatch =
        actionFilter === "all" ||
        action === actionFilter;

      const moduleMatch =
        moduleFilter === "all" ||
        module === moduleFilter;

      let dateMatch = true;

      const date = getDateObject(log.createdAt);

      if (dateFilter !== "all" && date) {
        const diff =
          (now.getTime() - date.getTime()) /
          (1000 * 60 * 60 * 24);

        if (dateFilter === "today") {
          dateMatch =
            date.toDateString() === now.toDateString();
        }

        if (dateFilter === "7days") {
          dateMatch = diff <= 7;
        }

        if (dateFilter === "30days") {
          dateMatch = diff <= 30;
        }
      }

      return (
        searchMatch &&
        actionMatch &&
        moduleMatch &&
        dateMatch
      );
    });
  }, [
    logs,
    search,
    actionFilter,
    moduleFilter,
    dateFilter,
  ]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();

    const todayLogs = logs.filter((log) => {
      const date = getDateObject(log.createdAt);
      return date?.toDateString() === today;
    });

    const createCount = logs.filter(
      (log) =>
        String(log.action || "").toUpperCase() === "CREATE"
    ).length;

    const updateCount = logs.filter(
      (log) =>
        String(log.action || "").toUpperCase() === "UPDATE"
    ).length;

    const deleteCount = logs.filter(
      (log) =>
        String(log.action || "").toUpperCase() === "DELETE"
    ).length;

    return {
      total: logs.length,
      today: todayLogs.length,
      create: createCount,
      update: updateCount,
      delete: deleteCount,
    };
  }, [logs]);

  const getActionIcon = (action) => {
    const value = String(action || "").toUpperCase();

    if (value === "DELETE") return <Trash2 size={15} />;
    if (value === "UPDATE") return <Settings2 size={15} />;
    if (value === "PAYMENT") return <ReceiptText size={15} />;
    if (
      value === "TRANSFER" ||
      value === "WITHDRAWAL"
    ) {
      return <ArrowRightLeft size={15} />;
    }

    if (value === "LOGIN") return <CheckCircle2 size={15} />;

    return <ClipboardList size={15} />;
  };

  const exportCsv = () => {
    if (!filteredLogs.length) {
      alert("There are no audit logs to export.");
      return;
    }

    const rows = [
      [
        "Date",
        "Action",
        "Module",
        "User",
        "Email",
        "Description",
        "Document ID",
      ],
      ...filteredLogs.map((log) => [
        formatDate(log.createdAt),
        log.action || "",
        log.module ||
          log.section ||
          log.resource ||
          "General",
        log.userName ||
          log.attendantName ||
          log.staffName ||
          log.createdByName ||
          "",
        log.email || "",
        log.description ||
          log.details ||
          log.message ||
          "",
        log.documentId || "",
      ]),
    ];

    const csv = rows
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-logs-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const deleteLog = async (log) => {
    const confirmed = window.confirm(
      "Delete this audit log permanently?"
    );

    if (!confirmed) return;

    try {
      setDeletingId(log.id);

      await deleteDoc(doc(db, "auditLogs", log.id));

      setLogs((previous) =>
        previous.filter((item) => item.id !== log.id)
      );

      if (selectedLog?.id === log.id) {
        setSelectedLog(null);
      }
    } catch (err) {
      console.error(err);
      alert(
        err?.message ||
          "Unable to delete this audit log."
      );
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="audit-page">
      <div className="audit-page-head">
        <div>
          <div className="audit-eyebrow">
            MANAGEMENT
          </div>

          <h1>Audit Logs</h1>

          <p>
            Track important changes and financial actions
            across your shop.
          </p>
        </div>

        <div className="audit-head-actions">
          <button
            className="audit-secondary-btn"
            onClick={() => loadLogs(true)}
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "audit-spin" : ""}
            />
            Refresh
          </button>

          <button
            className="audit-primary-btn"
            onClick={exportCsv}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="audit-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="audit-stats">
        <div className="audit-stat">
          <div className="audit-stat-icon blue">
            <ClipboardList size={19} />
          </div>

          <div>
            <span>Total Logs</span>
            <strong>{stats.total}</strong>
          </div>
        </div>

        <div className="audit-stat">
          <div className="audit-stat-icon purple">
            <CalendarDays size={19} />
          </div>

          <div>
            <span>Today</span>
            <strong>{stats.today}</strong>
          </div>
        </div>

        <div className="audit-stat">
          <div className="audit-stat-icon green">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <span>Created</span>
            <strong>{stats.create}</strong>
          </div>
        </div>

        <div className="audit-stat">
          <div className="audit-stat-icon orange">
            <Settings2 size={19} />
          </div>

          <div>
            <span>Updated</span>
            <strong>{stats.update}</strong>
          </div>
        </div>

        <div className="audit-stat">
          <div className="audit-stat-icon red">
            <Trash2 size={19} />
          </div>

          <div>
            <span>Deleted</span>
            <strong>{stats.delete}</strong>
          </div>
        </div>
      </div>

      <section className="audit-panel">
        <div className="audit-toolbar">
          <div className="audit-search">
            <Search size={17} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search audit logs..."
            />
          </div>

          <div className="audit-filters">
            <div className="audit-filter">
              <Filter size={15} />

              <select
                value={actionFilter}
                onChange={(e) =>
                  setActionFilter(e.target.value)
                }
              >
                <option value="all">All Actions</option>

                {actions.map((action) => (
                  <option
                    value={action}
                    key={action}
                  >
                    {action}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-filter">
              <select
                value={moduleFilter}
                onChange={(e) =>
                  setModuleFilter(e.target.value)
                }
              >
                <option value="all">All Modules</option>

                {modules.map((module) => (
                  <option
                    value={module}
                    key={module}
                  >
                    {module}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-filter">
              <CalendarDays size={15} />

              <select
                value={dateFilter}
                onChange={(e) =>
                  setDateFilter(e.target.value)
                }
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="7days">
                  Last 7 Days
                </option>
                <option value="30days">
                  Last 30 Days
                </option>
              </select>
            </div>
          </div>
        </div>

        <div className="audit-results">
          <span>
            Showing <strong>{filteredLogs.length}</strong>{" "}
            of <strong>{logs.length}</strong> logs
          </span>
        </div>

        {loading ? (
          <div className="audit-loader">
            <div className="audit-loader-ring" />
            <p>Loading audit logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="audit-empty">
            <div className="audit-empty-icon">
              <ClipboardList size={28} />
            </div>

            <h2>No audit logs found</h2>

            <p>
              {logs.length
                ? "Try changing your search or filters."
                : "Important system actions will appear here when audit records are created."}
            </p>
          </div>
        ) : (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Module</th>
                  <th>User</th>
                  <th>Description</th>
                  <th>Date & Time</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {filteredLogs.map((log) => {
                  const action = String(
                    log.action || "OTHER"
                  ).toUpperCase();

                  const module =
                    log.module ||
                    log.section ||
                    log.resource ||
                    "General";

                  const userName =
                    log.userName ||
                    log.attendantName ||
                    log.staffName ||
                    log.createdByName ||
                    "System";

                  const description =
                    log.description ||
                    log.details ||
                    log.message ||
                    "No description";

                  const style =
                    ACTION_STYLES[action] || "default";

                  return (
                    <tr key={log.id}>
                      <td>
                        <span
                          className={`audit-action ${style}`}
                        >
                          {getActionIcon(action)}
                          {action}
                        </span>
                      </td>

                      <td>
                        <span className="audit-module">
                          {module}
                        </span>
                      </td>

                      <td>
                        <div className="audit-user">
                          <div className="audit-user-avatar">
                            <User size={15} />
                          </div>

                          <div>
                            <strong>{userName}</strong>

                            {log.email && (
                              <small>{log.email}</small>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="audit-description">
                          {description}
                        </div>
                      </td>

                      <td>
                        <span className="audit-date">
                          {formatDate(log.createdAt)}
                        </span>
                      </td>

                      <td>
                        <div className="audit-row-actions">
                          <button
                            className="audit-icon-btn"
                            title="View details"
                            onClick={() =>
                              setSelectedLog(log)
                            }
                          >
                            <Eye size={16} />
                          </button>

                          <button
                            className="audit-icon-btn danger"
                            title="Delete"
                            disabled={
                              deletingId === log.id
                            }
                            onClick={() =>
                              deleteLog(log)
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedLog && (
        <div
          className="audit-modal-backdrop"
          onMouseDown={() => setSelectedLog(null)}
        >
          <div
            className="audit-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="audit-modal-head">
              <div>
                <span>LOG DETAILS</span>
                <h2>Audit Activity</h2>
              </div>

              <button
                className="audit-close-btn"
                onClick={() =>
                  setSelectedLog(null)
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="audit-detail-grid">
              <div>
                <span>Action</span>
                <strong>
                  {String(
                    selectedLog.action || "OTHER"
                  ).toUpperCase()}
                </strong>
              </div>

              <div>
                <span>Module</span>
                <strong>
                  {selectedLog.module ||
                    selectedLog.section ||
                    selectedLog.resource ||
                    "General"}
                </strong>
              </div>

              <div>
                <span>User</span>
                <strong>
                  {selectedLog.userName ||
                    selectedLog.attendantName ||
                    selectedLog.staffName ||
                    selectedLog.createdByName ||
                    "System"}
                </strong>
              </div>

              <div>
                <span>Date</span>
                <strong>
                  {formatDate(
                    selectedLog.createdAt
                  )}
                </strong>
              </div>
            </div>

            <div className="audit-detail-description">
              <span>Description</span>
              <p>
                {selectedLog.description ||
                  selectedLog.details ||
                  selectedLog.message ||
                  "No description available."}
              </p>
            </div>

            {selectedLog.documentId && (
              <div className="audit-document-id">
                <span>Document ID</span>
                <code>{selectedLog.documentId}</code>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}