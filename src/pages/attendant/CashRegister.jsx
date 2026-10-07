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
  arrayUnion,
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
  Landmark,
  Smartphone,
  Receipt,
  Trash2,
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
  // All coins are entered as ONE total amount (in rupees).
  {
    value: 1,
    type: "coin",
    label: "Coins",
  },
];


// ============================================================
// DIGITAL MONEY ACCOUNTS (banks / wallets)
// ============================================================

const DIGITAL_ACCOUNTS = [
  { key: "SBI", label: "SBI", type: "bank" },
  { key: "UCO", label: "UCO", type: "bank" },
  { key: "PNB_T", label: "PNB-T", type: "bank" },
  { key: "PNB_M", label: "PNB-M", type: "bank" },
  { key: "RAJA_TEC", label: "RAJA TEC", type: "bank" },
  { key: "PTM", label: "PTM", type: "wallet" },
];

function emptyDigital() {
  return DIGITAL_ACCOUNTS.reduce((acc, item) => {
    acc[item.key] = "";
    return acc;
  }, {});
}

function calculateDigitalTotal(digital) {
  return DIGITAL_ACCOUNTS.reduce((total, item) => {
    return total + (Number(digital?.[item.key]) || 0);
  }, 0);
}

// Convert the typed (string) values into clean numbers for saving
function cleanDigital(digital) {
  return DIGITAL_ACCOUNTS.reduce((acc, item) => {
    acc[item.key] = Math.max(0, Number(digital?.[item.key]) || 0);
    return acc;
  }, {});
}

function digitalToInputs(digital) {
  return DIGITAL_ACCOUNTS.reduce((acc, item) => {
    const value = Number(digital?.[item.key]) || 0;
    acc[item.key] = value > 0 ? String(value) : "";
    return acc;
  }, {});
}

function getExpenseList(register) {
  return Array.isArray(register?.expenses) ? register.expenses : [];
}

function calculateExpenseTotal(expenses) {
  return (Array.isArray(expenses) ? expenses : []).reduce(
    (total, item) => total + (Number(item?.amount) || 0),
    0
  );
}

function getCreditList(register) {
  return Array.isArray(register?.credits) ? register.credits : [];
}

function calculateCreditTotal(credits) {
  return (Array.isArray(credits) ? credits : []).reduce(
    (total, item) => total + (Number(item?.amount) || 0),
    0
  );
}

// ------------------------------------------------------------
// DAY TOTALS
//
//   Total Money  = Cash (drawer) + Digital Money
//   Net Total    = Total Money - Expenses
//
// Cash = actual closing cash when closed, otherwise the
// expected drawer cash.
// ------------------------------------------------------------

function getDayTotals(register) {
  if (!register) {
    return {
      cash: 0,
      digital: 0,
      expenses: 0,
      credits: 0,
      totalMoney: 0,
      net: 0,
    };
  }

  const expected = Number(
    register.expectedCash ??
    (Number(register.openingCash || 0) +
      Number(register.cashAdded || 0) -
      Number(register.cashRemoved || 0) +
      Number(register.cashSales || 0))
  );

  const cash =
    register.status === "closed"
      ? Number(register.closingCash ?? expected)
      : expected;

  const digital = calculateDigitalTotal(register.digitalBalances);
  const expenses = calculateExpenseTotal(register.expenses);
  const credits = calculateCreditTotal(register.credits);
  const totalMoney = cash + digital;

  return {
    cash,
    digital,
    expenses,
    credits,
    totalMoney,
    net: totalMoney - expenses,
  };
}

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

// Coins are one total rupee amount. Older records stored separate
// ₹5 / ₹2 / ₹1 counts, so fold those into one amount when reading.
function getDenominationCount(denominations, item) {
  if (item.type === "coin") {
    return (
      (Number(denominations?.[1]) || 0) +
      2 * (Number(denominations?.[2]) || 0) +
      5 * (Number(denominations?.[5]) || 0)
    );
  }

  return Number(denominations?.[item.value]) || 0;
}

// Opening total = opening cash + opening digital + credits.
// Credits are read live, so a deleted credit drops out of the total.
// Opening / closing snapshots of digital money and credit (loan).
// Older records that have no snapshot fall back to the live values.
function getOpeningDigital(register) {
  if (!register) return {};

  return register.openingDigital &&
    Object.keys(register.openingDigital).length > 0
    ? register.openingDigital
    : register.digitalBalances || {};
}

function getClosingDigital(register) {
  if (!register || register.status !== "closed") return null;

  return register.closingDigital &&
    Object.keys(register.closingDigital).length > 0
    ? register.closingDigital
    : register.digitalBalances || {};
}

function getOpeningCredits(register) {
  if (Array.isArray(register?.openingCredits)) {
    return register.openingCredits;
  }

  return getCreditList(register);
}

function getClosingCredits(register) {
  if (!register || register.status !== "closed") return null;

  if (Array.isArray(register.closingCredits)) {
    return register.closingCredits;
  }

  return getCreditList(register);
}

function getOpeningTotal(register) {
  if (!register) return 0;

  return (
    Number(register.openingCash || 0) +
    calculateDigitalTotal(getOpeningDigital(register)) +
    calculateCreditTotal(getOpeningCredits(register))
  );
}

// Closing total = counted cash + digital + credits (closed registers only).
function getClosingTotal(register) {
  if (!register || register.status !== "closed") return null;

  const totals = getDayTotals(register);

  return totals.cash + totals.digital + totals.credits;
}

// Overall difference = closing total - opening total
// (cash + digital money + credit at close, minus the same at open).
function getOverallDifference(register) {
  const closingTotal = getClosingTotal(register);

  if (closingTotal === null) return 0;

  return closingTotal - getOpeningTotal(register);
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

  // Digital money (banks / wallets)
  const [openingDigital, setOpeningDigital] =
    useState(emptyDigital());

  const [closingDigital, setClosingDigital] =
    useState(emptyDigital());

  const [digitalDraft, setDigitalDraft] =
    useState(emptyDigital());

  // Expenses
  const [expenseReason, setExpenseReason] =
    useState("");

  const [expenseAmount, setExpenseAmount] =
    useState("");

  const [savingExpense, setSavingExpense] =
    useState(false);

  // Credit (reason / person + amount)
  const [creditReason, setCreditReason] =
    useState("");

  const [creditAmount, setCreditAmount] =
    useState("");

  const [savingCredit, setSavingCredit] =
    useState(false);

  // Credit entered while opening the register
  const [openingCredits, setOpeningCredits] =
    useState([]);

  const [openingCreditReason, setOpeningCreditReason] =
    useState("");

  const [openingCreditAmount, setOpeningCreditAmount] =
    useState("");

  // Credit (loan) re-entered while closing the register
  const [closingCredits, setClosingCredits] =
    useState([]);

  const [closingCreditReason, setClosingCreditReason] =
    useState("");

  const [closingCreditAmount, setClosingCreditAmount] =
    useState("");

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

  const openingTotal =
    getOpeningTotal(currentRegister);

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

  // Overall register balance includes drawer cash, digital balances,
  // and recorded credits/loans for a like-for-like opening/closing view.
  const currentOverallTotal =
    currentRegister?.status === "closed"
      ? Number(getClosingTotal(currentRegister) || 0)
      : currentCash +
        calculateDigitalTotal(currentRegister?.digitalBalances) +
        calculateCreditTotal(getCreditList(currentRegister));

  // ----------------------------------------------------------
  // DIFFERENCE
  // ----------------------------------------------------------

  const difference =
    getOverallDifference(currentRegister);

  // ----------------------------------------------------------
  // DIGITAL MONEY + EXPENSES + DAY TOTAL
  // ----------------------------------------------------------

  const dayTotals =
    useMemo(
      () => getDayTotals(currentRegister),
      [currentRegister]
    );

  const currentExpenses =
    useMemo(
      () =>
        [...getExpenseList(currentRegister)].sort(
          (a, b) =>
            Number(b?.createdAtMs || 0) -
            Number(a?.createdAtMs || 0)
        ),
      [currentRegister]
    );

  const currentCredits =
    useMemo(
      () =>
        [...getCreditList(currentRegister)].sort(
          (a, b) =>
            Number(b?.createdAtMs || 0) -
            Number(a?.createdAtMs || 0)
        ),
      [currentRegister]
    );

  const currentDigitalKey =
    JSON.stringify(
      currentRegister?.digitalBalances || {}
    );

  // Keep the editable draft in sync with the saved values
  useEffect(() => {
    setDigitalDraft(
      digitalToInputs(
        currentRegister?.digitalBalances
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRegister?.id, currentDigitalKey]);

  const digitalDraftTotal =
    calculateDigitalTotal(digitalDraft);

  const openingDigitalTotal =
    calculateDigitalTotal(openingDigital);

  const closingDigitalTotal =
    calculateDigitalTotal(closingDigital);

  const openingCreditTotal =
    calculateCreditTotal(openingCredits);

  const closingCreditTotal =
    calculateCreditTotal(closingCredits);

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

  const handleAddOpeningCredit = () => {
    const reason = openingCreditReason.trim();
    const amount = Number(openingCreditAmount);

    if (!reason) {
      alert("Please enter the reason / person name.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("Please enter a valid credit amount.");
      return;
    }

    setOpeningCredits((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        reason,
        amount,
        createdAtMs: Date.now(),
        addedBy:
          profile?.name ||
          user?.displayName ||
          user?.email ||
          "Attendant",
      },
    ]);

    setOpeningCreditReason("");
    setOpeningCreditAmount("");
  };

  const handleRemoveOpeningCredit = (creditId) => {
    setOpeningCredits((prev) =>
      prev.filter((item) => item.id !== creditId)
    );
  };

  const handleAddClosingCredit = () => {
    const reason = closingCreditReason.trim();
    const amount = Number(closingCreditAmount);

    if (!reason) {
      alert("Please enter the reason / person name.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("Please enter a valid credit amount.");
      return;
    }

    setClosingCredits((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        reason,
        amount,
        createdAtMs: Date.now(),
        addedBy:
          profile?.name ||
          user?.displayName ||
          user?.email ||
          "Attendant",
      },
    ]);

    setClosingCreditReason("");
    setClosingCreditAmount("");
  };

  const handleRemoveClosingCredit = (creditId) => {
    setClosingCredits((prev) =>
      prev.filter((item) => item.id !== creditId)
    );
  };

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

      const digitalTotal =
        calculateDigitalTotal(
          openingDigital
        );

      if (total <= 0 && digitalTotal <= 0) {
        alert(
          "Please enter at least one note or coin, or a digital money amount."
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

            digitalBalances:
              cleanDigital(openingDigital),

            openingDigital:
              cleanDigital(openingDigital),

            closingDigital:
              {},

            expenses: [],

            credits: openingCredits,

            // Snapshot of the credit (loan) entered at opening
            openingCredits: openingCredits,

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

        setOpeningDigital(
          emptyDigital()
        );

        setOpeningCredits([]);
        setOpeningCreditReason("");
        setOpeningCreditAmount("");

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

      if (
        closingCash <= 0 &&
        calculateDigitalTotal(closingDigital) <= 0
      ) {
        alert(
          "Please enter the closing cash denominations or digital money."
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

        // Cash-only difference (counted vs expected drawer cash)
        const cashDifference =
          closingCash -
          registerExpected;

        // Overall difference = closing total - opening total
        const difference =
          closingCash +
          calculateDigitalTotal(closingDigital) +
          calculateCreditTotal(closingCredits) -
          getOpeningTotal(openRegister);

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

            digitalBalances:
              cleanDigital(closingDigital),

            closingDigital:
              cleanDigital(closingDigital),

            // Credit (loan) re-entered at closing. `credits` is
            // kept in sync so day totals use the final list.
            closingCredits: closingCredits,
            credits: closingCredits,

            difference,

            cashDifference,

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

        setClosingDigital(
          emptyDigital()
        );

        setClosingCredits([]);
        setClosingCreditReason("");
        setClosingCreditAmount("");

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
  // OPEN CLOSE-MODAL (digital money starts blank)
  // ----------------------------------------------------------

  const openCloseModal = () => {
    // Digital money starts blank so the final balances are re-entered
    setClosingDigital(emptyDigital());

    // Start from the credit already on the register; the
    // attendant can re-enter / edit it before closing.
    setClosingCredits(getCreditList(openRegister));
    setClosingCreditReason("");
    setClosingCreditAmount("");

    setShowCloseModal(true);
  };

  // ----------------------------------------------------------
  // EXPENSES
  // ----------------------------------------------------------

  const handleAddExpense =
    async () => {
      if (!openRegister) return;

      const reason =
        expenseReason.trim();

      const amount =
        Number(expenseAmount);

      if (!reason) {
        alert(
          "Please enter the expense reason."
        );
        return;
      }

      if (!amount || amount <= 0) {
        alert(
          "Please enter a valid expense amount."
        );
        return;
      }

      setSavingExpense(true);

      try {
        await updateDoc(
          doc(
            db,
            "cashRegisters",
            openRegister.id
          ),
          {
            expenses: arrayUnion({
              id: `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,
              reason,
              amount,
              createdAtMs: Date.now(),
              addedBy:
                profile?.name ||
                user?.displayName ||
                user?.email ||
                "Attendant",
            }),

            updatedAt:
              serverTimestamp(),
          }
        );

        setExpenseReason("");
        setExpenseAmount("");
      } catch (firebaseError) {
        console.error(
          "Add expense error:",
          firebaseError
        );

        alert(
          firebaseError.message ||
          "Unable to add expense."
        );
      } finally {
        setSavingExpense(false);
      }
    };

  const handleRemoveExpense =
    async (expenseId) => {
      if (!openRegister) return;

      if (
        !window.confirm(
          "Remove this expense?"
        )
      ) {
        return;
      }

      try {
        await updateDoc(
          doc(
            db,
            "cashRegisters",
            openRegister.id
          ),
          {
            expenses:
              getExpenseList(
                openRegister
              ).filter(
                (item) =>
                  item.id !== expenseId
              ),

            updatedAt:
              serverTimestamp(),
          }
        );
      } catch (firebaseError) {
        console.error(
          "Remove expense error:",
          firebaseError
        );

        alert(
          firebaseError.message ||
          "Unable to remove expense."
        );
      }
    };

  // ----------------------------------------------------------
  // CREDIT
  // ----------------------------------------------------------

  const handleAddCredit =
    async () => {
      if (!openRegister) return;

      const reason =
        creditReason.trim();

      const amount =
        Number(creditAmount);

      if (!reason) {
        alert(
          "Please enter the reason / person name."
        );
        return;
      }

      if (!amount || amount <= 0) {
        alert(
          "Please enter a valid credit amount."
        );
        return;
      }

      setSavingCredit(true);

      try {
        await updateDoc(
          doc(
            db,
            "cashRegisters",
            openRegister.id
          ),
          {
            credits: arrayUnion({
              id: `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,
              reason,
              amount,
              createdAtMs: Date.now(),
              addedBy:
                profile?.name ||
                user?.displayName ||
                user?.email ||
                "Attendant",
            }),

            updatedAt:
              serverTimestamp(),
          }
        );

        setCreditReason("");
        setCreditAmount("");
      } catch (firebaseError) {
        console.error(
          "Add credit error:",
          firebaseError
        );

        alert(
          firebaseError.message ||
          "Unable to add credit."
        );
      } finally {
        setSavingCredit(false);
      }
    };

  const handleRemoveCredit =
    async (creditId) => {
      if (!openRegister) return;

      if (
        !window.confirm(
          "Remove this credit entry?"
        )
      ) {
        return;
      }

      try {
        await updateDoc(
          doc(
            db,
            "cashRegisters",
            openRegister.id
          ),
          {
            credits:
              getCreditList(
                openRegister
              ).filter(
                (item) =>
                  item.id !== creditId
              ),

            ...(Array.isArray(openRegister.openingCredits)
              ? {
                openingCredits:
                  openRegister.openingCredits.filter(
                    (item) =>
                      item.id !== creditId
                  ),
              }
              : {}),

            updatedAt:
              serverTimestamp(),
          }
        );
      } catch (firebaseError) {
        console.error(
          "Remove credit error:",
          firebaseError
        );

        alert(
          firebaseError.message ||
          "Unable to remove credit."
        );
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
      "Overall Difference",
      ...DIGITAL_ACCOUNTS.map(
        (account) => account.label
      ),
      "Digital Total",
      "Total Money",
      "Expenses",
      "Expense Details",
      "Credit",
      "Credit Details",
      "Net Total",
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
          getOverallDifference(item),
          ...DIGITAL_ACCOUNTS.map(
            (account) =>
              Number(
                item.digitalBalances?.[
                account.key
                ]
              ) || 0
          ),
          getDayTotals(item).digital,
          getDayTotals(item).totalMoney,
          getDayTotals(item).expenses,
          getExpenseList(item)
            .map(
              (expense) =>
                `${expense.reason}: ${expense.amount}`
            )
            .join(" | "),
          getDayTotals(item).credits,
          getCreditList(item)
            .map(
              (credit) =>
                `${credit.reason}: ${credit.amount}`
            )
            .join(" | "),
          getDayTotals(item).net,
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
                      : "COIN TOTAL (₹)"}
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

  // ----------------------------------------------------------
  // DIGITAL MONEY EDITOR
  // ----------------------------------------------------------

  const renderDigitalEditor = (
    values,
    setter,
    disabled = false
  ) => (
    <div className="cash-digital-list">
      {DIGITAL_ACCOUNTS.map((item) => (
        <label
          className={`cash-digital-row ${disabled ? "disabled" : ""}`}
          key={item.key}
        >
          <div className="cash-digital-main">
            <div
              className={`cash-digital-symbol ${item.type}`}
            >
              {item.type === "wallet" ? (
                <Smartphone size={16} />
              ) : (
                <Landmark size={16} />
              )}
            </div>

            <div>
              <strong>{item.label}</strong>
              <span>
                {item.type === "wallet"
                  ? "WALLET"
                  : "BANK"}
              </span>
            </div>
          </div>

          <div className="cash-digital-input">
            <b>₹</b>

            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="0"
              value={values?.[item.key] ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setter({
                  ...values,
                  [item.key]:
                    event.target.value,
                })
              }
              aria-label={`${item.label} amount`}
            />
          </div>
        </label>
      ))}
    </div>
  );

  const renderExpenseRows = (
    list,
    removable = false
  ) =>
    list.length === 0 ? (
      <div className="cash-expense-empty">
        <Receipt size={16} />
        No expenses added yet
      </div>
    ) : (
      <div className="cash-expense-list">
        {list.map((item) => (
          <div
            className="cash-expense-item"
            key={item.id || `${item.reason}-${item.createdAtMs}`}
          >
            <div className="cash-expense-text">
              <strong>{item.reason}</strong>
              <span>
                {item.createdAtMs
                  ? formatDateTime(
                    item.createdAtMs
                  )
                  : ""}
              </span>
            </div>

            <div className="cash-expense-amount">
              −{formatCurrency(
                Number(item.amount) || 0
              )}
            </div>

            {removable && (
              <button
                type="button"
                className="cash-expense-remove"
                onClick={() =>
                  handleRemoveExpense(
                    item.id
                  )
                }
                aria-label="Remove expense"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    );

  const renderCreditRows = (
    list,
    removable = false
  ) =>
    list.length === 0 ? (
      <div className="cash-expense-empty">
        <Receipt size={16} />
        No credit added yet
      </div>
    ) : (
      <div className="cash-expense-list">
        {list.map((item) => (
          <div
            className="cash-expense-item"
            key={item.id || `${item.reason}-${item.createdAtMs}`}
          >
            <div className="cash-expense-text">
              <strong>{item.reason}</strong>
              <span>
                {item.createdAtMs
                  ? formatDateTime(
                    item.createdAtMs
                  )
                  : ""}
              </span>
            </div>

            <div className="cash-credit-amount">
              {formatCurrency(
                Number(item.amount) || 0
              )}
            </div>

            {removable && (
              <button
                type="button"
                className="cash-expense-remove"
                onClick={() =>
                  handleRemoveCredit(
                    item.id
                  )
                }
                aria-label="Remove credit"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    );

  // History detail: opening / closing digital money card
  const renderHistoryDigitalCard = (kind, title, digital) => (
    <div className="cash-history-breakdown-card">
      <div className="cash-history-breakdown-head">
        <div>
          <span
            className={`cash-breakdown-kicker ${kind === "CLOSE" ? "close" : ""}`}
          >
            {kind}
          </span>
          <h3>{title}</h3>
          <p>Bank and wallet balances.</p>
        </div>
        <div
          className={`cash-breakdown-total ${kind === "CLOSE" ? "close" : ""}`}
        >
          {digital ? formatCurrency(calculateDigitalTotal(digital)) : "—"}
        </div>
      </div>

      {digital ? (
        <div className="cash-history-denomination-list">
          {DIGITAL_ACCOUNTS.map((item) => {
            const amount = Number(digital?.[item.key] || 0);

            return (
              <div
                className={`cash-history-denomination ${amount > 0 ? "has-value" : ""}`}
                key={`${kind}-digital-${item.key}`}
              >
                <div className="cash-history-denomination-left">
                  <div
                    className={`cash-history-denomination-icon ${item.type === "wallet" ? "coin" : "note"}`}
                  >
                    {item.type === "wallet" ? (
                      <Smartphone size={14} />
                    ) : (
                      <Landmark size={14} />
                    )}
                  </div>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.type === "wallet" ? "WALLET" : "BANK"}</span>
                  </div>
                </div>
                <div className="cash-history-denomination-right">
                  <strong>{formatCurrency(amount)}</strong>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cash-history-not-closed">
          <LockKeyhole size={18} />
          <strong>Register is still open</strong>
          <span>Closing digital money will appear after the register is closed.</span>
        </div>
      )}
    </div>
  );

  // History detail: opening / closing credit (loan) card
  const renderHistoryCreditCard = (kind, title, list) => (
    <div className="cash-history-breakdown-card">
      <div className="cash-history-breakdown-head">
        <div>
          <span
            className={`cash-breakdown-kicker ${kind === "CLOSE" ? "close" : ""}`}
          >
            {kind}
          </span>
          <h3>{title}</h3>
          <p>Reasons / people and amounts on credit.</p>
        </div>
        <div
          className={`cash-breakdown-total ${kind === "CLOSE" ? "close" : ""}`}
        >
          {list ? formatCurrency(calculateCreditTotal(list)) : "—"}
        </div>
      </div>

      {list ? (
        <div className="cash-history-expense-body">
          {renderCreditRows(
            [...list].sort(
              (a, b) =>
                Number(b?.createdAtMs || 0) -
                Number(a?.createdAtMs || 0)
            ),
            false
          )}
        </div>
      ) : (
        <div className="cash-history-not-closed">
          <LockKeyhole size={18} />
          <strong>Register is still open</strong>
          <span>Closing credit will appear after the register is closed.</span>
        </div>
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

  // Closing total - opening total, shown live in the close popup
  const closeOverallDifference =
    closingModalTotal +
    closingDigitalTotal +
    closingCreditTotal -
    getOpeningTotal(openRegister);

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
                openCloseModal()
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
              Opening Overall Total
            </span>

            <div className="cash-stat-icon blue">
              <Banknote
                size={15}
              />
            </div>
          </div>

          <strong>
            {formatCurrency(
              openingTotal
            )}
          </strong>

          <small>
            Cash + digital + credit
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
                ? "Closing Overall Total"
                : "Current Overall Total"}
            </span>

            <div className="cash-stat-icon orange">
              <CircleDollarSign
                size={15}
              />
            </div>
          </div>

          <strong>
            {formatCurrency(
              currentOverallTotal
            )}
          </strong>

          <small>
            {currentRegister?.status ===
              "closed"
              ? "Cash + digital balances + credits"
              : "Expected cash + digital balances + credits"}
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
                  ? "Closing overall total"
                  : "Current overall total"}
              </span>

              <strong>
                {formatCurrency(
                  currentOverallTotal
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
                    Overall difference
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
                openCloseModal()
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
          DIGITAL MONEY + EXPENSES + DAY TOTAL
      ==================================================== */}

      {currentRegister && (
        <section className="cash-money-section">

          <div className="cash-money-grid">

            {/* DIGITAL MONEY */}

            <div className="cash-panel">

              <div className="cash-panel-head">
                <div className="cash-panel-icon blue">
                  <Landmark size={16} />
                </div>

                <div>
                  <div className="cash-section-label">
                    DIGITAL MONEY
                  </div>
                  <h3>Bank &amp; wallet balances</h3>
                </div>

                <div className="cash-panel-total">
                  {formatCurrency(
                    openRegister
                      ? digitalDraftTotal
                      : dayTotals.digital
                  )}
                </div>
              </div>

              {/* Read-only: balances are set when opening / closing the register */}
              {renderDigitalEditor(
                digitalDraft,
                setDigitalDraft,
                true
              )}
            </div>

            {/* EXPENSES + CREDIT (stacked) */}

            <div className="cash-panel-stack">

              {/* EXPENSES */}

              <div className="cash-panel">

                <div className="cash-panel-head">
                  <div className="cash-panel-icon red">
                    <Receipt size={16} />
                  </div>

                  <div>
                    <div className="cash-section-label">
                      EXPENSES
                    </div>
                    <h3>Today's expenses</h3>
                  </div>

                  <div className="cash-panel-total red">
                    {formatCurrency(
                      dayTotals.expenses
                    )}
                  </div>
                </div>

                {openRegister && (
                  <div className="cash-expense-form">
                    <input
                      type="text"
                      className="cash-expense-reason"
                      placeholder="Reason (e.g. Tea, Paper, Electricity)"
                      value={expenseReason}
                      onChange={(event) =>
                        setExpenseReason(
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleAddExpense();
                        }
                      }}
                      maxLength={80}
                    />

                    <div className="cash-expense-money">
                      <b>₹</b>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="Amount"
                        value={expenseAmount}
                        onChange={(event) =>
                          setExpenseAmount(
                            event.target.value
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleAddExpense();
                          }
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      className="cash-expense-add"
                      onClick={handleAddExpense}
                      disabled={savingExpense}
                    >
                      {savingExpense ? (
                        <RefreshCw
                          size={14}
                          className="spin"
                        />
                      ) : (
                        <Plus size={14} />
                      )}
                      Add
                    </button>
                  </div>
                )}

                {renderExpenseRows(
                  currentExpenses,
                  Boolean(openRegister)
                )}

              </div>

              {/* CREDIT */}

              <div className="cash-panel">

                <div className="cash-panel-head">
                  <div className="cash-panel-icon green">
                    <WalletCards size={16} />
                  </div>

                  <div>
                    <div className="cash-section-label">
                      CREDIT
                    </div>
                    <h3>Today's credit</h3>
                  </div>

                  <div className="cash-panel-total green">
                    {formatCurrency(
                      dayTotals.credits
                    )}
                  </div>
                </div>

                {openRegister && (
                  <div className="cash-expense-form">
                    <input
                      type="text"
                      className="cash-expense-reason"
                      placeholder="Reason / Person"
                      value={creditReason}
                      onChange={(event) =>
                        setCreditReason(
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleAddCredit();
                        }
                      }}
                      maxLength={80}
                    />

                    <div className="cash-expense-money">
                      <b>₹</b>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="Amount"
                        value={creditAmount}
                        onChange={(event) =>
                          setCreditAmount(
                            event.target.value
                          )
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleAddCredit();
                          }
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      className="cash-expense-add"
                      onClick={handleAddCredit}
                      disabled={savingCredit}
                    >
                      {savingCredit ? (
                        <RefreshCw
                          size={14}
                          className="spin"
                        />
                      ) : (
                        <Plus size={14} />
                      )}
                      Add
                    </button>
                  </div>
                )}

                {renderCreditRows(
                  currentCredits,
                  Boolean(openRegister)
                )}

              </div>

            </div>

          </div>

          {/* DAY TOTAL */}

          <div className="cash-day-total">

            <div className="cash-day-total-head">
              <div>
                <div className="cash-section-label light">
                  TOTAL AMOUNT OF THE DAY
                </div>
                <strong>
                  {formatCurrency(
                    dayTotals.net
                  )}
                </strong>
                <span>
                  {formatDate(
                    currentRegister.dateKey
                  )}
                  {" • "}
                  {openRegister
                    ? "Live (register open)"
                    : "Final (register closed)"}
                </span>
              </div>

              <div className="cash-day-total-icon">
                <CircleDollarSign size={22} />
              </div>
            </div>

            <div className="cash-day-total-lines">
              <div>
                <span>
                  Cash{" "}
                  {currentRegister.status === "closed"
                    ? "(counted)"
                    : "(expected)"}
                </span>
                <strong>
                  {formatCurrency(dayTotals.cash)}
                </strong>
              </div>

              <div>
                <span>Digital money</span>
                <strong>
                  {formatCurrency(
                    openRegister
                      ? digitalDraftTotal
                      : dayTotals.digital
                  )}
                </strong>
              </div>

              <div className="sum">
                <span>Total money</span>
                <strong>
                  {formatCurrency(
                    dayTotals.cash +
                    (openRegister
                      ? digitalDraftTotal
                      : dayTotals.digital)
                  )}
                </strong>
              </div>

              <div className="minus">
                <span>Expenses</span>
                <strong>
                  −{formatCurrency(
                    dayTotals.expenses
                  )}
                </strong>
              </div>

              <div className="credit">
                <span>Total credit of the day</span>
                <strong>
                  {formatCurrency(
                    dayTotals.credits
                  )}
                </strong>
              </div>
            </div>

          </div>

        </section>
      )}

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
                  <th>Status</th>
                  <th>Date</th>
                  <th>Opening Total</th>
                  <th>Closing Total</th>
                  <th>Overall Difference</th>
                </tr>
              </thead>

              <tbody>

                {filteredRegisters.map((item) => {
                  const itemDifference = getOverallDifference(item);
                  const itemClosingTotal = getClosingTotal(item);

                  return (
                    <tr
                      key={item.id}
                      className="cash-row-clickable"
                      tabIndex={0}
                      onClick={() => setSelectedHistoryRegister(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          setSelectedHistoryRegister(item);
                        }
                      }}
                    >

                      <td>
                        <span className={`cash-table-status ${item.status}`}>
                          <i />
                          {item.status}
                        </span>
                      </td>

                      <td>
                        <strong>{formatDate(item.dateKey)}</strong>
                        <small>{formatDateTime(item.openedAt)}</small>
                      </td>

                      <td>
                        <strong>{formatCurrency(getOpeningTotal(item))}</strong>
                      </td>

                      <td>
                        {itemClosingTotal === null ? (
                          "—"
                        ) : (
                          <strong>{formatCurrency(itemClosingTotal)}</strong>
                        )}
                      </td>

                      <td>
                        {item.status === "closed" ? (
                          <span
                            className={`cash-difference ${itemDifference > 0
                                ? "positive"
                                : itemDifference < 0
                                  ? "negative"
                                  : "zero"
                              }`}
                          >
                            {itemDifference > 0 ? "+" : ""}
                            {formatCurrency(itemDifference)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                    </tr>
                  );
                })}

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

            <div className="cash-modal-block">
              <div className="cash-modal-block-head">
                <div>
                  <span className="cash-section-label">
                    DIGITAL MONEY
                  </span>
                  <p>
                    Enter the balance in each bank / wallet.
                  </p>
                </div>

                <strong>
                  {formatCurrency(
                    openingDigitalTotal
                  )}
                </strong>
              </div>

              {renderDigitalEditor(
                openingDigital,
                setOpeningDigital
              )}
            </div>

            <div className="cash-modal-block">
              <div className="cash-modal-block-head">
                <div>
                  <span className="cash-section-label">
                    CREDIT (LOAN)
                  </span>
                  <p>
                    Add the reason / person and amount.
                  </p>
                </div>

                <strong>
                  {formatCurrency(
                    openingCreditTotal
                  )}
                </strong>
              </div>

              <div className="cash-expense-form">
                <input
                  type="text"
                  className="cash-expense-reason"
                  placeholder="Reason / Person"
                  value={openingCreditReason}
                  onChange={(event) =>
                    setOpeningCreditReason(
                      event.target.value
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleAddOpeningCredit();
                    }
                  }}
                  maxLength={80}
                />

                <div className="cash-expense-money">
                  <b>₹</b>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="Amount"
                    value={openingCreditAmount}
                    onChange={(event) =>
                      setOpeningCreditAmount(
                        event.target.value
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleAddOpeningCredit();
                      }
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="cash-expense-add"
                  onClick={handleAddOpeningCredit}
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>

              {openingCredits.length === 0 ? (
                <div className="cash-expense-empty">
                  <Receipt size={16} />
                  No credit added yet
                </div>
              ) : (
                <div className="cash-expense-list">
                  {openingCredits.map((item) => (
                    <div
                      className="cash-expense-item"
                      key={item.id}
                    >
                      <div className="cash-expense-text">
                        <strong>{item.reason}</strong>
                      </div>

                      <div className="cash-credit-amount">
                        {formatCurrency(
                          Number(item.amount) || 0
                        )}
                      </div>

                      <button
                        type="button"
                        className="cash-expense-remove"
                        onClick={() =>
                          handleRemoveOpeningCredit(
                            item.id
                          )
                        }
                        aria-label="Remove credit"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

            <div className="cash-modal-grand">
              <div>
                <span>Cash</span>
                <strong>{formatCurrency(openingModalTotal)}</strong>
              </div>
              <div>
                <span>Digital</span>
                <strong>{formatCurrency(openingDigitalTotal)}</strong>
              </div>
              <div>
                <span>Credit</span>
                <strong>{formatCurrency(openingCreditTotal)}</strong>
              </div>
              <div className="sum">
                <span>Total</span>
                <strong>
                  {formatCurrency(
                    openingModalTotal +
                    openingDigitalTotal +
                    openingCreditTotal
                  )}
                </strong>
              </div>
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
                  openingModalTotal +
                  openingDigitalTotal <=
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

              <div className="cash-modal-block">
                <div className="cash-modal-block-head">
                  <div>
                    <span className="cash-section-label">
                      DIGITAL MONEY
                    </span>
                    <p>
                      Final balance in each bank / wallet.
                    </p>
                  </div>

                  <strong>
                    {formatCurrency(
                      closingDigitalTotal
                    )}
                  </strong>
                </div>

                {renderDigitalEditor(
                  closingDigital,
                  setClosingDigital
                )}
              </div>

              <div className="cash-modal-block">
                <div className="cash-modal-block-head">
                  <div>
                    <span className="cash-section-label">
                      EXPENSES
                    </span>
                    <p>
                      Added during the day.
                    </p>
                  </div>

                  <strong className="red">
                    {formatCurrency(
                      calculateExpenseTotal(
                        openRegister.expenses
                      )
                    )}
                  </strong>
                </div>

                {renderExpenseRows(
                  [...getExpenseList(openRegister)].sort(
                    (a, b) =>
                      Number(b?.createdAtMs || 0) -
                      Number(a?.createdAtMs || 0)
                  ),
                  false
                )}
              </div>

              <div className="cash-modal-block">
                <div className="cash-modal-block-head">
                  <div>
                    <span className="cash-section-label">
                      CREDIT (LOAN)
                    </span>
                    <p>
                      Re-enter the final credit / loan list.
                    </p>
                  </div>

                  <strong>
                    {formatCurrency(
                      closingCreditTotal
                    )}
                  </strong>
                </div>

                <div className="cash-expense-form">
                  <input
                    type="text"
                    className="cash-expense-reason"
                    placeholder="Reason / Person"
                    value={closingCreditReason}
                    onChange={(event) =>
                      setClosingCreditReason(
                        event.target.value
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleAddClosingCredit();
                      }
                    }}
                    maxLength={80}
                  />

                  <div className="cash-expense-money">
                    <b>₹</b>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder="Amount"
                      value={closingCreditAmount}
                      onChange={(event) =>
                        setClosingCreditAmount(
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleAddClosingCredit();
                        }
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    className="cash-expense-add"
                    onClick={handleAddClosingCredit}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>

                {closingCredits.length === 0 ? (
                  <div className="cash-expense-empty">
                    <Receipt size={16} />
                    No credit added yet
                  </div>
                ) : (
                  <div className="cash-expense-list">
                    {[...closingCredits].map((item) => (
                      <div
                        className="cash-expense-item"
                        key={item.id}
                      >
                        <div className="cash-expense-text">
                          <strong>{item.reason}</strong>
                        </div>

                        <div className="cash-credit-amount">
                          {formatCurrency(
                            Number(item.amount) || 0
                          )}
                        </div>

                        <button
                          type="button"
                          className="cash-expense-remove"
                          onClick={() =>
                            handleRemoveClosingCredit(
                              item.id
                            )
                          }
                          aria-label="Remove credit"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                    closeOverallDifference > 0
                      ? "positive"
                      : closeOverallDifference < 0
                        ? "negative"
                        : "zero"
                  }
                >
                  <span>
                    Overall difference
                  </span>

                  <strong>
                    {closeOverallDifference > 0
                      ? "+"
                      : ""}
                    {formatCurrency(
                      closeOverallDifference
                    )}
                  </strong>
                </div>

              </div>

              <div className="cash-modal-grand close">
                <div>
                  <span>Counted cash</span>
                  <strong>{formatCurrency(closingModalTotal)}</strong>
                </div>
                <div>
                  <span>Digital</span>
                  <strong>{formatCurrency(closingDigitalTotal)}</strong>
                </div>
                <div>
                  <span>Expenses</span>
                  <strong>
                    −{formatCurrency(
                      calculateExpenseTotal(
                        openRegister.expenses
                      )
                    )}
                  </strong>
                </div>
                <div>
                  <span>Credit (Loan)</span>
                  <strong>
                    {formatCurrency(
                      closingCreditTotal
                    )}
                  </strong>
                </div>
                <div className="sum">
                  <span>Total of the day</span>
                  <strong>
                    {formatCurrency(
                      closingModalTotal +
                      closingDigitalTotal -
                      calculateExpenseTotal(
                        openRegister.expenses
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
                    closingModalTotal +
                    closingDigitalTotal <=
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

            <div className="cash-history-section-title">
              <WalletCards size={14} />
              Cash in Hand
            </div>

            <div className="cash-history-breakdown-grid">
              <div className="cash-history-breakdown-card">
                <div className="cash-history-breakdown-head">
                  <div>
                    <span className="cash-breakdown-kicker">OPEN</span>
                    <h3>Opening Cash in Hand</h3>
                    <p>Notes by count, coins as one total amount.</p>
                  </div>
                  <div className="cash-breakdown-total">
                    {formatCurrency(Number(selectedHistoryRegister.openingCash || 0))}
                  </div>
                </div>

                <div className="cash-history-denomination-list">
                  {DENOMINATIONS.map((item) => {
                    const pcs = getDenominationCount(selectedHistoryRegister.openingDenominations, item);
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
                          <strong>{item.type === "coin" ? "Total" : `${pcs} pcs`}</strong>
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
                    <h3>Closing Cash in Hand</h3>
                    <p>Notes by count, coins as one total amount.</p>
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
                      const pcs = getDenominationCount(selectedHistoryRegister.closingDenominations, item);
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
                            <strong>{item.type === "coin" ? "Total" : `${pcs} pcs`}</strong>
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

            <div className="cash-history-section-title">
              <Landmark size={14} />
              Digital Money
            </div>

            <div className="cash-history-extra-grid cash-history-pair-grid">
              {renderHistoryDigitalCard(
                "OPEN",
                "Opening Digital Money",
                getOpeningDigital(selectedHistoryRegister)
              )}
              {renderHistoryDigitalCard(
                "CLOSE",
                "Closing Digital Money",
                getClosingDigital(selectedHistoryRegister)
              )}
            </div>

            <div className="cash-history-section-title">
              <Receipt size={14} />
              Credit (Loan)
            </div>

            <div className="cash-history-extra-grid cash-history-pair-grid">
              {renderHistoryCreditCard(
                "OPEN",
                "Opening Credit (Loan)",
                getOpeningCredits(selectedHistoryRegister)
              )}
              {renderHistoryCreditCard(
                "CLOSE",
                "Closing Credit (Loan)",
                getClosingCredits(selectedHistoryRegister)
              )}
            </div>

            <div className="cash-history-section-title">
              <Receipt size={14} />
              Expenses
            </div>

            <div className="cash-history-extra-grid cash-history-pair-grid">
              <div
                className="cash-history-breakdown-card"
                style={{ gridColumn: "1 / -1" }}
              >
                <div className="cash-history-breakdown-head">
                  <div>
                    <span className="cash-breakdown-kicker close">EXPENSES</span>
                    <h3>Expenses</h3>
                    <p>Reasons and amounts spent in this session.</p>
                  </div>
                  <div className="cash-breakdown-total close">
                    {formatCurrency(getDayTotals(selectedHistoryRegister).expenses)}
                  </div>
                </div>

                <div className="cash-history-expense-body">
                  {renderExpenseRows(
                    [...getExpenseList(selectedHistoryRegister)].sort(
                      (a, b) =>
                        Number(b?.createdAtMs || 0) -
                        Number(a?.createdAtMs || 0)
                    ),
                    false
                  )}
                </div>
              </div>
            </div>

            <div className="cash-history-daytotal">
              <div>
                <span>Cash</span>
                <strong>{formatCurrency(getDayTotals(selectedHistoryRegister).cash)}</strong>
              </div>
              <div>
                <span>Digital</span>
                <strong>{formatCurrency(getDayTotals(selectedHistoryRegister).digital)}</strong>
              </div>
              <div>
                <span>Expenses</span>
                <strong>−{formatCurrency(getDayTotals(selectedHistoryRegister).expenses)}</strong>
              </div>
              <div>
                <span>Credit</span>
                <strong>{formatCurrency(getDayTotals(selectedHistoryRegister).credits)}</strong>
              </div>
              <div className="sum">
                <span>Day Total</span>
                <strong>{formatCurrency(getDayTotals(selectedHistoryRegister).net)}</strong>
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
                <span>Overall Difference</span>
                <strong className={
                  getOverallDifference(selectedHistoryRegister) > 0
                    ? "positive"
                    : getOverallDifference(selectedHistoryRegister) < 0
                      ? "negative"
                      : "zero"
                }>
                  {selectedHistoryRegister.status !== "closed"
                    ? "—"
                    : (
                      <>
                        {getOverallDifference(selectedHistoryRegister) > 0 ? "+" : ""}
                        {formatCurrency(getOverallDifference(selectedHistoryRegister))}
                      </>
                    )}
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