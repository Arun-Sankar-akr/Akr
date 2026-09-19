import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Download,
  Users,
  UserRound,
  Phone,
  IndianRupee,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  X,
  Save,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";
import { useAuth } from "../../../context/AuthContext";

import "./Customer.css";

export default function Customers() {
  const { user, profile } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [menuId, setMenuId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  /* ---------------- FETCH CUSTOMERS ---------------- */

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "customers"),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        data.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });

        setCustomers(data);
        setLoading(false);
      },
      (error) => {
        console.error("Customer listener error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* ---------------- SEARCH ---------------- */

  const filteredCustomers = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return customers;

    return customers.filter((customer) =>
      [
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
      ]
        .filter(Boolean)
        .some((field) =>
          String(field).toLowerCase().includes(value)
        )
    );
  }, [customers, search]);

  /* ---------------- STATS ---------------- */

  const totalCustomers = customers.length;

  const customersWithPhone = customers.filter(
    (customer) => customer.phone
  ).length;

  const totalSpending = customers.reduce(
    (sum, customer) => sum + Number(customer.totalSpent || 0),
    0
  );

  /* ---------------- FORM ---------------- */

  const resetForm = () => {
    setForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });

    setEditingCustomer(null);
  };

  const openAddForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (customer) => {
    setEditingCustomer(customer);

    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });

    setMenuId(null);
    setShowForm(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /* ---------------- SAVE ---------------- */

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      alert("Please enter customer name.");
      return;
    }

    if (!form.phone.trim()) {
      alert("Please enter customer phone number.");
      return;
    }

    try {
      setSaving(true);

      if (editingCustomer) {
        await updateDoc(
          doc(db, "customers", editingCustomer.id),
          {
            name: form.name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            address: form.address.trim(),
            notes: form.notes.trim(),
            updatedAt: serverTimestamp(),
          }
        );
      } else {
        await addDoc(collection(db, "customers"), {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          notes: form.notes.trim(),

          totalSpent: 0,
          transactionCount: 0,
          lastVisit: null,

          createdBy: user?.uid || "",
          createdByName:
            profile?.name ||
            user?.displayName ||
            "Admin",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error("Save customer error:", error);
      alert(error.message || "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- DELETE ---------------- */

  const handleDelete = async (customer) => {
    setMenuId(null);

    const confirmed = window.confirm(
      `Delete customer "${customer.name}"?\n\nThis will remove the customer profile.`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "customers", customer.id));
    } catch (error) {
      console.error("Delete customer error:", error);
      alert(error.message || "Unable to delete customer.");
    }
  };

  /* ---------------- EXPORT ---------------- */

  const exportCustomers = () => {
    if (!filteredCustomers.length) {
      alert("No customers available to export.");
      return;
    }

    const headers = [
      "Name",
      "Phone",
      "Email",
      "Address",
      "Total Spent",
      "Transactions",
    ];

    const rows = filteredCustomers.map((customer) => [
      customer.name || "",
      customer.phone || "",
      customer.email || "",
      customer.address || "",
      Number(customer.totalSpent || 0),
      Number(customer.transactionCount || 0),
    ]);

    const csv = [
      headers,
      ...rows,
    ]
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
    link.download = `customers-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    link.click();

    URL.revokeObjectURL(url);
  };

  /* ---------------- DETAILS ---------------- */

  const openDetails = (customer) => {
    setSelectedCustomer(customer);
    setMenuId(null);
  };

  return (
    <div className="customer-page">
      {/* HEADER */}

      <div className="page-head">
        <div>
          <div className="eyebrow">MANAGEMENT</div>

          <h1>Customers</h1>

          <p>
            Maintain customer contacts, spending and visit history.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={openAddForm}
        >
          <Plus size={17} />
          Add Customer
        </button>
      </div>

      {/* STATS */}

      <div className="customer-stats">
        <div className="customer-stat-card">
          <div className="customer-stat-icon">
            <Users size={19} />
          </div>

          <div>
            <span>Total Customers</span>
            <strong>{totalCustomers}</strong>
          </div>
        </div>

        <div className="customer-stat-card">
          <div className="customer-stat-icon">
            <Phone size={19} />
          </div>

          <div>
            <span>With Phone</span>
            <strong>{customersWithPhone}</strong>
          </div>
        </div>

        <div className="customer-stat-card">
          <div className="customer-stat-icon">
            <ShoppingBag size={19} />
          </div>

          <div>
            <span>Total Spending</span>
            <strong>{formatCurrency(totalSpending)}</strong>
          </div>
        </div>

        <div className="customer-stat-card">
          <div className="customer-stat-icon">
            <UserRound size={19} />
          </div>

          <div>
            <span>Showing</span>
            <strong>{filteredCustomers.length}</strong>
          </div>
        </div>
      </div>

      {/* MAIN PANEL */}

      <section className="panel customer-panel">
        <div className="toolbar">
          <div className="search-bar">
            <Search size={17} />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone or email..."
            />

            {search && (
              <button
                className="search-clear"
                onClick={() => setSearch("")}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="toolbar-actions">
            <button
              className="secondary-btn"
              onClick={exportCustomers}
            >
              <Download size={15} />
              Export
            </button>

            <button
              className="secondary-btn refresh-btn"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* TABLE */}

        {loading ? (
          <div className="customer-loading">
            <div className="loading-spinner" />
            <span>Loading customers...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="customer-empty">
            <div className="customer-empty-icon">
              <Users size={28} />
            </div>

            <h2>
              {search
                ? "No customers found"
                : "No customers yet"}
            </h2>

            <p>
              {search
                ? "Try another name, phone number or email."
                : "Add your first customer to start maintaining customer history."}
            </p>

            {!search && (
              <button
                className="primary-btn"
                onClick={openAddForm}
              >
                <Plus size={16} />
                Add Customer
              </button>
            )}
          </div>
        ) : (
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Visits</th>
                  <th>Total Spent</th>
                  <th>Last Visit</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="customer-name-cell">
                        <div className="customer-avatar">
                          {customer.name
                            ?.charAt(0)
                            ?.toUpperCase() || "C"}
                        </div>

                        <div>
                          <strong>
                            {customer.name || "Unnamed"}
                          </strong>

                          {customer.address && (
                            <small>{customer.address}</small>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="contact-text">
                        {customer.phone || "—"}
                      </span>
                    </td>

                    <td>
                      <span className="contact-text">
                        {customer.email || "—"}
                      </span>
                    </td>

                    <td>
                      <span className="count-pill">
                        {customer.transactionCount || 0}
                      </span>
                    </td>

                    <td>
                      <strong className="amount-text">
                        {formatCurrency(
                          Number(customer.totalSpent || 0)
                        )}
                      </strong>
                    </td>

                    <td>
                      <span className="date-text">
                        {formatDate(customer.lastVisit)}
                      </span>
                    </td>

                    <td>
                      <div className="customer-actions">
                        <button
                          className="icon-action"
                          title="View details"
                          onClick={() =>
                            openDetails(customer)
                          }
                        >
                          <Eye size={16} />
                        </button>

                        <div className="action-menu-wrap">
                          <button
                            className="icon-action"
                            onClick={() =>
                              setMenuId(
                                menuId === customer.id
                                  ? null
                                  : customer.id
                              )
                            }
                          >
                            <MoreVertical size={17} />
                          </button>

                          {menuId === customer.id && (
                            <div className="action-menu">
                              <button
                                onClick={() =>
                                  openEditForm(customer)
                                }
                              >
                                <Pencil size={15} />
                                Edit
                              </button>

                              <button
                                className="danger-menu"
                                onClick={() =>
                                  handleDelete(customer)
                                }
                              >
                                <Trash2 size={15} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-footer">
          <span>
            Showing {filteredCustomers.length} of{" "}
            {customers.length} customers
          </span>
        </div>
      </section>

      {/* ADD / EDIT MODAL */}

      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowForm(false)}
        >
          <div
            className="customer-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="modal-eyebrow">
                  CUSTOMER MANAGEMENT
                </span>

                <h2>
                  {editingCustomer
                    ? "Edit Customer"
                    : "Add Customer"}
                </h2>

                <p>
                  Save contact details for future visits.
                </p>
              </div>

              <button
                className="modal-close"
                onClick={() => setShowForm(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form
              className="customer-form"
              onSubmit={handleSubmit}
            >
              <div className="form-grid">
                <label>
                  <span>
                    Customer Name <b>*</b>
                  </span>

                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Enter customer name"
                    autoFocus
                  />
                </label>

                <label>
                  <span>
                    Phone Number <b>*</b>
                  </span>

                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="Enter phone number"
                    type="tel"
                  />
                </label>

                <label>
                  <span>Email</span>

                  <input
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="customer@example.com"
                    type="email"
                  />
                </label>

                <label>
                  <span>Address</span>

                  <input
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    placeholder="Customer address"
                  />
                </label>

                <label className="full-field">
                  <span>Notes</span>

                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    placeholder="Additional notes..."
                    rows="4"
                  />
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-btn"
                  disabled={saving}
                >
                  <Save size={16} />

                  {saving
                    ? "Saving..."
                    : editingCustomer
                      ? "Update Customer"
                      : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILS MODAL */}

      {selectedCustomer && (
        <CustomerDetailsModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onEdit={() => {
            setSelectedCustomer(null);
            openEditForm(selectedCustomer);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------- */
/* CUSTOMER DETAILS */
/* -------------------------------------------------- */

function CustomerDetailsModal({
  customer,
  onClose,
  onEdit,
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
    >
      <div
        className="customer-details-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="details-top">
          <div className="details-profile">
            <div className="details-avatar">
              {customer.name
                ?.charAt(0)
                ?.toUpperCase() || "C"}
            </div>

            <div>
              <span className="modal-eyebrow">
                CUSTOMER PROFILE
              </span>

              <h2>{customer.name || "Unnamed Customer"}</h2>

              <p>
                {customer.phone || "No phone number"}
              </p>
            </div>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="details-stats">
          <div>
            <span>Total Visits</span>
            <strong>
              {customer.transactionCount || 0}
            </strong>
          </div>

          <div>
            <span>Total Spent</span>
            <strong>
              {formatCurrency(
                Number(customer.totalSpent || 0)
              )}
            </strong>
          </div>

          <div>
            <span>Last Visit</span>
            <strong>
              {formatDate(customer.lastVisit)}
            </strong>
          </div>
        </div>

        <div className="details-information">
          <div className="information-item">
            <span>Phone</span>
            <strong>
              {customer.phone || "Not provided"}
            </strong>
          </div>

          <div className="information-item">
            <span>Email</span>
            <strong>
              {customer.email || "Not provided"}
            </strong>
          </div>

          <div className="information-item">
            <span>Address</span>
            <strong>
              {customer.address || "Not provided"}
            </strong>
          </div>

          <div className="information-item">
            <span>Notes</span>
            <strong>
              {customer.notes || "No notes"}
            </strong>
          </div>
        </div>

        <div className="details-actions">
          <button
            className="secondary-btn"
            onClick={onClose}
          >
            Close
          </button>

          <button
            className="primary-btn"
            onClick={onEdit}
          >
            <Pencil size={15} />
            Edit Customer
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/* DATE HELPER */
/* -------------------------------------------------- */

function formatDate(value) {
  if (!value) return "—";

  try {
    let date;

    if (value?.seconds) {
      date = new Date(value.seconds * 1000);
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}