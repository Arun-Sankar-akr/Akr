import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  Save,
  Receipt,
  CalendarDays,
  WalletCards,
  FileText,
  UserRound,
  Building2,
  Tag,
} from "lucide-react";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
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

function getToday() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function getQueryParameter(name) {
  const searchParams = new URLSearchParams(
    window.location.search
  );

  return searchParams.get(name);
}

export default function AddExpense() {
  const { user, profile } = useAuth();

  const expenseId = getQueryParameter("id");
  const isEditMode = Boolean(expenseId);

  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "Other",
    paymentMethod: "Cash",
    expenseDate: getToday(),
    vendor: "",
    description: "",
    notes: "",
  });

  const [loading, setLoading] = useState(
    isEditMode
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!expenseId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadExpense = async () => {
      try {
        setLoading(true);
        setError("");

        const expenseRef = doc(
          db,
          "expenses",
          expenseId
        );

        const snapshot = await getDoc(
          expenseRef
        );

        if (!snapshot.exists()) {
          throw new Error(
            "Expense record was not found."
          );
        }

        const data = snapshot.data();

        let expenseDate =
          data.expenseDate ||
          data.date ||
          getToday();

        if (
          typeof expenseDate?.toDate ===
          "function"
        ) {
          expenseDate = expenseDate
            .toDate()
            .toISOString()
            .slice(0, 10);
        } else if (
          typeof expenseDate === "string"
        ) {
          expenseDate =
            expenseDate.slice(0, 10);
        }

        if (mounted) {
          setForm({
            title: data.title || "",
            amount:
              data.amount ??
              data.expenseAmount ??
              "",
            category:
              data.category || "Other",
            paymentMethod:
              data.paymentMethod ||
              "Cash",
            expenseDate,
            vendor: data.vendor || "",
            description:
              data.description || "",
            notes: data.notes || "",
          });
        }
      } catch (loadError) {
        console.error(
          "Load expense error:",
          loadError
        );

        if (mounted) {
          setError(
            loadError?.message ||
            "Unable to load expense."
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadExpense();

    return () => {
      mounted = false;
    };
  }, [expenseId]);

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const validate = () => {
    if (!form.title.trim()) {
      return "Please enter an expense title.";
    }

    const amount = Number(form.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return "Please enter a valid expense amount.";
    }

    if (!form.category) {
      return "Please select an expense category.";
    }

    if (!form.expenseDate) {
      return "Please select the expense date.";
    }

    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!user?.uid) {
      setError(
        "You must be logged in to add an expense."
      );
      return;
    }

    if (
      profile?.role !== "admin" &&
      !isEditMode
    ) {
      setError(
        "Only an administrator can create expenses."
      );
      return;
    }

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError("");

      const expenseData = {
        title: form.title.trim(),
        amount: Number(form.amount),
        expenseAmount: Number(form.amount),

        category: form.category,

        paymentMethod:
          form.paymentMethod || "Cash",

        expenseDate: form.expenseDate,

        vendor: form.vendor.trim(),

        description:
          form.description.trim(),

        notes: form.notes.trim(),
      };

      if (isEditMode) {
        await updateDoc(
          doc(
            db,
            "expenses",
            expenseId
          ),
          {
            ...expenseData,
            updatedAt:
              serverTimestamp(),
            updatedBy:
              user.uid,
            updatedByName:
              profile?.name ||
              profile?.displayName ||
              user.displayName ||
              user.email ||
              "Admin",
          }
        );

        alert(
          "Expense updated successfully."
        );
      } else {
        await addDoc(
          collection(db, "expenses"),
          {
            ...expenseData,

            createdAt:
              serverTimestamp(),

            createdBy:
              user.uid,

            createdByName:
              profile?.name ||
              profile?.displayName ||
              user.displayName ||
              user.email ||
              "Admin",

            addedByName:
              profile?.name ||
              profile?.displayName ||
              user.displayName ||
              user.email ||
              "Admin",

            status: "active",
          }
        );

        alert(
          "Expense added successfully."
        );
      }

      window.location.hash =
        "#/admin/expenses";
    } catch (saveError) {
      console.error(
        "Save expense error:",
        saveError
      );

      setError(
        saveError?.message ||
        "Unable to save expense."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="expenses-page">
        <div className="expense-loading-page">
          <div className="expense-loading-spinner" />
          <strong>
            Loading expense...
          </strong>
          <span>
            Please wait a moment.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="expenses-page add-expense-page">
      <div className="expense-page-head">
        <div>
          <div className="expense-eyebrow">
            MANAGEMENT
          </div>

          <h1>
            {isEditMode
              ? "Edit Expense"
              : "Add Expense"}
          </h1>

          <p>
            Record rent, electricity, paper,
            toner, salary and other shop
            operating expenses.
          </p>
        </div>

        <a
          href="#/admin/expenses"
          className="expense-back-btn"
        >
          <ArrowLeft size={17} />
          Back to Expenses
        </a>
      </div>

      {error && (
        <div className="expense-form-error">
          {error}
        </div>
      )}

      <div className="add-expense-layout">
        <form
          className="expense-form-panel"
          onSubmit={handleSubmit}
        >
          <div className="expense-form-header">
            <div className="expense-form-header-icon">
              <Receipt size={21} />
            </div>

            <div>
              <h2>
                Expense Information
              </h2>

              <p>
                Enter the details of this
                business expense.
              </p>
            </div>
          </div>

          <div className="expense-form-grid">
            <div className="expense-field full">
              <label>
                Expense Title
                <span>*</span>
              </label>

              <div className="expense-input-wrap">
                <Receipt size={17} />

                <input
                  value={form.title}
                  onChange={(event) =>
                    updateField(
                      "title",
                      event.target.value
                    )
                  }
                  placeholder="e.g. Monthly shop rent"
                />
              </div>
            </div>

            <div className="expense-field">
              <label>
                Amount
                <span>*</span>
              </label>

              <div className="expense-input-wrap amount">
                <span className="currency-symbol">
                  ₹
                </span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) =>
                    updateField(
                      "amount",
                      event.target.value
                    )
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="expense-field">
              <label>
                Expense Date
                <span>*</span>
              </label>

              <div className="expense-input-wrap">
                <CalendarDays size={17} />

                <input
                  type="date"
                  value={
                    form.expenseDate
                  }
                  onChange={(event) =>
                    updateField(
                      "expenseDate",
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            <div className="expense-field">
              <label>
                Category
                <span>*</span>
              </label>

              <div className="expense-input-wrap">
                <Tag size={17} />

                <select
                  value={form.category}
                  onChange={(event) =>
                    updateField(
                      "category",
                      event.target.value
                    )
                  }
                >
                  {EXPENSE_CATEGORIES.map(
                    (category) => (
                      <option
                        key={category}
                        value={category}
                      >
                        {category}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="expense-field">
              <label>
                Payment Method
              </label>

              <div className="expense-input-wrap">
                <WalletCards size={17} />

                <select
                  value={
                    form.paymentMethod
                  }
                  onChange={(event) =>
                    updateField(
                      "paymentMethod",
                      event.target.value
                    )
                  }
                >
                  {PAYMENT_METHODS.map(
                    (method) => (
                      <option
                        key={method}
                        value={method}
                      >
                        {method}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>

            <div className="expense-field full">
              <label>
                Vendor / Paid To
              </label>

              <div className="expense-input-wrap">
                <Building2 size={17} />

                <input
                  value={form.vendor}
                  onChange={(event) =>
                    updateField(
                      "vendor",
                      event.target.value
                    )
                  }
                  placeholder="e.g. EB Office, landlord, supplier"
                />
              </div>
            </div>

            <div className="expense-field full">
              <label>
                Description
              </label>

              <div className="expense-textarea-wrap">
                <FileText size={17} />

                <textarea
                  value={
                    form.description
                  }
                  onChange={(event) =>
                    updateField(
                      "description",
                      event.target.value
                    )
                  }
                  placeholder="Describe what this expense was for..."
                  rows="4"
                />
              </div>
            </div>

            <div className="expense-field full">
              <label>
                Notes
              </label>

              <textarea
                className="expense-plain-textarea"
                value={form.notes}
                onChange={(event) =>
                  updateField(
                    "notes",
                    event.target.value
                  )
                }
                placeholder="Optional internal notes..."
                rows="3"
              />
            </div>
          </div>

          <div className="expense-form-footer">
            <a
              href="#/admin/expenses"
              className="expense-cancel-btn"
            >
              Cancel
            </a>

            <button
              type="submit"
              className="expense-save-btn"
              disabled={saving}
            >
              <Save size={17} />

              {saving
                ? "Saving..."
                : isEditMode
                  ? "Update Expense"
                  : "Save Expense"}
            </button>
          </div>
        </form>

        <aside className="expense-preview-panel">
          <div className="preview-top">
            <div className="preview-icon">
              <Receipt size={22} />
            </div>

            <span>
              EXPENSE PREVIEW
            </span>
          </div>

          <div className="preview-amount">
            {formatCurrency(
              Number(form.amount) || 0
            )}
          </div>

          <div className="preview-title">
            {form.title ||
              "Untitled Expense"}
          </div>

          <div className="preview-details">
            <div>
              <Tag size={15} />
              <span>
                {form.category ||
                  "Other"}
              </span>
            </div>

            <div>
              <CalendarDays size={15} />
              <span>
                {form.expenseDate ||
                  getToday()}
              </span>
            </div>

            <div>
              <WalletCards size={15} />
              <span>
                {form.paymentMethod ||
                  "Cash"}
              </span>
            </div>

            {form.vendor && (
              <div>
                <Building2 size={15} />
                <span>
                  {form.vendor}
                </span>
              </div>
            )}
          </div>

          <div className="preview-divider" />

          <div className="preview-user">
            <UserRound size={16} />

            <div>
              <span>Recorded by</span>
              <strong>
                {profile?.name ||
                  profile?.displayName ||
                  user?.displayName ||
                  user?.email ||
                  "Current user"}
              </strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}