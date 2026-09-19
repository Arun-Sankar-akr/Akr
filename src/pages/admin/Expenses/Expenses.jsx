import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  Plus,
  Pencil,
  Trash2,
  Eye,
  X,
  CalendarDays,
  WalletCards,
  Receipt,
  TrendingDown,
  RefreshCw,
} from "lucide-react";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";
import { useAuth } from "../../../context/AuthContext";

import "./Expense.css";

const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Water",
  "Paper",
  "Toner",
  "Salary",
  "Internet",
  "Maintenance",
  "Transport",
  "Office Supplies",
  "Equipment",
  "Printing Materials",
  "Cleaning",
  "Food",
  "Other",
];

const PAYMENT_METHODS = [
  "Cash",
  "UPI",
  "Card",
  "Bank Transfer",
  "Other",
];

function getDateValue(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function formatDate(value) {
  const date = getDateValue(value);

  if (!date) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  const date = getDateValue(value);

  if (!date) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getExpenseDate(expense) {
  return (
    expense.expenseDate ||
    expense.date ||
    expense.createdAt ||
    expense.createdDate
  );
}

function getExpenseAmount(expense) {
  return Number(
    expense.amount ??
    expense.expenseAmount ??
    expense.total ??
    0
  );
}

function escapeCsv(value) {
  const text = String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export default function Expenses() {
  const { user, profile } = useAuth();

  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [paymentMethod, setPaymentMethod] = useState("All");
  const [dateFilter, setDateFilter] = useState("");

  const [selectedExpense, setSelectedExpense] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const expensesRef = collection(db, "expenses");

    const expensesQuery = query(
      expensesRef,
      orderBy("expenseDate", "desc")
    );

    const unsubscribe = onSnapshot(
      expensesQuery,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setExpenses(data);
        setLoading(false);
      },
      (firebaseError) => {
        console.error(
          "Expenses Firestore error:",
          firebaseError
        );

        setError(
          firebaseError?.message ||
          "Unable to load expenses."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const filteredExpenses = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return expenses.filter((expense) => {
      const expenseCategory =
        expense.category || "Other";

      const expensePayment =
        expense.paymentMethod || "Cash";

      const expenseDate = getDateValue(
        getExpenseDate(expense)
      );

      const matchesSearch =
        !searchText ||
        [
          expense.title,
          expense.description,
          expense.category,
          expense.vendor,
          expense.paymentMethod,
          expense.notes,
          expense.addedByName,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(searchText)
          );

      const matchesCategory =
        category === "All" ||
        expenseCategory === category;

      const matchesPayment =
        paymentMethod === "All" ||
        expensePayment === paymentMethod;

      const matchesDate =
        !dateFilter ||
        (expenseDate &&
          expenseDate.toISOString().slice(0, 10) ===
          dateFilter);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesPayment &&
        matchesDate
      );
    });
  }, [
    expenses,
    search,
    category,
    paymentMethod,
    dateFilter,
  ]);

  const statistics = useMemo(() => {
    const total = filteredExpenses.reduce(
      (sum, expense) =>
        sum + getExpenseAmount(expense),
      0
    );

    const today = new Date();

    const todayTotal = expenses.reduce(
      (sum, expense) => {
        const expenseDate = getDateValue(
          getExpenseDate(expense)
        );

        if (!expenseDate) return sum;

        const sameDay =
          expenseDate.getFullYear() ===
          today.getFullYear() &&
          expenseDate.getMonth() ===
          today.getMonth() &&
          expenseDate.getDate() ===
          today.getDate();

        return sameDay
          ? sum + getExpenseAmount(expense)
          : sum;
      },
      0
    );

    const thisMonthTotal = expenses.reduce(
      (sum, expense) => {
        const expenseDate = getDateValue(
          getExpenseDate(expense)
        );

        if (!expenseDate) return sum;

        const sameMonth =
          expenseDate.getFullYear() ===
          today.getFullYear() &&
          expenseDate.getMonth() ===
          today.getMonth();

        return sameMonth
          ? sum + getExpenseAmount(expense)
          : sum;
      },
      0
    );

    return {
      total,
      todayTotal,
      thisMonthTotal,
      count: filteredExpenses.length,
    };
  }, [expenses, filteredExpenses]);

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;

    try {
      setDeleting(true);

      await deleteDoc(
        doc(db, "expenses", deleteTarget.id)
      );

      setDeleteTarget(null);

      if (
        selectedExpense?.id === deleteTarget.id
      ) {
        setSelectedExpense(null);
      }
    } catch (deleteError) {
      console.error(
        "Delete expense error:",
        deleteError
      );

      alert(
        deleteError?.message ||
        "Unable to delete expense."
      );
    } finally {
      setDeleting(false);
    }
  };

  const exportExpenses = () => {
    if (!filteredExpenses.length) {
      alert("There are no expenses to export.");
      return;
    }

    const headers = [
      "Date",
      "Title",
      "Category",
      "Vendor",
      "Payment Method",
      "Amount",
      "Description",
      "Added By",
    ];

    const rows = filteredExpenses.map(
      (expense) => [
        formatDate(getExpenseDate(expense)),
        expense.title || "",
        expense.category || "",
        expense.vendor || "",
        expense.paymentMethod || "",
        getExpenseAmount(expense),
        expense.description || "",
        expense.addedByName || "",
      ]
    );

    const csv = [
      headers,
      ...rows,
    ]
      .map((row) =>
        row.map(escapeCsv).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `expenses-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("All");
    setPaymentMethod("All");
    setDateFilter("");
  };

  return (
    <div className="expenses-page">
      <div className="expense-page-head">
        <div>
          <div className="expense-eyebrow">
            MANAGEMENT
          </div>

          <h1>Expenses</h1>

          <p>
            Record, monitor and review your shop
            operating expenses.
          </p>
        </div>

        <a
          href="/admin/expenses/add"
          className="expense-primary-btn"
        >
          <Plus size={17} />
          Add Expense
        </a>
      </div>

      {error && (
        <div className="expense-error">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={15} />
            Retry
          </button>
        </div>
      )}

      <div className="expense-stat-grid">
        <div className="expense-stat-card">
          <div className="expense-stat-icon blue">
            <Receipt size={20} />
          </div>

          <div>
            <span>Total Expenses</span>
            <strong>
              {formatCurrency(statistics.total)}
            </strong>
            <small>
              {statistics.count} records
            </small>
          </div>
        </div>

        <div className="expense-stat-card">
          <div className="expense-stat-icon orange">
            <CalendarDays size={20} />
          </div>

          <div>
            <span>Today's Expense</span>
            <strong>
              {formatCurrency(
                statistics.todayTotal
              )}
            </strong>
            <small>Current day</small>
          </div>
        </div>

        <div className="expense-stat-card">
          <div className="expense-stat-icon purple">
            <WalletCards size={20} />
          </div>

          <div>
            <span>This Month</span>
            <strong>
              {formatCurrency(
                statistics.thisMonthTotal
              )}
            </strong>
            <small>Current month</small>
          </div>
        </div>

        <div className="expense-stat-card">
          <div className="expense-stat-icon red">
            <TrendingDown size={20} />
          </div>

          <div>
            <span>Filtered Total</span>
            <strong>
              {formatCurrency(
                statistics.total
              )}
            </strong>
            <small>
              Based on current filters
            </small>
          </div>
        </div>
      </div>

      <section className="expense-panel">
        <div className="expense-toolbar">
          <div className="expense-search">
            <Search size={17} />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search expenses..."
            />
          </div>

          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value)
            }
            className="expense-filter"
          >
            <option value="All">
              All Categories
            </option>

            {EXPENSE_CATEGORIES.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <select
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(
                event.target.value
              )
            }
            className="expense-filter"
          >
            <option value="All">
              All Payments
            </option>

            {PAYMENT_METHODS.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              )
            )}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(event) =>
              setDateFilter(event.target.value)
            }
            className="expense-date-filter"
          />

          <button
            type="button"
            className="expense-secondary-btn"
            onClick={clearFilters}
          >
            Clear
          </button>

          <button
            type="button"
            className="expense-secondary-btn"
            onClick={exportExpenses}
          >
            <Download size={15} />
            Export
          </button>
        </div>

        <div className="expense-table-wrap">
          <table className="expense-table">
            <thead>
              <tr>
                <th>Expense</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Payment</th>
                <th>Date</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="7"
                    className="expense-empty"
                  >
                    <div className="expense-loader">
                      Loading expenses...
                    </div>
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="expense-empty"
                  >
                    <div className="expense-empty-icon">
                      <Receipt size={25} />
                    </div>

                    <strong>
                      No expenses found
                    </strong>

                    <span>
                      Add an expense or change
                      your filters.
                    </span>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(
                  (expense) => (
                    <tr key={expense.id}>
                      <td>
                        <div className="expense-name-cell">
                          <div className="expense-row-icon">
                            <Receipt size={16} />
                          </div>

                          <div>
                            <strong>
                              {expense.title ||
                                "Untitled Expense"}
                            </strong>

                            {expense.description && (
                              <span>
                                {expense.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="expense-category">
                          {expense.category ||
                            "Other"}
                        </span>
                      </td>

                      <td>
                        {expense.vendor ||
                          "—"}
                      </td>

                      <td>
                        <span className="expense-payment">
                          {expense.paymentMethod ||
                            "Cash"}
                        </span>
                      </td>

                      <td>
                        {formatDate(
                          getExpenseDate(
                            expense
                          )
                        )}
                      </td>

                      <td>
                        <strong className="expense-amount">
                          {formatCurrency(
                            getExpenseAmount(
                              expense
                            )
                          )}
                        </strong>
                      </td>

                      <td>
                        <div className="expense-actions">
                          <button
                            type="button"
                            title="View"
                            onClick={() =>
                              setSelectedExpense(
                                expense
                              )
                            }
                          >
                            <Eye size={16} />
                          </button>

                          <a
                            href={`#/admin/add-expense?id=${expense.id}`}
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </a>

                          {profile?.role ===
                            "admin" && (
                              <button
                                type="button"
                                className="danger"
                                title="Delete"
                                onClick={() =>
                                  setDeleteTarget(
                                    expense
                                  )
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        {!loading &&
          filteredExpenses.length > 0 && (
            <div className="expense-table-footer">
              <span>
                Showing{" "}
                <strong>
                  {filteredExpenses.length}
                </strong>{" "}
                expense
                {filteredExpenses.length !==
                  1
                  ? "s"
                  : ""}
              </span>

              <strong>
                Total:{" "}
                {formatCurrency(
                  statistics.total
                )}
              </strong>
            </div>
          )}
      </section>

      {selectedExpense && (
        <div
          className="expense-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setSelectedExpense(null);
            }
          }}
        >
          <div className="expense-modal">
            <div className="expense-modal-head">
              <div>
                <span>EXPENSE DETAILS</span>
                <h2>
                  {selectedExpense.title ||
                    "Expense"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedExpense(null)
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="expense-detail-amount">
              {formatCurrency(
                getExpenseAmount(
                  selectedExpense
                )
              )}
            </div>

            <div className="expense-detail-grid">
              <div>
                <span>Category</span>
                <strong>
                  {selectedExpense.category ||
                    "Other"}
                </strong>
              </div>

              <div>
                <span>Date</span>
                <strong>
                  {formatDate(
                    getExpenseDate(
                      selectedExpense
                    )
                  )}
                </strong>
              </div>

              <div>
                <span>Payment Method</span>
                <strong>
                  {selectedExpense.paymentMethod ||
                    "Cash"}
                </strong>
              </div>

              <div>
                <span>Vendor</span>
                <strong>
                  {selectedExpense.vendor ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>Added By</span>
                <strong>
                  {selectedExpense.addedByName ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>Created</span>
                <strong>
                  {formatDateTime(
                    selectedExpense.createdAt
                  )}
                </strong>
              </div>
            </div>

            {selectedExpense.description && (
              <div className="expense-detail-notes">
                <span>Description</span>
                <p>
                  {selectedExpense.description}
                </p>
              </div>
            )}

            {selectedExpense.notes && (
              <div className="expense-detail-notes">
                <span>Notes</span>
                <p>
                  {selectedExpense.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="expense-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setDeleteTarget(null);
            }
          }}
        >
          <div className="expense-delete-modal">
            <div className="delete-icon">
              <Trash2 size={22} />
            </div>

            <h2>Delete expense?</h2>

            <p>
              Are you sure you want to delete{" "}
              <strong>
                {deleteTarget.title ||
                  "this expense"}
              </strong>
              ?
              <br />
              This action cannot be undone.
            </p>

            <div className="delete-actions">
              <button
                type="button"
                onClick={() =>
                  setDeleteTarget(null)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting
                  ? "Deleting..."
                  : "Delete Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}