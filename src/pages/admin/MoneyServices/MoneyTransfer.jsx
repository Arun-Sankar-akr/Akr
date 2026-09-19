import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Download,
  X,
  ArrowRightLeft,
  Eye,
  Trash2,
  IndianRupee,
  CheckCircle2,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";
import "./MoneyTransfer.css";

const auth = getAuth();

const emptyForm = {
  customerName: "",
  customerPhone: "",
  transferAmount: "",
  serviceCharge: "",
  transferType: "Money Transfer",
  referenceNumber: "",
  notes: "",
};

function money(value) {
  return Number(value || 0);
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "—";

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
}

function downloadCSV(rows) {
  const headers = [
    "Date",
    "Customer",
    "Phone",
    "Transfer Amount",
    "Service Charge",
    "Total Cash",
    "Transfer Type",
    "Reference",
    "Notes",
  ];

  const csvRows = rows.map((item) => [
    formatDate(item.createdAt),
    item.customerName || "",
    item.customerPhone || "",
    money(item.transferAmount),
    money(item.serviceCharge),
    money(item.transferAmount) + money(item.serviceCharge),
    item.transferType || "",
    item.referenceNumber || "",
    item.notes || "",
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
  link.download = `money-transfers-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  link.click();
  URL.revokeObjectURL(url);
}

export default function MoneyTransfer() {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribeSnapshot = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (!currentUser) {
        setRecords([]);
        setLoading(false);
        setError("Please login to access money transfers.");
        return;
      }

      const q = query(
        collection(db, "moneyTransfers"),
        where("attendantId", "==", currentUser.uid)
      );

      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs
            .map((item) => ({
              id: item.id,
              ...item.data(),
            }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || 0;
              return bTime - aTime;
            });

          setRecords(data);
          setLoading(false);
        },
        (err) => {
          console.error(err);
          setError("Unable to load money transfer records.");
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return records;

    return records.filter((item) =>
      [
        item.customerName,
        item.customerPhone,
        item.transferType,
        item.referenceNumber,
        item.notes,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(term)
        )
    );
  }, [records, search]);

  const totalTransfer = useMemo(
    () =>
      filteredRecords.reduce(
        (sum, item) => sum + money(item.transferAmount),
        0
      ),
    [filteredRecords]
  );

  const totalCharge = useMemo(
    () =>
      filteredRecords.reduce(
        (sum, item) => sum + money(item.serviceCharge),
        0
      ),
    [filteredRecords]
  );

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const openModal = () => {
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setError("Please login again.");
      return;
    }

    const transferAmount = money(form.transferAmount);
    const serviceCharge = money(form.serviceCharge);

    if (transferAmount <= 0) {
      setError("Transfer amount must be greater than ₹0.");
      return;
    }

    if (serviceCharge < 0) {
      setError("Service charge cannot be negative.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      await addDoc(collection(db, "moneyTransfers"), {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        transferAmount,
        serviceCharge,
        totalCash: transferAmount + serviceCharge,
        transferType: form.transferType,
        referenceNumber: form.referenceNumber.trim(),
        notes: form.notes.trim(),

        attendantId: currentUser.uid,
        attendantName:
          currentUser.displayName ||
          currentUser.email ||
          "Attendant",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShowModal(false);
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      setError(
        err?.code === "permission-denied"
          ? "You do not have permission to add this transfer."
          : "Failed to save money transfer."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    const confirmed = window.confirm(
      `Delete money transfer for ${item.customerName || "this customer"
      }?`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "moneyTransfers", item.id));
    } catch (err) {
      console.error(err);
      alert(
        "This record could not be deleted. Only administrators can delete records."
      );
    }
  };

  return (
    <div className="money-page">
      <div className="page-head money-page-head">
        <div>
          <div className="eyebrow">MANAGEMENT</div>

          <h1>Money Transfer</h1>

          <p>
            Record transfer principal separately from shop
            service income.
          </p>
        </div>

        <button className="primary-btn" onClick={openModal}>
          <Plus size={17} />
          Add transfer
        </button>
      </div>

      {error && !showModal && (
        <div className="money-alert error">
          {error}
        </div>
      )}

      <div className="money-stat-grid">
        <div className="money-stat-card">
          <div className="money-stat-icon blue">
            <ArrowRightLeft size={19} />
          </div>

          <div>
            <span>Total Transfers</span>
            <strong>{filteredRecords.length}</strong>
          </div>
        </div>

        <div className="money-stat-card">
          <div className="money-stat-icon purple">
            <IndianRupee size={19} />
          </div>

          <div>
            <span>Transfer Principal</span>
            <strong>{formatCurrency(totalTransfer)}</strong>
          </div>
        </div>

        <div className="money-stat-card">
          <div className="money-stat-icon green">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <span>Service Income</span>
            <strong>{formatCurrency(totalCharge)}</strong>
          </div>
        </div>
      </div>

      <section className="money-panel">
        <div className="money-toolbar">
          <div className="money-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, phone, reference..."
            />
          </div>

          <button
            className="secondary-btn"
            onClick={() => downloadCSV(filteredRecords)}
            disabled={!filteredRecords.length}
          >
            <Download size={15} />
            Export
          </button>
        </div>

        <div className="money-table-wrap">
          {loading ? (
            <div className="money-empty">
              <div className="money-loader" />
              <h3>Loading transfers...</h3>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="money-empty">
              <div className="money-empty-icon">
                <ArrowRightLeft size={24} />
              </div>

              <h3>No money transfers found</h3>

              <p>
                Add your first transfer transaction to start
                tracking service income.
              </p>

              <button className="primary-btn" onClick={openModal}>
                <Plus size={16} />
                Add transfer
              </button>
            </div>
          ) : (
            <table className="money-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Transfer</th>
                  <th>Service Charge</th>
                  <th>Total Cash</th>
                  <th>Reference</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="table-date">
                        {formatDate(item.createdAt)}
                      </span>
                    </td>

                    <td>
                      <div className="customer-cell">
                        <div className="customer-avatar">
                          {(item.customerName || "C")
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>
                            {item.customerName || "Walk-in Customer"}
                          </strong>

                          <span>
                            {item.customerPhone || "No phone"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(item.transferAmount)}
                      </strong>
                    </td>

                    <td>
                      <span className="income-text">
                        +{formatCurrency(item.serviceCharge)}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(
                          money(item.transferAmount) +
                          money(item.serviceCharge)
                        )}
                      </strong>
                    </td>

                    <td>
                      <span className="reference-pill">
                        {item.referenceNumber || "—"}
                      </span>
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-btn"
                          title="View"
                          onClick={() => setSelected(item)}
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          className="icon-btn danger"
                          title="Delete"
                          onClick={() => handleDelete(item)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {showModal && (
        <div
          className="cash-modal-backdrop"
          onMouseDown={() => !saving && setShowModal(false)}
        >
          <div
            className="cash-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cash-modal-head">
              <div>
                <span>NEW TRANSACTION</span>
                <h2>Money Transfer</h2>
              </div>

              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-section-title">
                Customer details
              </div>

              <div className="form-grid">
                <label>
                  Customer Name
                  <input
                    value={form.customerName}
                    onChange={(e) =>
                      updateField("customerName", e.target.value)
                    }
                    placeholder="Enter customer name"
                  />
                </label>

                <label>
                  Phone Number
                  <input
                    value={form.customerPhone}
                    onChange={(e) =>
                      updateField("customerPhone", e.target.value)
                    }
                    placeholder="Enter phone number"
                    inputMode="numeric"
                  />
                </label>
              </div>

              <div className="form-section-title">
                Transfer details
              </div>

              <div className="form-grid">
                <label>
                  Transfer Amount *
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.transferAmount}
                    onChange={(e) =>
                      updateField("transferAmount", e.target.value)
                    }
                    placeholder="0.00"
                    required
                  />
                </label>

                <label>
                  Service Charge *
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.serviceCharge}
                    onChange={(e) =>
                      updateField("serviceCharge", e.target.value)
                    }
                    placeholder="0.00"
                    required
                  />
                </label>

                <label>
                  Transfer Type
                  <select
                    value={form.transferType}
                    onChange={(e) =>
                      updateField("transferType", e.target.value)
                    }
                  >
                    <option>Money Transfer</option>
                    <option>Domestic Transfer</option>
                    <option>Bank Transfer</option>
                    <option>Other</option>
                  </select>
                </label>

                <label>
                  Reference Number
                  <input
                    value={form.referenceNumber}
                    onChange={(e) =>
                      updateField(
                        "referenceNumber",
                        e.target.value
                      )
                    }
                    placeholder="Transaction reference"
                  />
                </label>
              </div>

              <label className="full-field">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    updateField("notes", e.target.value)
                  }
                  placeholder="Optional notes..."
                  rows="3"
                />
              </label>

              <div className="total-preview">
                <span>Total cash received</span>
                <strong>
                  {formatCurrency(
                    money(form.transferAmount) +
                    money(form.serviceCharge)
                  )}
                </strong>
              </div>

              {error && (
                <div className="money-alert error">{error}</div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-btn"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="cash-modal-backdrop"
          onMouseDown={() => setSelected(null)}
        >
          <div
            className="cash-modal detail-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cash-modal-head">
              <div>
                <span>TRANSFER DETAILS</span>
                <h2>{selected.customerName || "Customer"}</h2>
              </div>

              <button
                className="modal-close"
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="detail-grid">
              <div>
                <span>Date</span>
                <strong>
                  {formatDateTime(selected.createdAt)}
                </strong>
              </div>

              <div>
                <span>Phone</span>
                <strong>
                  {selected.customerPhone || "—"}
                </strong>
              </div>

              <div>
                <span>Transfer amount</span>
                <strong>
                  {formatCurrency(selected.transferAmount)}
                </strong>
              </div>

              <div>
                <span>Service charge</span>
                <strong className="income-text">
                  {formatCurrency(selected.serviceCharge)}
                </strong>
              </div>

              <div>
                <span>Total cash</span>
                <strong>
                  {formatCurrency(
                    money(selected.transferAmount) +
                    money(selected.serviceCharge)
                  )}
                </strong>
              </div>

              <div>
                <span>Reference</span>
                <strong>
                  {selected.referenceNumber || "—"}
                </strong>
              </div>
            </div>

            {selected.notes && (
              <div className="detail-note">
                <span>Notes</span>
                <p>{selected.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}