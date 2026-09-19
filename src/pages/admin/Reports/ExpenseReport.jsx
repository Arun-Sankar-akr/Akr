import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  Receipt,
  IndianRupee,
  Tags,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";
import "./Reports.css";

const money = (value) => Number(value || 0);

function dateObject(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateObject(value);

  if (!date) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function downloadCSV(rows) {
  const headers = [
    "Date",
    "Category",
    "Description",
    "Amount",
    "Paid By",
  ];

  const csvRows = rows.map((item) => [
    formatDate(item.date),
    item.category,
    item.description,
    item.amount,
    item.paidBy,
  ]);

  const escape = (value) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csv = [
    headers.map(escape).join(","),
    ...csvRows.map((row) => row.map(escape).join(",")),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `expense-report-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  link.click();
  URL.revokeObjectURL(url);
}

export default function ExpenseReport() {
  const [expenses, setExpenses] = useState([]);

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(
      collection(db, "expenses"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setExpenses(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );

        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(
          err?.code === "permission-denied"
            ? "Only administrators can view expense reports."
            : "Unable to load expense report."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const expenseRows = useMemo(() => {
    return expenses
      .map((item) => ({
        id: item.id,

        date:
          item.createdAt ||
          item.date ||
          item.expenseDate,

        category:
          item.category ||
          item.expenseCategory ||
          "Other",

        description:
          item.description ||
          item.title ||
          item.notes ||
          "Expense",

        amount: money(item.amount),

        paidBy:
          item.paidByName ||
          item.createdByName ||
          item.paidBy ||
          "Admin",
      }))
      .filter((item) => {
        const date = dateObject(item.date);

        if (fromDate && date) {
          const from = new Date(`${fromDate}T00:00:00`);

          if (date < from) return false;
        }

        if (toDate && date) {
          const to = new Date(`${toDate}T23:59:59`);

          if (date > to) return false;
        }

        const term = search.trim().toLowerCase();

        if (!term) return true;

        return [
          item.category,
          item.description,
          item.paidBy,
        ].some((value) =>
          String(value).toLowerCase().includes(term)
        );
      });
  }, [expenses, search, fromDate, toDate]);

  const totalExpense = expenseRows.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const categories = useMemo(() => {
    const map = new Map();

    expenseRows.forEach((item) => {
      const key = item.category.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          name: item.category,
          amount: 0,
          count: 0,
        });
      }

      const current = map.get(key);

      current.amount += item.amount;
      current.count += 1;
    });

    return Array.from(map.values()).sort(
      (a, b) => b.amount - a.amount
    );
  }, [expenseRows]);

  return (
    <div className="report-page">
      <div className="report-page-head">
        <div>
          <div className="eyebrow">REPORTS</div>
          <h1>Expense Report</h1>
          <p>Review business expenses and spending categories.</p>
        </div>

        <button
          className="secondary-btn"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="report-stat-grid">
        <div className="report-stat">
          <div className="report-stat-icon red">
            <Receipt size={19} />
          </div>

          <div>
            <span>Expenses</span>
            <strong>{expenseRows.length}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon orange">
            <IndianRupee size={19} />
          </div>

          <div>
            <span>Total Expense</span>
            <strong>{formatCurrency(totalExpense)}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon purple">
            <Tags size={19} />
          </div>

          <div>
            <span>Categories</span>
            <strong>{categories.length}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon blue">
            <TrendingDown size={19} />
          </div>

          <div>
            <span>Average Expense</span>
            <strong>
              {formatCurrency(
                expenseRows.length
                  ? totalExpense / expenseRows.length
                  : 0
              )}
            </strong>
          </div>
        </div>
      </div>

      <section className="report-panel">
        <div className="report-toolbar">
          <div className="report-search">
            <Search size={16} />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search category, description..."
            />
          </div>

          <div className="report-filters">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />

            <span>to</span>

            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />

            <button
              className="secondary-btn"
              disabled={!expenseRows.length}
              onClick={() => downloadCSV(expenseRows)}
            >
              <Download size={15} />
              Export
            </button>
          </div>
        </div>

        {error && <div className="report-error">{error}</div>}

        <div className="expense-category-strip">
          {categories.slice(0, 5).map((category) => (
            <div
              className="expense-category-card"
              key={category.name}
            >
              <div>
                <span>{category.name}</span>
                <strong>
                  {formatCurrency(category.amount)}
                </strong>
              </div>

              <small>{category.count} entries</small>
            </div>
          ))}
        </div>

        <div className="report-table-wrap">
          {loading ? (
            <div className="report-empty">
              <div className="report-loader" />
              <h3>Loading expense report...</h3>
            </div>
          ) : expenseRows.length === 0 ? (
            <div className="report-empty">
              <div className="report-empty-icon red">
                <Receipt size={24} />
              </div>

              <h3>No expenses found</h3>

              <p>
                Expense records will appear here when expenses are
                recorded.
              </p>
            </div>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Paid By</th>
                  <th>Amount</th>
                </tr>
              </thead>

              <tbody>
                {expenseRows.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.date)}</td>

                    <td>
                      <span className="expense-badge">
                        {item.category}
                      </span>
                    </td>

                    <td>
                      <strong>{item.description}</strong>
                    </td>

                    <td>{item.paidBy}</td>

                    <td>
                      <strong className="expense-value">
                        -{formatCurrency(item.amount)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}