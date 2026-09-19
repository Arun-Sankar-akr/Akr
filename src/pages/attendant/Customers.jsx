import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Download,
  X,
  UserPlus,
  User,
  Phone,
  Mail,
  MapPin,
  Edit3,
  Trash2,
  Users,
  IndianRupee,
  Activity,
  CheckCircle2,
  MoreVertical,
} from "lucide-react";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  getDoc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { db, auth } from "../../services/firebase";
import { formatCurrency } from "../../utils/currency";

import "./Customers.css";

export default function Customers() {
  const [search, setSearch] = useState("");

  const [customers, setCustomers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);

  const [saving, setSaving] = useState(false);

  const [menuId, setMenuId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    address: "",
  });

  /* =========================================================
     AUTH + ROLE
  ========================================================= */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setUserRole("");
        return;
      }

      try {
        const userSnap = await getDoc(
          doc(db, "users", currentUser.uid)
        );

        if (userSnap.exists()) {
          setUserRole(userSnap.data()?.role || "");
        }
      } catch (err) {
        console.error("Unable to load user profile:", err);
      }
    });

    return () => unsubscribe();
  }, []);

  /* =========================================================
     LOAD CUSTOMERS
  ========================================================= */

  useEffect(() => {
    if (!user?.uid || !userRole) {
      setCustomers([]);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError("");

    const customersRef = collection(db, "customers");

    let customersQuery;

    /*
      ADMIN
      -----
      Admin can see every customer.
    */
    if (userRole === "admin") {
      customersQuery = customersRef;
    }

    /*
      ATTENDANT
      ---------
      Attendant sees customers created/managed by them.
    */
    else if (userRole === "attendant") {
      customersQuery = query(
        customersRef,
        where("createdBy", "==", user.uid)
      );
    } else {
      setCustomers([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      customersQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        data.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;

          return bTime - aTime;
        });

        setCustomers(data);
        setLoading(false);
      },
      (err) => {
        console.error("Customer listener error:", err);

        setError(
          err?.code === "permission-denied"
            ? "You do not have permission to view customers."
            : "Unable to load customers."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, userRole]);

  /* =========================================================
     FORM
  ========================================================= */

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setForm({
      name: "",
      mobile: "",
      email: "",
      address: "",
    });

    setEditingCustomer(null);
  };

  /* =========================================================
     OPEN ADD
  ========================================================= */

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  /* =========================================================
     OPEN EDIT
  ========================================================= */

  const openEditModal = (customer) => {
    setEditingCustomer(customer);

    setForm({
      name: customer.name || "",
      mobile: customer.mobile || "",
      email: customer.email || "",
      address: customer.address || "",
    });

    setMenuId(null);
    setShowModal(true);
  };

  /* =========================================================
     SAVE CUSTOMER
  ========================================================= */

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      alert("Please login again.");
      return;
    }

    if (!form.name.trim()) {
      alert("Please enter customer name.");
      return;
    }

    if (!form.mobile.trim()) {
      alert("Please enter mobile number.");
      return;
    }

    if (form.mobile.trim().length < 10) {
      alert("Please enter a valid mobile number.");
      return;
    }

    setSaving(true);

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("User session expired.");
      }

      /* =========================
         EDIT
      ========================= */

      if (editingCustomer) {
        await updateDoc(
          doc(db, "customers", editingCustomer.id),
          {
            name: form.name.trim(),
            mobile: form.mobile.trim(),
            email: form.email.trim(),
            address: form.address.trim(),
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid,
          }
        );

        alert("Customer updated successfully.");
      }

      /* =========================
         CREATE
      ========================= */

      else {
        await addDoc(collection(db, "customers"), {
          name: form.name.trim(),
          mobile: form.mobile.trim(),
          email: form.email.trim(),
          address: form.address.trim(),

          createdBy: currentUser.uid,

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          status: "active",

          transactionCount: 0,
          totalTransactionAmount: 0,
        });

        alert("Customer added successfully.");
      }

      resetForm();
      setShowModal(false);
    } catch (err) {
      console.error("Customer save error:", err);

      if (err?.code === "permission-denied") {
        alert(
          "Permission denied. Please check your Firestore rules."
        );
      } else {
        alert("Unable to save customer.");
      }
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     DELETE
  ========================================================= */

  const handleDelete = async (customer) => {
    setMenuId(null);

    const confirmed = window.confirm(
      `Delete customer "${customer.name}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(
        doc(db, "customers", customer.id)
      );

      alert("Customer deleted successfully.");
    } catch (err) {
      console.error("Delete customer error:", err);

      if (err?.code === "permission-denied") {
        alert(
          "Only an administrator can delete customers."
        );
      } else {
        alert("Unable to delete customer.");
      }
    }
  };

  /* =========================================================
     SEARCH
  ========================================================= */

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return customers;

    return customers.filter((customer) => {
      return (
        customer.name?.toLowerCase().includes(keyword) ||
        customer.mobile?.toLowerCase().includes(keyword) ||
        customer.email?.toLowerCase().includes(keyword) ||
        customer.address?.toLowerCase().includes(keyword)
      );
    });
  }, [customers, search]);

  /* =========================================================
     STATISTICS
  ========================================================= */

  const totalCustomers = customers.length;

  const activeCustomers = customers.filter(
    (customer) => customer.status !== "inactive"
  ).length;

  const totalTransactions = customers.reduce(
    (sum, customer) =>
      sum + Number(customer.transactionCount || 0),
    0
  );

  const totalTransactionAmount = customers.reduce(
    (sum, customer) =>
      sum + Number(customer.totalTransactionAmount || 0),
    0
  );

  /* =========================================================
     EXPORT CSV
  ========================================================= */

  const exportCSV = () => {
    if (!filteredCustomers.length) {
      alert("No customers to export.");
      return;
    }

    const headers = [
      "Name",
      "Mobile",
      "Email",
      "Address",
      "Status",
      "Transactions",
      "Total Amount",
    ];

    const rows = filteredCustomers.map((customer) => [
      customer.name || "",
      customer.mobile || "",
      customer.email || "",
      customer.address || "",
      customer.status || "active",
      customer.transactionCount || 0,
      customer.totalTransactionAmount || 0,
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

    link.download = `customers-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  /* =========================================================
     DATE
  ========================================================= */

  const formatDate = (timestamp) => {
    if (!timestamp?.seconds) {
      return "Recently";
    }

    return new Date(
      timestamp.seconds * 1000
    ).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="customers-page">

      {/* HEADER */}

      <div className="page-head">

        <div>
          <div className="eyebrow">
            MANAGEMENT
          </div>

          <h1>Customers</h1>

          <p>
            Find and maintain customer contact details.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={openAddModal}
        >
          <Plus size={16} />
          Add new
        </button>

      </div>

      {/* STATS */}

      <div className="customer-stats">

        <div className="customer-stat-card">

          <div className="customer-stat-icon blue">
            <Users size={19} />
          </div>

          <div>
            <span>Total Customers</span>
            <strong>{totalCustomers}</strong>
          </div>

        </div>

        <div className="customer-stat-card">

          <div className="customer-stat-icon green">
            <CheckCircle2 size={19} />
          </div>

          <div>
            <span>Active Customers</span>
            <strong>{activeCustomers}</strong>
          </div>

        </div>

        <div className="customer-stat-card">

          <div className="customer-stat-icon purple">
            <Activity size={19} />
          </div>

          <div>
            <span>Total Transactions</span>
            <strong>{totalTransactions}</strong>
          </div>

        </div>

        <div className="customer-stat-card">

          <div className="customer-stat-icon orange">
            <IndianRupee size={19} />
          </div>

          <div>
            <span>Transaction Value</span>
            <strong>
              {formatCurrency(totalTransactionAmount)}
            </strong>
          </div>

        </div>

      </div>

      {/* MAIN PANEL */}

      <section className="panel">

        <div className="panel-header">

          <div>
            <div className="section-label">
              CUSTOMER DIRECTORY
            </div>

            <h2>Customer records</h2>
          </div>

        </div>

        {/* TOOLBAR */}

        <div className="toolbar">

          <div className="search-bar">

            <Search size={16} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search customers..."
            />

          </div>

          <div className="toolbar-right">

            <span className="result-count">
              {filteredCustomers.length} customers
            </span>

            <button
              className="secondary-btn"
              onClick={exportCSV}
            >
              <Download size={15} />
              Export
            </button>

          </div>

        </div>

        {/* ERROR */}

        {error && (
          <div className="module-state error">

            <div className="module-icon">
              !
            </div>

            <h3>{error}</h3>

            <p>
              Check your Firestore permissions
              and signed-in user role.
            </p>

          </div>
        )}

        {/* LOADING */}

        {loading && !error && (
          <div className="module-state">

            <div className="module-icon customer-loading">
              <Users size={22} />
            </div>

            <h3>Loading customers...</h3>

            <p>
              Getting the latest customer records.
            </p>

          </div>
        )}

        {/* EMPTY */}

        {!loading &&
          !error &&
          filteredCustomers.length === 0 && (

            <div className="empty-module">

              <div className="module-icon">
                <Users size={24} />
              </div>

              <h2>
                {search
                  ? "No customers found"
                  : "No customers yet"}
              </h2>

              <p>
                {search
                  ? "Try another name, mobile number or email."
                  : "Add your first customer to start building your customer directory."}
              </p>

              {!search && (
                <button
                  className="primary-btn"
                  onClick={openAddModal}
                >
                  <Plus size={16} />
                  Add customer
                </button>
              )}

            </div>
          )}

        {/* CUSTOMER TABLE */}

        {!loading &&
          !error &&
          filteredCustomers.length > 0 && (

            <div className="customer-table-wrap">

              <table className="customer-table">

                <thead>

                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Address</th>
                    <th>Transactions</th>
                    <th>Total Value</th>
                    <th>Status</th>
                    <th>Added</th>
                    <th></th>
                  </tr>

                </thead>

                <tbody>

                  {filteredCustomers.map((customer) => (

                    <tr key={customer.id}>

                      {/* CUSTOMER */}

                      <td>

                        <div className="customer-main">

                          <div className="customer-avatar">

                            {customer.name
                              ?.charAt(0)
                              ?.toUpperCase() || "C"}

                          </div>

                          <div>

                            <strong>
                              {customer.name ||
                                "Unnamed Customer"}
                            </strong>

                            <small>
                              Customer ID:{" "}
                              {customer.id.slice(0, 8)}
                            </small>

                          </div>

                        </div>

                      </td>

                      {/* CONTACT */}

                      <td>

                        <div className="contact-details">

                          {customer.mobile && (
                            <span>
                              <Phone size={12} />
                              {customer.mobile}
                            </span>
                          )}

                          {customer.email && (
                            <span>
                              <Mail size={12} />
                              {customer.email}
                            </span>
                          )}

                          {!customer.mobile &&
                            !customer.email && (
                              <span className="muted">
                                No contact details
                              </span>
                            )}

                        </div>

                      </td>

                      {/* ADDRESS */}

                      <td>

                        <div className="address-cell">

                          {customer.address ? (
                            <>
                              <MapPin size={12} />

                              <span>
                                {customer.address}
                              </span>
                            </>
                          ) : (
                            <span className="muted">
                              Not provided
                            </span>
                          )}

                        </div>

                      </td>

                      {/* TRANSACTIONS */}

                      <td>

                        <span className="transaction-count">
                          {customer.transactionCount || 0}
                        </span>

                      </td>

                      {/* TOTAL */}

                      <td>

                        <strong className="customer-total">
                          {formatCurrency(
                            customer.totalTransactionAmount ||
                            0
                          )}
                        </strong>

                      </td>

                      {/* STATUS */}

                      <td>

                        <span
                          className={`customer-status ${customer.status ===
                            "inactive"
                            ? "inactive"
                            : ""
                            }`}
                        >

                          <span className="status-dot" />

                          {customer.status ||
                            "active"}

                        </span>

                      </td>

                      {/* DATE */}

                      <td>

                        <span className="customer-date">
                          {formatDate(
                            customer.createdAt
                          )}
                        </span>

                      </td>

                      {/* ACTION */}

                      <td>

                        <div className="customer-actions">

                          <button
                            className="icon-btn"
                            onClick={() =>
                              setMenuId(
                                menuId ===
                                  customer.id
                                  ? null
                                  : customer.id
                              )
                            }
                          >
                            <MoreVertical size={16} />
                          </button>

                          {menuId === customer.id && (

                            <div className="action-menu">

                              <button
                                onClick={() =>
                                  openEditModal(
                                    customer
                                  )
                                }
                              >
                                <Edit3 size={14} />
                                Edit
                              </button>

                              <button
                                className="delete-action"
                                onClick={() =>
                                  handleDelete(
                                    customer
                                  )
                                }
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>

                            </div>

                          )}

                        </div>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

      </section>

      {/* =====================================================
          ADD / EDIT CUSTOMER MODAL
      ===================================================== */}

      {showModal && (

        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget
            ) {
              setShowModal(false);
            }
          }}
        >

          <div className="customer-modal">

            {/* HEADER */}

            <div className="modal-header">

              <div className="modal-title">

                <div className="modal-icon">
                  {editingCustomer ? (
                    <Edit3 size={19} />
                  ) : (
                    <UserPlus size={19} />
                  )}
                </div>

                <div>

                  <h2>
                    {editingCustomer
                      ? "Edit Customer"
                      : "Add Customer"}
                  </h2>

                  <p>
                    {editingCustomer
                      ? "Update customer contact information."
                      : "Create a new customer profile."}
                  </p>

                </div>

              </div>

              <button
                className="modal-close"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                <X size={18} />
              </button>

            </div>

            {/* FORM */}

            <form onSubmit={handleSubmit}>

              <div className="customer-form-grid">

                {/* NAME */}

                <div className="customer-field full">

                  <label>
                    Customer Name
                  </label>

                  <div className="customer-input-wrap">

                    <User size={15} />

                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Enter customer name"
                      autoFocus
                    />

                  </div>

                </div>

                {/* MOBILE */}

                <div className="customer-field">

                  <label>
                    Mobile Number
                  </label>

                  <div className="customer-input-wrap">

                    <Phone size={15} />

                    <input
                      name="mobile"
                      value={form.mobile}
                      onChange={handleChange}
                      placeholder="Enter mobile number"
                      inputMode="numeric"
                    />

                  </div>

                </div>

                {/* EMAIL */}

                <div className="customer-field">

                  <label>
                    Email Address
                  </label>

                  <div className="customer-input-wrap">

                    <Mail size={15} />

                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="customer@email.com"
                    />

                  </div>

                </div>

                {/* ADDRESS */}

                <div className="customer-field full">

                  <label>
                    Address
                  </label>

                  <div className="customer-input-wrap textarea-wrap">

                    <MapPin size={15} />

                    <textarea
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      placeholder="Enter customer address"
                      rows="3"
                    />

                  </div>

                </div>

              </div>

              {/* ACTIONS */}

              <div className="modal-actions">

                <button
                  type="button"
                  className="cancel-btn"
                  disabled={saving}
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="save-btn"
                  disabled={saving}
                >

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

    </div>
  );
}