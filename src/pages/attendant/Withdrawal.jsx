import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Download,
  X,
  Wallet,
  Users,
  IndianRupee,
  TrendingUp,
  Banknote,
  Smartphone,
  CreditCard,
  User,
  Phone,
  CircleDollarSign,
  CheckCircle2,
} from "lucide-react";

import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  getDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import "./Withdrawal.css"

import { onAuthStateChanged } from "firebase/auth";

import { db, auth } from "../../services/firebase";
import { formatCurrency } from "../../utils/currency";

export default function Withdrawal() {
  const [search, setSearch] = useState("");

  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState("");

  const [form, setForm] = useState({
    customerName: "",
    mobile: "",
    withdrawalAmount: "",
    serviceCharge: "",
    paymentMethod: "cash",
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
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setUserRole(userSnap.data()?.role || "");
        } else {
          setUserRole("");
        }
      } catch (err) {
        console.error("Unable to load user profile:", err);
        setUserRole("");
      }
    });

    return () => unsubscribe();
  }, []);

  /* =========================================================
     LOAD WITHDRAWALS
  ========================================================= */

  useEffect(() => {
    if (!user?.uid || !userRole) {
      setWithdrawals([]);
      setLoading(true);
      return;
    }

    setLoading(true);
    setError("");

    const withdrawalsRef = collection(db, "withdrawals");

    let withdrawalQuery;

    /*
      ADMIN
      -----
      Admin can read all withdrawal records.
    */
    if (userRole === "admin") {
      withdrawalQuery = withdrawalsRef;
    }

    /*
      ATTENDANT
      ---------
      Attendant can only read their own records.
    */
    else if (userRole === "attendant") {
      withdrawalQuery = query(
        withdrawalsRef,
        where("attendantId", "==", user.uid)
      );
    } else {
      setWithdrawals([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      withdrawalQuery,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        /*
          Sort locally.
          This avoids needing a Firestore composite/index query.
        */
        data.sort((a, b) => {
          const aTime = a.createdAt?.seconds
            ? a.createdAt.seconds
            : 0;

          const bTime = b.createdAt?.seconds
            ? b.createdAt.seconds
            : 0;

          return bTime - aTime;
        });

        setWithdrawals(data);
        setLoading(false);
      },
      (err) => {
        console.error("Withdrawal listener error:", err);

        setError(
          err?.code === "permission-denied"
            ? "You do not have permission to view withdrawals."
            : "Unable to load withdrawals."
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

  const withdrawalAmount = Number(form.withdrawalAmount) || 0;
  const serviceCharge = Number(form.serviceCharge) || 0;

  /*
    Customer receives withdrawal amount
    minus service charge.
  */
  const customerReceives = Math.max(
    withdrawalAmount + serviceCharge,
    0
  );

  /* =========================================================
     SAVE WITHDRAWAL
  ========================================================= */

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      alert("Please login again.");
      return;
    }

    if (!form.customerName.trim()) {
      alert("Please enter customer name.");
      return;
    }

    if (!form.mobile.trim()) {
      alert("Please enter mobile number.");
      return;
    }

    if (withdrawalAmount <= 0) {
      alert("Please enter a valid withdrawal amount.");
      return;
    }

    if (serviceCharge < 0) {
      alert("Service charge cannot be negative.");
      return;
    }

    if (serviceCharge > withdrawalAmount) {
      alert("Service charge cannot be greater than withdrawal amount.");
      return;
    }

    setSaving(true);

    try {
      const now = new Date();

      const dateKey = now.toISOString().slice(0, 10);

      const monthKey = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}`;

      const yearKey = String(now.getFullYear());

      const currentUser = auth.currentUser;

      if (!currentUser) {
        throw new Error("User session expired. Please login again.");
      }

      const attendantName =
        currentUser.displayName ||
        currentUser.email ||
        "Attendant";

      await addDoc(collection(db, "withdrawals"), {
        customerName: form.customerName.trim(),
        mobile: form.mobile.trim(),

        withdrawalAmount: withdrawalAmount,
        serviceCharge: serviceCharge,
        customerReceives: customerReceives,

        paymentMethod: form.paymentMethod,

        attendantId: currentUser.uid,
        attendantName: attendantName,

        status: "completed",

        createdAt: serverTimestamp(),

        dateKey,
        monthKey,
        yearKey,
      });

      alert("Withdrawal recorded successfully.");

      setForm({
        customerName: "",
        mobile: "",
        withdrawalAmount: "",
        serviceCharge: "",
        paymentMethod: "cash",
      });

      setShowModal(false);
    } catch (err) {
      console.error("Unable to save withdrawal:", err);

      if (err?.code === "permission-denied") {
        alert(
          "Permission denied. Please check your Firestore rules and user role."
        );
      } else {
        alert("Unable to save withdrawal. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  /* =========================================================
     SEARCH
  ========================================================= */

  const filteredWithdrawals = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return withdrawals;

    return withdrawals.filter((item) => {
      return (
        item.customerName?.toLowerCase().includes(keyword) ||
        item.mobile?.toLowerCase().includes(keyword) ||
        item.attendantName?.toLowerCase().includes(keyword) ||
        item.paymentMethod?.toLowerCase().includes(keyword) ||
        String(item.withdrawalAmount || "").includes(keyword)
      );
    });
  }, [withdrawals, search]);

  /* =========================================================
     STATS
  ========================================================= */

  const totalWithdrawals = useMemo(() => {
    return withdrawals.reduce(
      (sum, item) => sum + Number(item.withdrawalAmount || 0),
      0
    );
  }, [withdrawals]);

  const totalCharges = useMemo(() => {
    return withdrawals.reduce(
      (sum, item) => sum + Number(item.serviceCharge || 0),
      0
    );
  }, [withdrawals]);

  const totalCustomerReceives = useMemo(() => {
    return withdrawals.reduce(
      (sum, item) => sum + Number(item.customerReceives || 0),
      0
    );
  }, [withdrawals]);

  /* =========================================================
     CSV EXPORT
  ========================================================= */

  const exportCSV = () => {
    if (!filteredWithdrawals.length) {
      alert("No withdrawal records to export.");
      return;
    }

    const headers = [
      "Customer Name",
      "Mobile",
      "Withdrawal Amount",
      "Service Charge",
      "Customer Receives",
      "Payment Method",
      "Attendant",
      "Status",
      "Date",
    ];

    const rows = filteredWithdrawals.map((item) => {
      let date = "";

      if (item.createdAt?.seconds) {
        date = new Date(
          item.createdAt.seconds * 1000
        ).toLocaleString("en-IN");
      }

      return [
        item.customerName || "",
        item.mobile || "",
        item.withdrawalAmount || 0,
        item.serviceCharge || 0,
        item.customerReceives || 0,
        item.paymentMethod || "",
        item.attendantName || "",
        item.status || "",
        date,
      ];
    });

    const csv = [
      headers,
      ...rows,
    ]
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `withdrawals-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  /* =========================================================
     FORMAT DATE
  ========================================================= */

  const formatDate = (timestamp) => {
    if (!timestamp?.seconds) {
      return "Just now";
    }

    return new Date(timestamp.seconds * 1000).toLocaleString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="withdrawal-page">

      {/* HEADER */}
      <div className="page-head">
        <div>
          <div className="eyebrow">MANAGEMENT</div>

          <h1>Withdrawal</h1>

          <p>
            Record customer cash withdrawal and service charge.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => setShowModal(true)}
        >
          <Plus size={16} />
          Add new
        </button>
      </div>

      {/* STATS */}
      <div className="withdrawal-stats">

        <div className="withdrawal-stat-card">
          <div className="withdrawal-stat-icon blue">
            <Wallet size={19} />
          </div>

          <div>
            <span>Total Withdrawals</span>
            <strong>{formatCurrency(totalWithdrawals)}</strong>
          </div>
        </div>

        <div className="withdrawal-stat-card">
          <div className="withdrawal-stat-icon purple">
            <TrendingUp size={19} />
          </div>

          <div>
            <span>Service Charges</span>
            <strong>{formatCurrency(totalCharges)}</strong>
          </div>
        </div>

        <div className="withdrawal-stat-card">
          <div className="withdrawal-stat-icon green">
            <IndianRupee size={19} />
          </div>

          <div>
            <span>Customer Receives</span>
            <strong>
              {formatCurrency(totalCustomerReceives)}
            </strong>
          </div>
        </div>

        <div className="withdrawal-stat-card">
          <div className="withdrawal-stat-icon orange">
            <Users size={19} />
          </div>

          <div>
            <span>Transactions</span>
            <strong>{withdrawals.length}</strong>
          </div>
        </div>

      </div>

      {/* HISTORY */}
      <section className="panel">

        <div className="panel-header">
          <div>
            <div className="section-label">
              TRANSACTION HISTORY
            </div>

            <h2>Withdrawal records</h2>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="toolbar">

          <div className="search-bar">
            <Search size={16} />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search withdrawal..."
            />
          </div>

          <div className="toolbar-right">

            <span className="result-count">
              {filteredWithdrawals.length} records
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
              Check your Firestore permissions and signed-in
              user role.
            </p>
          </div>
        )}

        {/* LOADING */}
        {loading && !error && (
          <div className="module-state">
            <div className="module-icon spin">
              ✦
            </div>

            <h3>Loading withdrawals...</h3>

            <p>
              Getting the latest withdrawal records.
            </p>
          </div>
        )}

        {/* EMPTY */}
        {!loading &&
          !error &&
          filteredWithdrawals.length === 0 && (
            <div className="empty-module">

              <div className="module-icon">
                <Wallet size={25} />
              </div>

              <h2>
                {search
                  ? "No withdrawals found"
                  : "No withdrawal records"}
              </h2>

              <p>
                {search
                  ? "Try another customer name, mobile number or amount."
                  : "Start by adding your first customer withdrawal."}
              </p>

              {!search && (
                <button
                  className="primary-btn"
                  onClick={() => setShowModal(true)}
                >
                  <Plus size={16} />
                  Add withdrawal
                </button>
              )}

            </div>
          )}

        {/* TABLE */}
        {!loading &&
          !error &&
          filteredWithdrawals.length > 0 && (
            <div className="withdrawal-table-wrap">

              <table className="withdrawal-table">

                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Withdrawal</th>
                    <th>Service Charge</th>
                    <th>Customer Receives</th>
                    <th>Payment</th>
                    <th>Attendant</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>

                  {filteredWithdrawals.map((item) => (
                    <tr key={item.id}>

                      <td>
                        <div className="customer-cell">

                          <div className="customer-avatar">
                            {item.customerName
                              ?.charAt(0)
                              ?.toUpperCase() || "C"}
                          </div>

                          <div>
                            <strong>
                              {item.customerName || "Unknown"}
                            </strong>

                            <small>
                              <Phone size={11} />
                              {item.mobile || "-"}
                            </small>
                          </div>

                        </div>
                      </td>

                      <td>
                        <strong className="amount-text">
                          {formatCurrency(
                            item.withdrawalAmount || 0
                          )}
                        </strong>
                      </td>

                      <td>
                        <span className="charge-text">
                          {formatCurrency(
                            item.serviceCharge || 0
                          )}
                        </span>
                      </td>

                      <td>
                        <strong className="receive-text">
                          {formatCurrency(
                            item.customerReceives || 0
                          )}
                        </strong>
                      </td>

                      <td>
                        <span className="payment-badge">
                          {item.paymentMethod === "cash" && (
                            <Banknote size={13} />
                          )}

                          {item.paymentMethod === "upi" && (
                            <Smartphone size={13} />
                          )}

                          {item.paymentMethod === "bank" && (
                            <CreditCard size={13} />
                          )}

                          {item.paymentMethod
                            ?.charAt(0)
                            ?.toUpperCase() +
                            item.paymentMethod?.slice(1)}
                        </span>
                      </td>

                      <td>
                        <div className="attendant-name">
                          <User size={13} />
                          {item.attendantName || "-"}
                        </div>
                      </td>

                      <td>
                        <span className="status-badge">
                          <CheckCircle2 size={13} />
                          {item.status || "completed"}
                        </span>
                      </td>

                      <td>
                        <span className="date-text">
                          {formatDate(item.createdAt)}
                        </span>
                      </td>

                    </tr>
                  ))}

                </tbody>

              </table>

            </div>
          )}

      </section>

      {/* =====================================================
          ADD WITHDRAWAL MODAL
      ===================================================== */}

      {showModal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowModal(false);
            }
          }}
        >

          <div className="withdrawal-modal">

            <div className="modal-header">

              <div className="modal-title">

                <div className="modal-icon">
                  <CircleDollarSign size={20} />
                </div>

                <div>
                  <h2>New Withdrawal</h2>
                  <p>
                    Record a customer cash withdrawal.
                  </p>
                </div>

              </div>

              <button
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                <X size={18} />
              </button>

            </div>

            <form onSubmit={handleSubmit}>

              <div className="form-grid">

                {/* CUSTOMER */}
                <div className="field">

                  <label>
                    Customer Name
                  </label>

                  <div className="input-wrap">
                    <User size={15} />

                    <input
                      className="input"
                      name="customerName"
                      value={form.customerName}
                      onChange={handleChange}
                      placeholder="Enter customer name"
                    />
                  </div>

                </div>

                {/* MOBILE */}
                <div className="field">

                  <label>
                    Mobile Number
                  </label>

                  <div className="input-wrap">
                    <Phone size={15} />

                    <input
                      className="input"
                      name="mobile"
                      value={form.mobile}
                      onChange={handleChange}
                      placeholder="Enter mobile number"
                      inputMode="numeric"
                    />
                  </div>

                </div>

                {/* WITHDRAWAL */}
                <div className="field">

                  <label>
                    Withdrawal Amount
                  </label>

                  <div className="input-wrap">
                    <IndianRupee size={15} />

                    <input
                      className="input input-large"
                      name="withdrawalAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.withdrawalAmount}
                      onChange={handleChange}
                      placeholder="0.00"
                    />
                  </div>

                </div>

                {/* SERVICE CHARGE */}
                <div className="field">

                  <label>
                    Service Charge
                  </label>

                  <div className="input-wrap">
                    <IndianRupee size={15} />

                    <input
                      className="input input-large"
                      name="serviceCharge"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.serviceCharge}
                      onChange={handleChange}
                      placeholder="0.00"
                    />
                  </div>

                </div>

              </div>

              {/* PAYMENT METHOD */}
              <div className="payment-section">

                <label>
                  Payment Method
                </label>

                <div className="payment-grid">

                  <button
                    type="button"
                    className={`payment-method ${form.paymentMethod === "cash"
                      ? "active"
                      : ""
                      }`}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        paymentMethod: "cash",
                      }))
                    }
                  >
                    <Banknote size={18} />

                    <span>Cash</span>
                  </button>

                  <button
                    type="button"
                    className={`payment-method ${form.paymentMethod === "upi"
                      ? "active"
                      : ""
                      }`}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        paymentMethod: "upi",
                      }))
                    }
                  >
                    <Smartphone size={18} />

                    <span>UPI</span>
                  </button>

                  <button
                    type="button"
                    className={`payment-method ${form.paymentMethod === "bank"
                      ? "active"
                      : ""
                      }`}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        paymentMethod: "bank",
                      }))
                    }
                  >
                    <CreditCard size={18} />

                    <span>Bank</span>
                  </button>

                </div>

              </div>

              {/* CALCULATION */}
              <div className="withdrawal-calculation">

                <div>
                  <span>Withdrawal amount</span>

                  <strong>
                    {formatCurrency(withdrawalAmount)}
                  </strong>
                </div>

                <div>
                  <span>Service charge</span>

                  <strong>
                    {formatCurrency(serviceCharge)}
                  </strong>
                </div>

                <div className="calculation-total">

                  <span>
                    Total
                  </span>

                  <strong>
                    {formatCurrency(customerReceives)}
                  </strong>

                </div>

              </div>

              {/* ACTIONS */}
              <div className="modal-actions">

                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="save-btn"
                  disabled={saving}
                >
                  {saving ? (
                    "Saving..."
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Save Withdrawal
                    </>
                  )}
                </button>

              </div>

            </form>

          </div>

        </div>
      )}

    </div>
  );
}