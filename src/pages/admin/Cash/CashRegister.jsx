import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Download,
  WalletCards,
  LockKeyhole,
  UnlockKeyhole,
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Eye,
  X,
  Save,
  Calculator,
  AlertTriangle,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";
import { useAuth } from "../../../context/AuthContext";

import "./CashRegister.css";

export default function CashRegister() {
  const { user, profile } = useAuth();

  const [registers, setRegisters] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedRegister, setSelectedRegister] = useState(null);

  const [saving, setSaving] = useState(false);

  const [openForm, setOpenForm] = useState({
    openingCash: "",
    notes: "",
  });

  const [closeForm, setCloseForm] = useState({
    actualCash: "",
    notes: "",
  });

  /* =====================================================
     LOAD REGISTERS
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
            a.openedAt?.seconds ||
            a.createdAt?.seconds ||
            0;

          const bTime =
            b.openedAt?.seconds ||
            b.createdAt?.seconds ||
            0;

          return bTime - aTime;
        });

        setRegisters(data);
        setLoading(false);
      },
      (error) => {
        console.error("Cash register error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /* =====================================================
     CURRENT OPEN REGISTER
  ===================================================== */

  const openRegister = useMemo(() => {
    return registers.find(
      (register) => register.status === "open"
    );
  }, [registers]);

  /* =====================================================
     SEARCH
  ===================================================== */

  const filteredRegisters = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return registers;

    return registers.filter((register) =>
      [
        register.registerName,
        register.openedByName,
        register.closedByName,
        register.status,
        register.notes,
      ]
        .filter(Boolean)
        .some((field) =>
          String(field).toLowerCase().includes(value)
        )
    );
  }, [registers, search]);

  /* =====================================================
     STATS
  ===================================================== */

  const totalRegisters = registers.length;

  const closedRegisters = registers.filter(
    (item) => item.status === "closed"
  ).length;

  const totalSales = registers.reduce(
    (sum, item) => sum + Number(item.cashSales || 0),
    0
  );

  const totalDifference = registers.reduce(
    (sum, item) => sum + Number(item.difference || 0),
    0
  );

  /* =====================================================
     FORM CHANGE
  ===================================================== */

  const handleOpenChange = (e) => {
    const { name, value } = e.target;

    setOpenForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCloseChange = (e) => {
    const { name, value } = e.target;

    setCloseForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /* =====================================================
     OPEN REGISTER
  ===================================================== */

  const handleOpenRegister = async (e) => {
    e.preventDefault();

    const openingCash = Number(openForm.openingCash);

    if (!Number.isFinite(openingCash) || openingCash < 0) {
      alert("Enter a valid opening cash amount.");
      return;
    }

    if (openRegister) {
      alert(
        "A cash register is already open. Close the current register before opening another one."
      );
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "cashRegisters"), {
        registerName: "Main Cash Register",

        status: "open",

        openingCash,

        cashSales: 0,
        cashIn: 0,
        cashOut: 0,
        withdrawals: 0,

        expectedCash: openingCash,
        actualCash: 0,
        difference: 0,

        notes: openForm.notes.trim(),

        openedBy: user?.uid || "",
        openedByName:
          profile?.name ||
          user?.displayName ||
          "User",

        closedBy: "",
        closedByName: "",

        openedAt: serverTimestamp(),
        closedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setOpenForm({
        openingCash: "",
        notes: "",
      });

      setShowOpenModal(false);
    } catch (error) {
      console.error("Open register error:", error);
      alert(error.message || "Unable to open cash register.");
    } finally {
      setSaving(false);
    }
  };

  /* =====================================================
     CLOSE REGISTER
  ===================================================== */

  const handleCloseRegister = async (e) => {
    e.preventDefault();

    if (!selectedRegister) return;

    const actualCash = Number(closeForm.actualCash);

    if (!Number.isFinite(actualCash) || actualCash < 0) {
      alert("Enter a valid actual cash amount.");
      return;
    }

    const expectedCash = Number(
      selectedRegister.expectedCash || 0
    );

    const difference = actualCash - expectedCash;

    try {
      setSaving(true);

      await updateDoc(
        doc(db, "cashRegisters", selectedRegister.id),
        {
          status: "closed",

          actualCash,
          difference,

          closingNotes: closeForm.notes.trim(),

          closedBy: user?.uid || "",
          closedByName:
            profile?.name ||
            user?.displayName ||
            "User",

          closedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      setCloseForm({
        actualCash: "",
        notes: "",
      });

      setSelectedRegister(null);
      setShowCloseModal(false);
    } catch (error) {
      console.error("Close register error:", error);
      alert(error.message || "Unable to close cash register.");
    } finally {
      setSaving(false);
    }
  };

  /* =====================================================
     EXPORT
  ===================================================== */

  const exportRegisters = () => {
    if (!filteredRegisters.length) {
      alert("No cash register records available.");
      return;
    }

    const headers = [
      "Register",
      "Status",
      "Opening Cash",
      "Cash Sales",
      "Cash In",
      "Cash Out",
      "Expected Cash",
      "Actual Cash",
      "Difference",
      "Opened By",
      "Closed By",
    ];

    const rows = filteredRegisters.map((item) => [
      item.registerName || "Main Cash Register",
      item.status || "",
      Number(item.openingCash || 0),
      Number(item.cashSales || 0),
      Number(item.cashIn || 0),
      Number(item.cashOut || 0),
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
    link.download = `cash-register-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    link.click();

    URL.revokeObjectURL(url);
  };

  /* =====================================================
     OPEN CLOSE MODAL
  ===================================================== */

  const openCloseRegisterModal = (register) => {
    setSelectedRegister(register);

    setCloseForm({
      actualCash: "",
      notes: "",
    });

    setShowCloseModal(true);
  };

  return (
    <div className="cash-page">

      {/* HEADER */}

      <div className="page-head">
        <div>
          <div className="eyebrow">CASH MANAGEMENT</div>

          <h1>Cash Register</h1>

          <p>
            Open, reconcile and close the daily cash register.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={() => {
            if (openRegister) {
              alert(
                "A register is already open. Close it before opening another register."
              );
              return;
            }

            setShowOpenModal(true);
          }}
        >
          <Plus size={16} />
          Open Register
        </button>
      </div>

      {/* CURRENT REGISTER */}

      {openRegister && (
        <section className="active-register-card">
          <div className="active-register-left">
            <div className="active-register-icon">
              <UnlockKeyhole size={21} />
            </div>

            <div>
              <span className="active-label">
                REGISTER ACTIVE
              </span>

              <h2>
                {openRegister.registerName ||
                  "Main Cash Register"}
              </h2>

              <p>
                Opened by{" "}
                <strong>
                  {openRegister.openedByName || "User"}
                </strong>
              </p>
            </div>
          </div>

          <div className="active-register-money">
            <span>Expected Cash</span>

            <strong>
              {formatCurrency(
                Number(openRegister.expectedCash || 0)
              )}
            </strong>
          </div>

          <button
            className="close-register-btn"
            onClick={() =>
              openCloseRegisterModal(openRegister)
            }
          >
            <LockKeyhole size={16} />
            Close Register
          </button>
        </section>
      )}

      {/* STATS */}

      <div className="cash-stats">

        <div className="cash-stat-card">
          <div className="cash-stat-icon">
            <WalletCards size={19} />
          </div>

          <div>
            <span>Total Registers</span>
            <strong>{totalRegisters}</strong>
          </div>
        </div>

        <div className="cash-stat-card">
          <div className="cash-stat-icon">
            <LockKeyhole size={19} />
          </div>

          <div>
            <span>Closed Registers</span>
            <strong>{closedRegisters}</strong>
          </div>
        </div>

        <div className="cash-stat-card">
          <div className="cash-stat-icon">
            <CircleDollarSign size={19} />
          </div>

          <div>
            <span>Total Cash Sales</span>
            <strong>
              {formatCurrency(totalSales)}
            </strong>
          </div>
        </div>

        <div className="cash-stat-card">
          <div className="cash-stat-icon">
            {totalDifference >= 0 ? (
              <TrendingUp size={19} />
            ) : (
              <TrendingDown size={19} />
            )}
          </div>

          <div>
            <span>Net Difference</span>
            <strong
              className={
                totalDifference < 0
                  ? "negative"
                  : "positive"
              }
            >
              {formatCurrency(totalDifference)}
            </strong>
          </div>
        </div>

      </div>

      {/* MAIN PANEL */}

      <section className="panel cash-panel">

        <div className="toolbar">

          <div className="search-bar">
            <Search size={16} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search cash registers..."
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

          <button
            className="secondary-btn"
            onClick={exportRegisters}
          >
            <Download size={15} />
            Export
          </button>

        </div>

        {loading ? (
          <div className="cash-loading">
            <div className="cash-spinner" />
            <span>Loading cash registers...</span>
          </div>
        ) : filteredRegisters.length === 0 ? (
          <div className="cash-empty">

            <div className="cash-empty-icon">
              <WalletCards size={28} />
            </div>

            <h2>No cash register records</h2>

            <p>
              Open your first cash register to begin
              daily cash reconciliation.
            </p>

            <button
              className="primary-btn"
              onClick={() =>
                setShowOpenModal(true)
              }
            >
              <Plus size={16} />
              Open Register
            </button>

          </div>
        ) : (
          <div className="cash-table-wrap">

            <table className="cash-table">

              <thead>
                <tr>
                  <th>Register</th>
                  <th>Status</th>
                  <th>Opening</th>
                  <th>Sales</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Difference</th>
                  <th>Opened By</th>
                  <th />
                </tr>
              </thead>

              <tbody>
                {filteredRegisters.map((register) => (
                  <tr key={register.id}>

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
                            {formatDate(
                              register.openedAt
                            )}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`status-pill ${register.status === "open"
                            ? "status-open"
                            : "status-closed"
                          }`}
                      >
                        {register.status === "open"
                          ? "Open"
                          : "Closed"}
                      </span>
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
                          register.cashSales || 0
                        )
                      )}
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(
                          Number(
                            register.expectedCash || 0
                          )
                        )}
                      </strong>
                    </td>

                    <td>
                      {register.status === "open"
                        ? "—"
                        : formatCurrency(
                          Number(
                            register.actualCash || 0
                          )
                        )}
                    </td>

                    <td>
                      {register.status === "open" ? (
                        "—"
                      ) : (
                        <strong
                          className={
                            Number(
                              register.difference || 0
                            ) < 0
                              ? "negative"
                              : Number(
                                register.difference || 0
                              ) > 0
                                ? "positive"
                                : ""
                          }
                        >
                          {formatCurrency(
                            Number(
                              register.difference || 0
                            )
                          )}
                        </strong>
                      )}
                    </td>

                    <td>
                      <span className="user-name">
                        {register.openedByName ||
                          "User"}
                      </span>
                    </td>

                    <td>
                      <button
                        className="icon-action"
                        title="View register"
                        onClick={() =>
                          setSelectedRegister(register)
                        }
                      >
                        <Eye size={16} />
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}

        <div className="cash-footer">
          Showing {filteredRegisters.length} of{" "}
          {registers.length} registers
        </div>

      </section>

      {/* OPEN MODAL */}

      {showOpenModal && (
        <div
          className="modal-backdrop"
          onMouseDown={() =>
            setShowOpenModal(false)
          }
        >
          <div
            className="cash-modal"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >

            <div className="cash-modal-head">

              <div>
                <span className="modal-eyebrow">
                  DAILY CASH
                </span>

                <h2>Open Cash Register</h2>

                <p>
                  Enter the cash available at the
                  beginning of the day.
                </p>
              </div>

              <button
                className="modal-close"
                onClick={() =>
                  setShowOpenModal(false)
                }
              >
                <X size={18} />
              </button>

            </div>

            <form
              className="cash-form"
              onSubmit={handleOpenRegister}
            >

              <label>
                <span>
                  Opening Cash <b>*</b>
                </span>

                <div className="amount-input">
                  <span>₹</span>

                  <input
                    name="openingCash"
                    value={openForm.openingCash}
                    onChange={handleOpenChange}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </label>

              <label>
                <span>Notes</span>

                <textarea
                  name="notes"
                  value={openForm.notes}
                  onChange={handleOpenChange}
                  rows="4"
                  placeholder="Opening notes..."
                />
              </label>

              <div className="cash-form-info">
                <Calculator size={17} />

                <div>
                  <strong>
                    Expected closing cash
                  </strong>

                  <p>
                    Opening cash + cash sales + cash
                    inflows − cash outflows.
                  </p>
                </div>
              </div>

              <div className="cash-modal-actions">

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() =>
                    setShowOpenModal(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-btn"
                  disabled={saving}
                >
                  <UnlockKeyhole size={16} />

                  {saving
                    ? "Opening..."
                    : "Open Register"}
                </button>

              </div>

            </form>

          </div>
        </div>
      )}

      {/* CLOSE MODAL */}

      {showCloseModal &&
        selectedRegister && (
          <div
            className="modal-backdrop"
            onMouseDown={() =>
              setShowCloseModal(false)
            }
          >
            <div
              className="cash-modal"
              onMouseDown={(e) =>
                e.stopPropagation()
              }
            >

              <div className="cash-modal-head">

                <div>
                  <span className="modal-eyebrow">
                    DAILY RECONCILIATION
                  </span>

                  <h2>Close Cash Register</h2>

                  <p>
                    Count the physical cash and enter
                    the actual closing amount.
                  </p>
                </div>

                <button
                  className="modal-close"
                  onClick={() =>
                    setShowCloseModal(false)
                  }
                >
                  <X size={18} />
                </button>

              </div>

              <form
                className="cash-form"
                onSubmit={handleCloseRegister}
              >

                <div className="reconcile-box">

                  <div>
                    <span>Opening Cash</span>

                    <strong>
                      {formatCurrency(
                        Number(
                          selectedRegister.openingCash ||
                          0
                        )
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Cash Sales</span>

                    <strong>
                      {formatCurrency(
                        Number(
                          selectedRegister.cashSales ||
                          0
                        )
                      )}
                    </strong>
                  </div>

                  <div className="expected-row">
                    <span>Expected Cash</span>

                    <strong>
                      {formatCurrency(
                        Number(
                          selectedRegister.expectedCash ||
                          0
                        )
                      )}
                    </strong>
                  </div>

                </div>

                <label>
                  <span>
                    Actual Closing Cash <b>*</b>
                  </span>

                  <div className="amount-input">
                    <span>₹</span>

                    <input
                      name="actualCash"
                      value={closeForm.actualCash}
                      onChange={handleCloseChange}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                </label>

                {closeForm.actualCash !== "" && (
                  <ReconciliationPreview
                    expected={
                      Number(
                        selectedRegister.expectedCash ||
                        0
                      )
                    }
                    actual={Number(
                      closeForm.actualCash || 0
                    )}
                  />
                )}

                <label>
                  <span>Closing Notes</span>

                  <textarea
                    name="notes"
                    value={closeForm.notes}
                    onChange={handleCloseChange}
                    rows="3"
                    placeholder="Explain any shortage, overage or notes..."
                  />
                </label>

                <div className="cash-modal-actions">

                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() =>
                      setShowCloseModal(false)
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-btn"
                    disabled={saving}
                  >
                    <LockKeyhole size={16} />

                    {saving
                      ? "Closing..."
                      : "Close Register"}
                  </button>

                </div>

              </form>

            </div>
          </div>
        )}

      {/* VIEW REGISTER */}

      {selectedRegister &&
        !showCloseModal &&
        !showOpenModal && (
          <RegisterDetails
            register={selectedRegister}
            onClose={() =>
              setSelectedRegister(null)
            }
            onCloseRegister={() =>
              openCloseRegisterModal(
                selectedRegister
              )
            }
          />
        )}

    </div>
  );
}

/* =========================================================
   RECONCILIATION PREVIEW
========================================================= */

function ReconciliationPreview({
  expected,
  actual,
}) {
  const difference = actual - expected;

  const isShort = difference < 0;
  const isOver = difference > 0;

  return (
    <div
      className={`reconciliation-preview ${isShort
          ? "reconciliation-short"
          : isOver
            ? "reconciliation-over"
            : "reconciliation-balanced"
        }`}
    >
      {isShort ? (
        <AlertTriangle size={18} />
      ) : (
        <CircleDollarSign size={18} />
      )}

      <div>
        <span>
          {isShort
            ? "Cash Shortage"
            : isOver
              ? "Cash Overage"
              : "Register Balanced"}
        </span>

        <strong>
          {formatCurrency(Math.abs(difference))}
        </strong>
      </div>
    </div>
  );
}

/* =========================================================
   REGISTER DETAILS
========================================================= */

function RegisterDetails({
  register,
  onClose,
  onCloseRegister,
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
              REGISTER DETAILS
            </span>

            <h2>
              {register.registerName ||
                "Main Cash Register"}
            </h2>

            <p>
              {register.status === "open"
                ? "Currently open"
                : "Register closed"}
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

          <DetailItem
            label="Status"
            value={
              register.status === "open"
                ? "Open"
                : "Closed"
            }
          />

          <DetailItem
            label="Opening Cash"
            value={formatCurrency(
              Number(register.openingCash || 0)
            )}
          />

          <DetailItem
            label="Cash Sales"
            value={formatCurrency(
              Number(register.cashSales || 0)
            )}
          />

          <DetailItem
            label="Cash In"
            value={formatCurrency(
              Number(register.cashIn || 0)
            )}
          />

          <DetailItem
            label="Cash Out"
            value={formatCurrency(
              Number(register.cashOut || 0)
            )}
          />

          <DetailItem
            label="Expected Cash"
            value={formatCurrency(
              Number(register.expectedCash || 0)
            )}
          />

          <DetailItem
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

          <DetailItem
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

          {register.status === "open" && (
            <button
              className="primary-btn"
              onClick={onCloseRegister}
            >
              <LockKeyhole size={16} />
              Close Register
            </button>
          )}

        </div>

      </div>
    </div>
  );
}

function DetailItem({ label, value }) {
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