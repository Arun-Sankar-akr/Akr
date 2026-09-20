import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

import {
  Banknote,
  Coins,
  WalletCards,
  Plus,
  Minus,
  Search,
  Download,
  LockKeyhole,
  UnlockKeyhole,
  RefreshCw,
  CircleDollarSign,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronRight,
  Calculator,
  Eye,
} from "lucide-react";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatCurrency } from "../../utils/currency";

import "./CashRegister.css";

// ============================================================
// DENOMINATIONS
// ============================================================

const DENOMINATIONS = [
  {
    value: 500,
    type: "note",
    label: "₹500",
  },
  {
    value: 200,
    type: "note",
    label: "₹200",
  },
  {
    value: 100,
    type: "note",
    label: "₹100",
  },
  {
    value: 50,
    type: "note",
    label: "₹50",
  },
  {
    value: 20,
    type: "note",
    label: "₹20",
  },
  {
    value: 10,
    type: "note",
    label: "₹10",
  },
  {
    value: 5,
    type: "coin",
    label: "₹5",
  },
  {
    value: 2,
    type: "coin",
    label: "₹2",
  },
  {
    value: 1,
    type: "coin",
    label: "₹1",
  },
];

// ============================================================
// HELPERS
// ============================================================

function getDateKey(date = new Date()) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonthKey(date = new Date()) {
  return getDateKey(date).slice(0, 7);
}

function getYearKey(date = new Date()) {
  return getDateKey(date).slice(0, 4);
}

function emptyDenominations() {
  return DENOMINATIONS.reduce(
    (acc, item) => {
      acc[item.value] = 0;
      return acc;
    },
    {}
  );
}

function calculateDenominationTotal(
  denominations
) {
  return DENOMINATIONS.reduce(
    (total, item) => {
      const pcs =
        Number(
          denominations?.[item.value]
        ) || 0;

      return (
        total +
        pcs * item.value
      );
    },
    0
  );
}

function getTimestampValue(value) {
  if (!value) return 0;

  if (
    value?.toDate &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return parsed.getTime();
}

function formatDate(value) {
  if (!value) return "—";

  let date;

  if (
    value?.toDate &&
    typeof value.toDate === "function"
  ) {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(value) {
  if (!value) return "—";

  let date;

  if (
    value?.toDate &&
    typeof value.toDate === "function"
  ) {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

// ============================================================
// COMPONENT
// ============================================================

export default function CashRegister() {
  const {
    user,
    role,
    profile,
  } = useAuth();

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const [registers, setRegisters] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [showOpenModal, setShowOpenModal] =
    useState(false);

  const [showCloseModal, setShowCloseModal] =
    useState(false);

  const [
    openingDenominations,
    setOpeningDenominations,
  ] = useState(
    emptyDenominations()
  );

  const [
    closingDenominations,
    setClosingDenominations,
  ] = useState(
    emptyDenominations()
  );

  const [saving, setSaving] =
    useState(false);

  const [selectedHistoryRegister, setSelectedHistoryRegister] =
    useState(null);

  // ----------------------------------------------------------
  // FIRESTORE LISTENER
  // ----------------------------------------------------------

  useEffect(() => {
    if (!user?.uid || !role) {
      setRegisters([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const registersRef =
      collection(
        db,
        "cashRegisters"
      );

    let registerQuery;

    if (role === "admin") {
      registerQuery =
        query(registersRef);
    } else {
      registerQuery =
        query(
          registersRef,
          where(
            "attendantId",
            "==",
            user.uid
          )
        );
    }

    const unsubscribe =
      onSnapshot(
        registerQuery,
        (snapshot) => {
          const data =
            snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...item.data(),
              })
            );

          // ------------------------------------------------
          // IMPORTANT
          // Sort using the most recently changed timestamp.
          // This ensures a closed register becomes the
          // latest register after it is closed.
          // ------------------------------------------------

          data.sort((a, b) => {
            const getLatestTime =
              (item) => {
                const timestamps = [
                  item.updatedAt,
                  item.closedAt,
                  item.openedAt,
                  item.createdAt,
                ];

                return Math.max(
                  ...timestamps.map(
                    getTimestampValue
                  )
                );
              };

            return (
              getLatestTime(b) -
              getLatestTime(a)
            );
          });

          setRegisters(data);
          setLoading(false);
        },
        (firebaseError) => {
          console.error(
            "Cash register Firestore error:",
            firebaseError
          );

          setError(
            firebaseError.message ||
            "Unable to load cash registers."
          );

          setRegisters([]);
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, [
    user?.uid,
    role,
  ]);

  // ----------------------------------------------------------
  // TODAY
  // ----------------------------------------------------------

  const todayKey =
    getDateKey();

  const todayRegisters =
    useMemo(() => {
      return registers
        .filter(
          (item) =>
            item.dateKey ===
            todayKey
        )
        .sort((a, b) => {
          const getLatestTime =
            (item) => {
              return Math.max(
                getTimestampValue(
                  item.updatedAt
                ),
                getTimestampValue(
                  item.closedAt
                ),
                getTimestampValue(
                  item.openedAt
                ),
                getTimestampValue(
                  item.createdAt
                )
              );
            };

          return (
            getLatestTime(b) -
            getLatestTime(a)
          );
        });
    }, [
      registers,
      todayKey,
    ]);

  // ----------------------------------------------------------
  // OPEN REGISTER
  // ----------------------------------------------------------

  const openRegister =
    useMemo(() => {
      return (
        todayRegisters.find(
          (item) =>
            item.status === "open"
        ) || null
      );
    }, [
      todayRegisters,
    ]);

  // ----------------------------------------------------------
  // LATEST REGISTER
  //
  // This is the critical fix.
  //
  // If the register is closed, we still use the latest
  // closed register instead of returning zero.
  // ----------------------------------------------------------

  const latestTodayRegister =
    useMemo(() => {
      return (
        todayRegisters[0] ||
        null
      );
    }, [
      todayRegisters,
    ]);

  // ----------------------------------------------------------
  // REGISTER USED FOR DISPLAY
  // ----------------------------------------------------------

  const currentRegister =
    openRegister ||
    latestTodayRegister ||
    null;

  // ----------------------------------------------------------
  // TOTALS
  // ----------------------------------------------------------

  const openingCash =
    Number(
      currentRegister?.openingCash ??
      0
    );

  const cashSales =
    Number(
      currentRegister?.cashSales ??
      0
    );

  const cashAdded =
    Number(
      currentRegister?.cashAdded ??
      0
    );

  const cashRemoved =
    Number(
      currentRegister?.cashRemoved ??
      0
    );

  // ----------------------------------------------------------
  // EXPECTED CASH
  // ----------------------------------------------------------

  const calculatedExpectedCash =
    openingCash +
    cashAdded -
    cashRemoved +
    cashSales;

  const storedExpectedCash =
    Number(
      currentRegister?.expectedCash ??
      calculatedExpectedCash
    );

  // ----------------------------------------------------------
  // CURRENT DISPLAY CASH
  //
  // OPEN:
  //   expected drawer cash
  //
  // CLOSED:
  //   actual closing cash
  // ----------------------------------------------------------

  const currentCash =
    currentRegister?.status ===
      "closed"
      ? Number(
        currentRegister?.closingCash ??
        storedExpectedCash
      )
      : storedExpectedCash;

  // ----------------------------------------------------------
  // DIFFERENCE
  // ----------------------------------------------------------

  const difference =
    Number(
      currentRegister?.difference ??
      0
    );

  // ----------------------------------------------------------
  // HISTORY FILTER
  // ----------------------------------------------------------

  const filteredRegisters =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      return registers.filter(
        (item) => {
          const matchesSearch =
            !term ||
            String(
              item.attendantName ||
              ""
            )
              .toLowerCase()
              .includes(term) ||
            String(
              item.dateKey || ""
            )
              .toLowerCase()
              .includes(term) ||
            String(
              item.status || ""
            )
              .toLowerCase()
              .includes(term);

          const matchesStatus =
            statusFilter ===
            "all" ||
            item.status ===
            statusFilter;

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      registers,
      search,
      statusFilter,
    ]);

  // ----------------------------------------------------------
  // DENOMINATION HANDLER
  // ----------------------------------------------------------

  const changeDenomination = (
    setter,
    current,
    value,
    change
  ) => {
    const currentValue =
      Number(
        current?.[value] || 0
      );

    const nextValue =
      Math.max(
        0,
        currentValue + change
      );

    setter({
      ...current,
      [value]:
        nextValue,
    });
  };

  const setDenominationValue = (
    setter,
    current,
    value,
    rawValue
  ) => {
    const parsed =
      Math.max(
        0,
        Number.parseInt(
          rawValue,
          10
        ) || 0
      );

    setter({
      ...current,
      [value]:
        parsed,
    });
  };

  // ----------------------------------------------------------
  // OPEN REGISTER
  // ----------------------------------------------------------

  const handleOpenRegister =
    async () => {
      if (!user?.uid) {
        alert(
          "User session not found."
        );
        return;
      }

      const total =
        calculateDenominationTotal(
          openingDenominations
        );

      if (total <= 0) {
        alert(
          "Please enter at least one note or coin."
        );
        return;
      }

      if (openRegister) {
        alert(
          "Today's cash register is already open."
        );
        return;
      }

      setSaving(true);

      try {
        const now =
          new Date();

        const attendantName =
          profile?.name ||
          user.displayName ||
          user.email ||
          "Attendant";

        await addDoc(
          collection(
            db,
            "cashRegisters"
          ),
          {
            dateKey:
              getDateKey(now),

            monthKey:
              getMonthKey(now),

            yearKey:
              getYearKey(now),

            attendantId:
              user.uid,

            attendantName,

            openingCash:
              total,

            openingDenominations:
            {
              ...openingDenominations,
            },

            cashAdded: 0,

            cashRemoved: 0,

            cashSales: 0,

            expectedCash:
              total,

            closingCash: 0,

            closingDenominations:
              {},

            difference: 0,

            status: "open",

            openedAt:
              serverTimestamp(),

            createdAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          }
        );

        setOpeningDenominations(
          emptyDenominations()
        );

        setShowOpenModal(false);
      } catch (firebaseError) {
        console.error(
          "Open register error:",
          firebaseError
        );

        alert(
          firebaseError.message ||
          "Unable to open register."
        );
      } finally {
        setSaving(false);
      }
    };

  // ----------------------------------------------------------
  // CLOSE REGISTER
  // ----------------------------------------------------------

  const handleCloseRegister =
    async () => {
      if (!openRegister) {
        return;
      }

      const closingCash =
        calculateDenominationTotal(
          closingDenominations
        );

      if (closingCash <= 0) {
        alert(
          "Please enter the closing cash denominations."
        );
        return;
      }

      setSaving(true);

      try {
        const registerRef =
          doc(
            db,
            "cashRegisters",
            openRegister.id
          );

        const registerExpected =
          Number(
            openRegister.expectedCash ??
            (
              Number(
                openRegister.openingCash ||
                0
              ) +
              Number(
                openRegister.cashAdded ||
                0
              ) -
              Number(
                openRegister.cashRemoved ||
                0
              ) +
              Number(
                openRegister.cashSales ||
                0
              )
            )
          );

        const difference =
          closingCash -
          registerExpected;

        await updateDoc(
          registerRef,
          {
            // KEEP all existing values.
            // Only update closing information.

            closingCash,

            closingDenominations:
            {
              ...closingDenominations,
            },

            expectedCash:
              registerExpected,

            difference,

            status:
              "closed",

            closedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          }
        );

        setClosingDenominations(
          emptyDenominations()
        );

        setShowCloseModal(false);
      } catch (firebaseError) {
        console.error(
          "Close register error:",
          firebaseError
        );

        alert(
          firebaseError.message ||
          "Unable to close register."
        );
      } finally {
        setSaving(false);
      }
    };

  // ----------------------------------------------------------
  // EXPORT CSV
  // ----------------------------------------------------------

  const exportCSV = () => {
    if (
      filteredRegisters.length ===
      0
    ) {
      alert(
        "No records available to export."
      );
      return;
    }

    const headers = [
      "Date",
      "Attendant",
      "Status",
      "Opening Cash",
      "Cash Sales",
      "Cash Added",
      "Cash Removed",
      "Expected Cash",
      "Closing Cash",
      "Difference",
    ];

    const rows =
      filteredRegisters.map(
        (item) => [
          item.dateKey || "",
          item.attendantName || "",
          item.status || "",
          item.openingCash || 0,
          item.cashSales || 0,
          item.cashAdded || 0,
          item.cashRemoved || 0,
          item.expectedCash || 0,
          item.closingCash || 0,
          item.difference || 0,
        ]
      );

    const csv = [
      headers,
      ...rows,
    ]
      .map(
        (row) =>
          row
            .map(
              (value) =>
                `"${String(
                  value
                ).replace(
                  /"/g,
                  '""'
                )}"`
            )
            .join(",")
      )
      .join("\n");

    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8;",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      `cash-register-${todayKey}.csv`;

    document.body.appendChild(
      link
    );

    link.click();

    document.body.removeChild(
      link
    );

    URL.revokeObjectURL(
      url
    );
  };

  // ----------------------------------------------------------
  // DENOMINATION EDITOR
  // ----------------------------------------------------------

  const renderDenominationEditor = (
    values,
    setter
  ) => (
    <div className="cash-denomination-list">
      {DENOMINATIONS.map(
        (item) => {
          const pcs =
            Number(
              values?.[
              item.value
              ] || 0
            );

          const lineTotal =
            pcs *
            item.value;

          return (
            <div
              className="cash-denomination-row"
              key={item.value}
            >
              <div className="cash-denomination-main">
                <div
                  className={`cash-denomination-symbol ${item.type}`}
                >
                  {item.type ===
                    "note" ? (
                    <Banknote
                      size={16}
                    />
                  ) : (
                    <Coins
                      size={16}
                    />
                  )}
                </div>

                <div>
                  <strong>
                    {item.label}
                  </strong>

                  <span>
                    {item.type ===
                      "note"
                      ? "NOTE"
                      : "COIN"}
                  </span>
                </div>
              </div>

              <div className="cash-pcs-control">
                <button
                  type="button"
                  className="cash-pcs-btn"
                  onClick={() =>
                    changeDenomination(
                      setter,
                      values,
                      item.value,
                      -1
                    )
                  }
                  disabled={
                    pcs <= 0
                  }
                >
                  <Minus
                    size={14}
                  />
                </button>

                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={pcs}
                  onChange={(
                    event
                  ) =>
                    setDenominationValue(
                      setter,
                      values,
                      item.value,
                      event.target
                        .value
                    )
                  }
                  aria-label={`${item.label} quantity`}
                />

                <button
                  type="button"
                  className="cash-pcs-btn"
                  onClick={() =>
                    changeDenomination(
                      setter,
                      values,
                      item.value,
                      1
                    )
                  }
                >
                  <Plus
                    size={14}
                  />
                </button>
              </div>

              <div className="cash-denomination-total">
                {formatCurrency(
                  lineTotal
                )}
              </div>
            </div>
          );
        }
      )}
    </div>
  );

  const openingModalTotal =
    calculateDenominationTotal(
      openingDenominations
    );

  const closingModalTotal =
    calculateDenominationTotal(
      closingDenominations
    );

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="cash-register-page">

      {/* ====================================================
          HEADER
      ==================================================== */}

      <header className="cash-page-header">
        <div className="cash-title-wrap">
          <div className="cash-title-icon">
            <WalletCards
              size={20}
            />
          </div>

          <div>
            <div className="cash-eyebrow">
              MANAGEMENT
            </div>

            <h1>
              Cash Register
            </h1>

            <p>
              Track opening cash,
              sales and closing
              balance.
            </p>
          </div>
        </div>

        <div className="cash-header-actions">
          {openRegister ? (
            <button
              className="cash-primary-btn close"
              onClick={() =>
                setShowCloseModal(
                  true
                )
              }
            >
              <LockKeyhole
                size={15}
              />

              Close Register

              <ChevronRight
                size={15}
              />
            </button>
          ) : (
            <button
              className="cash-primary-btn"
              onClick={() =>
                setShowOpenModal(
                  true
                )
              }
            >
              <UnlockKeyhole
                size={15}
              />

              Open Register

              <ChevronRight
                size={15}
              />
            </button>
          )}
        </div>
      </header>

      {/* ====================================================
          ERROR
      ==================================================== */}

      {error && (
        <div className="cash-error">
          <AlertCircle
            size={16}
          />

          <span>
            {error}
          </span>

          <button
            onClick={() =>
              window.location.reload()
            }
          >
            Retry
          </button>
        </div>
      )}

      {/* ====================================================
          STATS
      ==================================================== */}

      <section className="cash-stats-grid">

        {/* STATUS */}

        <div className="cash-stat-card">
          <div className="cash-stat-top">
            <span>
              Today's Status
            </span>

            <div className="cash-stat-icon purple">
              {openRegister ? (
                <UnlockKeyhole
                  size={15}
                />
              ) : (
                <LockKeyhole
                  size={15}
                />
              )}
            </div>
          </div>

          <strong>
            {openRegister
              ? "Open"
              : latestTodayRegister
                ? "Closed"
                : "Not Opened"}
          </strong>

          <small>
            {openRegister
              ? "Register is active"
              : latestTodayRegister
                ? "Today's register is closed"
                : "No register opened today"}
          </small>
        </div>

        {/* OPENING CASH */}

        <div className="cash-stat-card">
          <div className="cash-stat-top">
            <span>
              Opening Cash
            </span>

            <div className="cash-stat-icon blue">
              <Banknote
                size={15}
              />
            </div>
          </div>

          <strong>
            {formatCurrency(
              openingCash
            )}
          </strong>

          <small>
            Today's opening balance
          </small>
        </div>

        {/* CASH SALES */}

        <div className="cash-stat-card">
          <div className="cash-stat-top">
            <span>
              Cash Sales
            </span>

            <div className="cash-stat-icon green">
              <ArrowUpRight
                size={15}
              />
            </div>
          </div>

          <strong>
            {formatCurrency(
              cashSales
            )}
          </strong>

          <small>
            Cash received today
          </small>
        </div>

        {/* EXPECTED CASH */}

        <div className="cash-stat-card">
          <div className="cash-stat-top">
            <span>
              {currentRegister?.status ===
                "closed"
                ? "Closing Cash"
                : "Expected Cash"}
            </span>

            <div className="cash-stat-icon orange">
              <CircleDollarSign
                size={15}
              />
            </div>
          </div>

          <strong>
            {formatCurrency(
              currentCash
            )}
          </strong>

          <small>
            {currentRegister?.status ===
              "closed"
              ? "Actual counted drawer cash"
              : "Expected drawer balance"}
          </small>
        </div>

      </section>

      {/* ====================================================
          MAIN REGISTER
      ==================================================== */}

      <section className="cash-main-card">

        <div className="cash-main-left">

          <div className="cash-section-label">
            CURRENT REGISTER
          </div>

          <div className="cash-balance-row">

            <div>
              <span>
                {currentRegister?.status ===
                  "closed"
                  ? "Actual closing cash"
                  : "Expected drawer cash"}
              </span>

              <strong>
                {formatCurrency(
                  currentCash
                )}
              </strong>
            </div>

            <div
              className={`cash-status-pill ${openRegister
                  ? "open"
                  : "closed"
                }`}
            >
              <span />

              {openRegister
                ? "REGISTER OPEN"
                : latestTodayRegister
                  ? "REGISTER CLOSED"
                  : "NO REGISTER"}
            </div>

          </div>

          <div className="cash-mini-grid">

            <div>
              <span>
                Opening
              </span>

              <strong>
                {formatCurrency(
                  openingCash
                )}
              </strong>
            </div>

            <div>
              <span>
                Cash sales
              </span>

              <strong>
                {formatCurrency(
                  cashSales
                )}
              </strong>
            </div>

            <div>
              <span>
                Added
              </span>

              <strong>
                {formatCurrency(
                  cashAdded
                )}
              </strong>
            </div>

            <div>
              <span>
                Removed
              </span>

              <strong>
                {formatCurrency(
                  cashRemoved
                )}
              </strong>
            </div>

          </div>

          {/* CLOSED DIFFERENCE */}

          {currentRegister?.status ===
            "closed" && (
              <div className="cash-closed-result">
                <div>
                  <span>
                    Expected
                  </span>

                  <strong>
                    {formatCurrency(
                      storedExpectedCash
                    )}
                  </strong>
                </div>

                <div
                  className={
                    difference > 0
                      ? "positive"
                      : difference < 0
                        ? "negative"
                        : "zero"
                  }
                >
                  <span>
                    Difference
                  </span>

                  <strong>
                    {difference > 0
                      ? "+"
                      : ""}
                    {formatCurrency(
                      difference
                    )}
                  </strong>
                </div>
              </div>
            )}

        </div>

        <div className="cash-main-action">

          <div className="cash-action-icon">
            <Calculator
              size={18}
            />
          </div>

          <div>
            <strong>
              {openRegister
                ? "Register is ready"
                : latestTodayRegister
                  ? "Today's register is closed"
                  : "Start today's register"}
            </strong>

            <span>
              {openRegister
                ? "Continue recording shop sales."
                : latestTodayRegister
                  ? "Today's cash session has been completed."
                  : "Count your opening notes and coins."}
            </span>
          </div>

          {openRegister ? (
            <button
              className="cash-action-btn danger"
              onClick={() =>
                setShowCloseModal(
                  true
                )
              }
            >
              <LockKeyhole
                size={15}
              />

              Close
            </button>
          ) : (
            <button
              className="cash-action-btn"
              onClick={() =>
                setShowOpenModal(
                  true
                )
              }
            >
              <Plus
                size={15}
              />

              Open
            </button>
          )}

        </div>

      </section>

      {/* ====================================================
          HISTORY
      ==================================================== */}

      <section className="cash-history-card">

        <div className="cash-history-head">

          <div>
            <div className="cash-section-label">
              REGISTER HISTORY
            </div>

            <h2>
              Cash sessions
            </h2>

            <p>
              Review previous opening
              and closing balances.
            </p>
          </div>

          <button
            className="cash-export-btn"
            onClick={
              exportCSV
            }
          >
            <Download
              size={14}
            />

            Export
          </button>

        </div>

        <div className="cash-toolbar">

          <div className="cash-search">

            <Search
              size={15}
            />

            <input
              value={search}
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="Search register..."
            />

            {search && (
              <button
                onClick={() =>
                  setSearch("")
                }
              >
                <X
                  size={13}
                />
              </button>
            )}

          </div>

          <div className="cash-filter">

            {[
              ["all", "All"],
              ["open", "Open"],
              ["closed", "Closed"],
            ].map(
              ([
                value,
                label,
              ]) => (
                <button
                  key={value}
                  className={
                    statusFilter ===
                      value
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setStatusFilter(
                      value
                    )
                  }
                >
                  {label}
                </button>
              )
            )}

          </div>

        </div>

        {loading ? (
          <div className="cash-loading">

            <RefreshCw
              size={18}
              className="spin"
            />

            Loading cash
            registers...

          </div>
        ) : filteredRegisters.length ===
          0 ? (
          <div className="cash-empty">

            <div>
              <WalletCards
                size={20}
              />
            </div>

            <strong>
              No cash sessions
              found
            </strong>

            <span>
              Open your first
              register to start
              tracking cash.
            </span>

          </div>
        ) : (
          <div className="cash-table-wrap">

            <table className="cash-table">

              <thead>
                <tr>
                  <th>
                    Date
                  </th>

                  {role ===
                    "admin" && (
                      <th>
                        Attendant
                      </th>
                    )}

                  <th>
                    Status
                  </th>

                  <th>
                    Opening
                  </th>

                  <th>
                    Cash Sales
                  </th>

                  <th>
                    Expected
                  </th>

                  <th>
                    Closing
                  </th>

                  <th>
                    Difference
                  </th>

                  <th className="cash-history-view-heading">
                    View
                  </th>
                </tr>
              </thead>

              <tbody>

                {filteredRegisters.map(
                  (item) => {
                    const itemDifference =
                      Number(
                        item.difference ||
                        0
                      );

                    return (
                      <tr
                        key={
                          item.id
                        }
                      >

                        <td>
                          <strong>
                            {formatDate(
                              item.dateKey
                            )}
                          </strong>

                          <small>
                            {formatDateTime(
                              item.openedAt
                            )}
                          </small>
                        </td>

                        {role ===
                          "admin" && (
                            <td>
                              <div className="cash-person">

                                <span>
                                  {String(
                                    item.attendantName ||
                                    "Unknown"
                                  )
                                    .charAt(
                                      0
                                    )
                                    .toUpperCase()}
                                </span>

                                <strong>
                                  {
                                    item.attendantName
                                  }
                                </strong>

                              </div>
                            </td>
                          )}

                        <td>
                          <span
                            className={`cash-table-status ${item.status}`}
                          >
                            <i />

                            {item.status}
                          </span>
                        </td>

                        <td>
                          {formatCurrency(
                            item.openingCash ||
                            0
                          )}
                        </td>

                        <td>
                          {formatCurrency(
                            item.cashSales ||
                            0
                          )}
                        </td>

                        <td>
                          {formatCurrency(
                            item.expectedCash ||
                            0
                          )}
                        </td>

                        <td>
                          {item.status ===
                            "closed"
                            ? formatCurrency(
                              item.closingCash ||
                              0
                            )
                            : "—"}
                        </td>

                        <td>
                          {item.status ===
                            "closed" ? (
                            <span
                              className={`cash-difference ${itemDifference >
                                  0
                                  ? "positive"
                                  : itemDifference <
                                    0
                                    ? "negative"
                                    : "zero"
                                }`}
                            >
                              {itemDifference >
                                0
                                ? "+"
                                : ""}

                              {formatCurrency(
                                itemDifference
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td className="cash-history-view-cell">
                          <button
                            type="button"
                            className="cash-view-btn"
                            onClick={() =>
                              setSelectedHistoryRegister(item)
                            }
                          >
                            <Eye size={14} />
                            View
                          </button>
                        </td>

                      </tr>
                    );
                  }
                )}

              </tbody>

            </table>

          </div>
        )}

      </section>

      {/* ====================================================
          OPEN MODAL
      ==================================================== */}

      {showOpenModal && (
        <div
          className="cash-modal-overlay"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowOpenModal(
                false
              );
            }
          }}
        >

          <div className="cash-modal">

            <div className="cash-modal-head">

              <div className="cash-modal-title">

                <div className="cash-modal-icon">
                  <UnlockKeyhole
                    size={17}
                  />
                </div>

                <div>
                  <strong>
                    Open Register
                  </strong>

                  <span>
                    Count today's opening
                    cash.
                  </span>
                </div>

              </div>

              <button
                className="cash-modal-close"
                onClick={() =>
                  setShowOpenModal(
                    false
                  )
                }
              >
                <X
                  size={17}
                />
              </button>

            </div>

            {renderDenominationEditor(
              openingDenominations,
              setOpeningDenominations
            )}

            <div className="cash-modal-total">

              <div>
                <span>
                  Opening cash
                </span>

                <strong>
                  {formatCurrency(
                    openingModalTotal
                  )}
                </strong>
              </div>

              <WalletCards
                size={18}
              />

            </div>

            <div className="cash-modal-actions">

              <button
                className="cash-cancel-btn"
                onClick={() =>
                  setShowOpenModal(
                    false
                  )
                }
                disabled={saving}
              >
                Cancel
              </button>

              <button
                className="cash-save-btn"
                onClick={
                  handleOpenRegister
                }
                disabled={
                  saving ||
                  openingModalTotal <=
                  0
                }
              >
                {saving ? (
                  <>
                    <RefreshCw
                      size={15}
                      className="spin"
                    />

                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2
                      size={15}
                    />

                    Open Register
                  </>
                )}
              </button>

            </div>

          </div>

        </div>
      )}

      {/* ====================================================
          CLOSE MODAL
      ==================================================== */}

      {showCloseModal &&
        openRegister && (
          <div
            className="cash-modal-overlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setShowCloseModal(
                  false
                );
              }
            }}
          >

            <div className="cash-modal">

              <div className="cash-modal-head">

                <div className="cash-modal-title">

                  <div className="cash-modal-icon danger">
                    <LockKeyhole
                      size={17}
                    />
                  </div>

                  <div>
                    <strong>
                      Close Register
                    </strong>

                    <span>
                      Count the actual
                      cash in your drawer.
                    </span>
                  </div>

                </div>

                <button
                  className="cash-modal-close"
                  onClick={() =>
                    setShowCloseModal(
                      false
                    )
                  }
                >
                  <X
                    size={17}
                  />
                </button>

              </div>

              <div className="cash-expected-box">

                <span>
                  Expected cash
                </span>

                <strong>
                  {formatCurrency(
                    expectedCashForClose(
                      openRegister
                    )
                  )}
                </strong>

              </div>

              {renderDenominationEditor(
                closingDenominations,
                setClosingDenominations
              )}

              <div className="cash-close-preview">

                <div>
                  <span>
                    Counted cash
                  </span>

                  <strong>
                    {formatCurrency(
                      closingModalTotal
                    )}
                  </strong>
                </div>

                <div
                  className={
                    closingModalTotal -
                      expectedCashForClose(
                        openRegister
                      ) >
                      0
                      ? "positive"
                      : closingModalTotal -
                        expectedCashForClose(
                          openRegister
                        ) <
                        0
                        ? "negative"
                        : "zero"
                  }
                >
                  <span>
                    Difference
                  </span>

                  <strong>
                    {closingModalTotal -
                      expectedCashForClose(
                        openRegister
                      ) >
                      0
                      ? "+"
                      : ""}

                    {formatCurrency(
                      closingModalTotal -
                      expectedCashForClose(
                        openRegister
                      )
                    )}
                  </strong>
                </div>

              </div>

              <div className="cash-modal-actions">

                <button
                  className="cash-cancel-btn"
                  onClick={() =>
                    setShowCloseModal(
                      false
                    )
                  }
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  className="cash-save-btn danger"
                  onClick={
                    handleCloseRegister
                  }
                  disabled={
                    saving ||
                    closingModalTotal <=
                    0
                  }
                >
                  {saving ? (
                    <>
                      <RefreshCw
                        size={15}
                        className="spin"
                      />

                      Closing...
                    </>
                  ) : (
                    <>
                      <LockKeyhole
                        size={15}
                      />

                      Close Register
                    </>
                  )}
                </button>

              </div>

            </div>

          </div>
        )}

      {selectedHistoryRegister && (
        <div
          className="cash-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedHistoryRegister(null);
            }
          }}
        >
          <div className="cash-history-detail-modal">
            <div className="cash-modal-head">
              <div className="cash-modal-title">
                <div className="cash-modal-icon">
                  <Eye size={17} />
                </div>
                <div>
                  <strong>Cash Session Details</strong>
                  <span>
                    {formatDate(selectedHistoryRegister.dateKey)}
                    {" • "}
                    {selectedHistoryRegister.status === "closed"
                      ? "Closed Session"
                      : "Open Session"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="cash-modal-close"
                onClick={() => setSelectedHistoryRegister(null)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="cash-history-detail-summary">
              <div>
                <span>Opening Cash</span>
                <strong>{formatCurrency(Number(selectedHistoryRegister.openingCash || 0))}</strong>
              </div>
              <div>
                <span>Cash Sales</span>
                <strong>{formatCurrency(Number(selectedHistoryRegister.cashSales || 0))}</strong>
              </div>
              <div>
                <span>Expected Cash</span>
                <strong>{formatCurrency(Number(selectedHistoryRegister.expectedCash || 0))}</strong>
              </div>
              <div>
                <span>Closing Cash</span>
                <strong>
                  {selectedHistoryRegister.status === "closed"
                    ? formatCurrency(Number(selectedHistoryRegister.closingCash || 0))
                    : "—"}
                </strong>
              </div>
            </div>

            <div className="cash-history-breakdown-grid">
              <div className="cash-history-breakdown-card">
                <div className="cash-history-breakdown-head">
                  <div>
                    <span className="cash-breakdown-kicker">OPEN</span>
                    <h3>Opening Cash Breakdown</h3>
                    <p>Exactly how many ₹500, ₹200, ₹100 etc. were added.</p>
                  </div>
                  <div className="cash-breakdown-total">
                    {formatCurrency(Number(selectedHistoryRegister.openingCash || 0))}
                  </div>
                </div>

                <div className="cash-history-denomination-list">
                  {DENOMINATIONS.map((item) => {
                    const pcs = Number(
                      selectedHistoryRegister.openingDenominations?.[item.value] || 0
                    );
                    return (
                      <div
                        className={`cash-history-denomination ${pcs > 0 ? "has-value" : ""}`}
                        key={`open-${item.value}`}
                      >
                        <div className="cash-history-denomination-left">
                          <div className={`cash-history-denomination-icon ${item.type}`}>
                            {item.type === "note" ? <Banknote size={14} /> : <Coins size={14} />}
                          </div>
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.type === "note" ? "NOTE" : "COIN"}</span>
                          </div>
                        </div>
                        <div className="cash-history-denomination-right">
                          <strong>{pcs} pcs</strong>
                          <span>{formatCurrency(pcs * item.value)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="cash-history-breakdown-card">
                <div className="cash-history-breakdown-head">
                  <div>
                    <span className="cash-breakdown-kicker close">CLOSE</span>
                    <h3>Closing Cash Breakdown</h3>
                    <p>Exactly how many notes and coins were counted at close.</p>
                  </div>
                  <div className="cash-breakdown-total close">
                    {selectedHistoryRegister.status === "closed"
                      ? formatCurrency(Number(selectedHistoryRegister.closingCash || 0))
                      : "—"}
                  </div>
                </div>

                {selectedHistoryRegister.status === "closed" ? (
                  <div className="cash-history-denomination-list">
                    {DENOMINATIONS.map((item) => {
                      const pcs = Number(
                        selectedHistoryRegister.closingDenominations?.[item.value] || 0
                      );
                      return (
                        <div
                          className={`cash-history-denomination ${pcs > 0 ? "has-value" : ""}`}
                          key={`close-${item.value}`}
                        >
                          <div className="cash-history-denomination-left">
                            <div className={`cash-history-denomination-icon ${item.type}`}>
                              {item.type === "note" ? <Banknote size={14} /> : <Coins size={14} />}
                            </div>
                            <div>
                              <strong>{item.label}</strong>
                              <span>{item.type === "note" ? "NOTE" : "COIN"}</span>
                            </div>
                          </div>
                          <div className="cash-history-denomination-right">
                            <strong>{pcs} pcs</strong>
                            <span>{formatCurrency(pcs * item.value)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="cash-history-not-closed">
                    <LockKeyhole size={18} />
                    <strong>Register is still open</strong>
                    <span>Closing denomination details will appear after the register is closed.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="cash-history-detail-footer">
              <div>
                <span>Cash Added</span>
                <strong>{formatCurrency(Number(selectedHistoryRegister.cashAdded || 0))}</strong>
              </div>
              <div>
                <span>Cash Removed</span>
                <strong>{formatCurrency(Number(selectedHistoryRegister.cashRemoved || 0))}</strong>
              </div>
              <div>
                <span>Difference</span>
                <strong className={
                  Number(selectedHistoryRegister.difference || 0) > 0
                    ? "positive"
                    : Number(selectedHistoryRegister.difference || 0) < 0
                      ? "negative"
                      : "zero"
                }>
                  {Number(selectedHistoryRegister.difference || 0) > 0 ? "+" : ""}
                  {formatCurrency(Number(selectedHistoryRegister.difference || 0))}
                </strong>
              </div>
              <button
                type="button"
                className="cash-cancel-btn"
                onClick={() => setSelectedHistoryRegister(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ============================================================
// CLOSE CALCULATION
// ============================================================

function expectedCashForClose(
  register
) {
  if (!register) return 0;

  return Number(
    register.expectedCash ??
    (
      Number(
        register.openingCash ||
        0
      ) +
      Number(
        register.cashAdded ||
        0
      ) -
      Number(
        register.cashRemoved ||
        0
      ) +
      Number(
        register.cashSales ||
        0
      )
    )
  );
}