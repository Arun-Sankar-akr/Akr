import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  writeBatch,
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
  Pencil,
  FileText,
  FileSpreadsheet,
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

// A credit keeps its ORIGINAL amount and a running `paid` total.
// Balance (what is still owed) = amount - paid.
function getCreditPaid(item) {
  return Math.max(0, Number(item?.paid) || 0);
}

function getCreditBalance(item) {
  return Math.max(
    0,
    (Number(item?.amount) || 0) - getCreditPaid(item)
  );
}

// Returns a copy of a credit with one more payment logged in its history.
function addPaymentToCredit(item, payment) {
  return {
    ...item,
    paid: getCreditPaid(item) + payment,
    payments: [
      ...(Array.isArray(item.payments) ? item.payments : []),
      { amount: payment, atMs: Date.now() },
    ],
  };
}

// Full payment history of a credit (newest first). Payments made
// before history tracking existed are shown as one "earlier" line.
function getCreditPayments(item) {
  const list = (Array.isArray(item?.payments) ? item.payments : [])
    .map((entry, idx) => ({
      amount: Number(entry?.amount) || 0,
      atMs: entry?.atMs || 0,
      note: entry?.note || "",
      idx,
    }));

  const logged = list.reduce((sum, entry) => sum + entry.amount, 0);
  const missing = getCreditPaid(item) - logged;

  if (missing > 0) {
    list.push({
      amount: missing,
      atMs: item?.createdAtMs || 0,
      note: "Earlier payment",
      idx: -1,
    });
  }

  return list.sort((a, b) => b.atMs - a.atMs);
}

// Totals use the outstanding balance, so every repayment reduces them.
function calculateCreditTotal(credits) {
  return (Array.isArray(credits) ? credits : []).reduce(
    (total, item) => total + getCreditBalance(item),
    0
  );
}

// Effect of credit on every overall total:
//   amount given  -> only shown, NOT deducted from any total
//   paid / update -> added to the overall total
// i.e. overall = cash + digital + credit paid.
function calculateCreditEffect(credits) {
  return (Array.isArray(credits) ? credits : []).reduce(
    (total, item) => total + getCreditPaid(item),
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
      creditGiven: 0,
      creditPaid: 0,
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
  const creditList = getCreditList(register);

  // Credit split: given = original amounts, paid = repaid so far,
  // credits (not paid) = what is still owed.
  const creditGiven = creditList.reduce(
    (sum, item) => sum + (Number(item?.amount) || 0),
    0
  );
  const creditPaid = creditList.reduce(
    (sum, item) => sum + getCreditPaid(item),
    0
  );
  const credits = calculateCreditTotal(creditList);

  const totalMoney = cash + digital;

  // Day total = total money - expenses + credit paid (paid / update).
  // Credit given is only displayed, it is not deducted.
  return {
    cash,
    digital,
    expenses,
    credits,
    creditGiven,
    creditPaid,
    totalMoney,
    net:
      totalMoney -
      expenses +
      creditPaid,
  };
}

// ============================================================
// HELPERS
// ============================================================

// Credits that are still unpaid on the most recent earlier register.
// They are carried into every new day until fully paid, so a loan
// stays visible on all days after it was given.
function getCarryForwardCredits(registers, todayKey) {
  const list = (Array.isArray(registers) ? registers : []).filter(
    (item) => item?.dateKey && item.dateKey <= todayKey
  );

  if (list.length === 0) return [];

  const stamp = (item) =>
    Number(item?.createdAt?.seconds || 0) ||
    Number(item?.openedAt?.seconds || 0) ||
    0;

  const latest = [...list].sort((a, b) =>
    a.dateKey === b.dateKey
      ? stamp(b) - stamp(a)
      : a.dateKey < b.dateKey
        ? 1
        : -1
  )[0];

  const source =
    latest.status === "closed" && Array.isArray(latest.closingCredits)
      ? latest.closingCredits
      : Array.isArray(latest.credits)
        ? latest.credits
        : [];

  return source
    .filter((item) => getCreditBalance(item) > 0)
    .map((item) => ({ ...item, carriedOver: true }));
}

// The most recent CLOSED register (by date, then time). Its closing
// notes / coins / digital money become the next opening values.
function getLastClosedRegister(registers, todayKey) {
  const list = (Array.isArray(registers) ? registers : []).filter(
    (item) =>
      item?.status === "closed" &&
      item?.dateKey &&
      item.dateKey <= todayKey
  );

  if (list.length === 0) return null;

  const stamp = (item) =>
    getTimestampValue(item.closedAt) ||
    getTimestampValue(item.updatedAt) ||
    getTimestampValue(item.createdAt) ||
    0;

  return [...list].sort((a, b) =>
    a.dateKey === b.dateKey
      ? stamp(b) - stamp(a)
      : a.dateKey < b.dateKey
        ? 1
        : -1
  )[0];
}

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

// Opening total = opening cash + opening digital + credit paid.
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
    calculateCreditEffect(getOpeningCredits(register))
  );
}

// Closing total = counted cash + digital + credit paid
// (closed registers only).
function getClosingTotal(register) {
  if (!register || register.status !== "closed") return null;

  const totals = getDayTotals(register);

  return (
    totals.cash +
    totals.digital +
    calculateCreditEffect(getCreditList(register))
  );
}

// Overall difference = closing total - opening total
// (cash + digital money + credit paid, at close minus open).
function getOverallDifference(register) {
  const closingTotal = getClosingTotal(register);

  if (closingTotal === null) return 0;

  return closingTotal - getOpeningTotal(register);
}

// Total money = total amount of the day (net) + credit NOT paid yet.
// Credit that was already paid is inside the net total (paid / update),
// so only the unpaid balance is added - otherwise it would be counted twice.
function getTotalMoney(register) {
  if (!register) return 0;

  const totals = getDayTotals(register);

  return totals.net + totals.credits;
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

  // Export format chooser (PDF / Excel)
  const [showExportModal, setShowExportModal] =
    useState(false);

  const [exporting, setExporting] =
    useState("");

  // Which list the export box is exporting: "history" | "credit"
  const [exportTarget, setExportTarget] =
    useState("history");

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

  // Amount already paid by the person (reduces the initial amount)
  const [creditPaid, setCreditPaid] =
    useState("");

  // Credit preview box: { id, source: "live" | "opening" | "closing" | "history", item? }
  const [creditDetail, setCreditDetail] =
    useState(null);

  const [creditDetailPay, setCreditDetailPay] =
    useState("");

  const [creditDetailSaving, setCreditDetailSaving] =
    useState(false);

  // Edit mode inside the credit box: { reason, amount } | null
  const [creditEdit, setCreditEdit] =
    useState(null);

  // Payment being edited inside the credit box: { idx, value } | null
  const [creditPayEdit, setCreditPayEdit] =
    useState(null);

  const [savingCredit, setSavingCredit] =
    useState(false);

  // Credit entered while opening the register
  const [openingCredits, setOpeningCredits] =
    useState([]);

  const [openingCreditReason, setOpeningCreditReason] =
    useState("");

  const [openingCreditAmount, setOpeningCreditAmount] =
    useState("");

  const [openingCreditPaid, setOpeningCreditPaid] =
    useState("");

  // Credit (loan) re-entered while closing the register
  const [closingCredits, setClosingCredits] =
    useState([]);

  const [closingCreditReason, setClosingCreditReason] =
    useState("");

  const [closingCreditAmount, setClosingCreditAmount] =
    useState("");

  const [closingCreditPaid, setClosingCreditPaid] =
    useState("");

  // Transaction history CRUD (create / edit entry)
  const [entryModal, setEntryModal] = useState(null); // { mode, id, status }
  const [entryDate, setEntryDate] = useState("");
  const [entryOpenDen, setEntryOpenDen] = useState(emptyDenominations());
  const [entryOpenDigital, setEntryOpenDigital] = useState(emptyDigital());
  const [entryCloseDen, setEntryCloseDen] = useState(emptyDenominations());
  const [entryCloseDigital, setEntryCloseDigital] = useState(emptyDigital());
  // Credit / loan rows of the entry: { key, reason, amount, paid, orig }
  const [entryCredits, setEntryCredits] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

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

  // Overall register balance = drawer cash + digital balances
  // + credit paid (credit given is only shown).
  const currentOverallTotal =
    currentRegister?.status === "closed"
      ? Number(getClosingTotal(currentRegister) || 0)
      : currentCash +
      calculateDigitalTotal(currentRegister?.digitalBalances) +
      calculateCreditEffect(getCreditList(currentRegister));

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

  // Every credit / loan from every day (latest state of each one),
  // newest first. Used by the "Credit / Loan history" card.
  const allCreditHistory = useMemo(() => {
    const stamp = (item) =>
      Number(item?.createdAt?.seconds || 0) ||
      Number(item?.openedAt?.seconds || 0) ||
      0;

    const ordered = [...registers].sort((a, b) => {
      const keyA = String(a?.dateKey || "");
      const keyB = String(b?.dateKey || "");

      if (keyA === keyB) return stamp(a) - stamp(b);
      return keyA < keyB ? -1 : 1;
    });

    // Oldest register first, so a later (newer) copy of the same
    // credit replaces the older one.
    const map = new Map();

    ordered.forEach((reg) => {
      const list =
        reg?.status === "closed" && Array.isArray(reg.closingCredits)
          ? reg.closingCredits
          : getCreditList(reg);

      list.forEach((item) => {
        const key = item.id || `${item.reason}-${item.createdAtMs}`;
        map.set(key, { ...item });
      });
    });

    return [...map.values()].sort(
      (a, b) =>
        Number(b?.createdAtMs || 0) - Number(a?.createdAtMs || 0)
    );
  }, [registers]);

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
    const paid = Number(openingCreditPaid) || 0;

    if (!reason) {
      alert("Please enter the reason / person name.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("Please enter a valid credit amount.");
      return;
    }

    if (paid < 0 || paid > amount) {
      alert("Paid amount cannot be more than the credit amount.");
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
        paid,
        payments:
          paid > 0
            ? [
              {
                amount: paid,
                atMs: Date.now(),
                note: "Paid at entry",
              },
            ]
            : [],
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
    setOpeningCreditPaid("");
  };

  const handleRemoveOpeningCredit = (creditId) => {
    setOpeningCredits((prev) =>
      prev.filter((item) => item.id !== creditId)
    );
  };

  const handleAddClosingCredit = () => {
    const reason = closingCreditReason.trim();
    const amount = Number(closingCreditAmount);
    const paid = Number(closingCreditPaid) || 0;

    if (!reason) {
      alert("Please enter the reason / person name.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("Please enter a valid credit amount.");
      return;
    }

    if (paid < 0 || paid > amount) {
      alert("Paid amount cannot be more than the credit amount.");
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
        paid,
        payments:
          paid > 0
            ? [
              {
                amount: paid,
                atMs: Date.now(),
                note: "Paid at entry",
              },
            ]
            : [],
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
    setClosingCreditPaid("");
  };

  const handleRemoveClosingCredit = (creditId) => {
    setClosingCredits((prev) =>
      prev.filter((item) => item.id !== creditId)
    );
  };

  // Opening a new day pre-fills every credit that is still unpaid
  // from the previous register, so loans show on all days.
  const openOpenModal = () => {
    // Pre-fill cash + digital money with the last closing values.
    const lastClosed = getLastClosedRegister(registers, getDateKey());

    if (lastClosed) {
      setOpeningDenominations(
        DENOMINATIONS.reduce((acc, item) => {
          acc[item.value] = getDenominationCount(
            lastClosed.closingDenominations,
            item
          );
          return acc;
        }, {})
      );
      setOpeningDigital(
        digitalToInputs(getClosingDigital(lastClosed))
      );
    } else {
      setOpeningDenominations(emptyDenominations());
      setOpeningDigital(emptyDigital());
    }

    setOpeningCredits(
      getCarryForwardCredits(registers, getDateKey())
    );
    setOpeningCreditReason("");
    setOpeningCreditAmount("");
    setOpeningCreditPaid("");
    setShowOpenModal(true);
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
        setOpeningCreditPaid("");

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
          calculateCreditEffect(closingCredits) -
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
        setClosingCreditPaid("");

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
    setClosingCreditPaid("");

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

      const paid =
        Number(creditPaid) || 0;

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

      if (paid < 0 || paid > amount) {
        alert(
          "Paid amount cannot be more than the credit amount."
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
              paid,
              payments:
                paid > 0
                  ? [
                    {
                      amount: paid,
                      atMs: Date.now(),
                      note: "Paid at entry",
                    },
                  ]
                  : [],
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
        setCreditPaid("");
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

  // ----------------------------------------------------------
  // CREDIT PREVIEW BOX
  // ----------------------------------------------------------

  const openCreditDetail = (source, item) => {
    setCreditDetailPay("");
    setCreditEdit(null);
    setCreditPayEdit(null);
    setCreditDetail(
      source === "history" || source === "all"
        ? { source, id: item.id, item }
        : { source, id: item.id }
    );
  };

  // Always read the latest copy so the box updates after a payment.
  const creditDetailItem = (() => {
    if (!creditDetail) return null;

    if (creditDetail.source === "history") return creditDetail.item;

    // All-days history: always use the latest copy so the box
    // updates right after a payment.
    if (creditDetail.source === "all") {
      return (
        allCreditHistory.find((item) => item.id === creditDetail.id) ||
        creditDetail.item ||
        null
      );
    }

    const list =
      creditDetail.source === "opening"
        ? openingCredits
        : creditDetail.source === "closing"
          ? closingCredits
          : getCreditList(openRegister);

    return list.find((item) => item.id === creditDetail.id) || null;
  })();

  const handleCreditDetailPay = async () => {
    if (!creditDetail || !creditDetailItem) return;

    const payment = Number(creditDetailPay);
    const balance = getCreditBalance(creditDetailItem);

    if (!payment || payment <= 0) {
      alert("Please enter the amount received.");
      return;
    }

    if (payment > balance) {
      alert(
        `Amount is more than the balance (${formatCurrency(balance)}).`
      );
      return;
    }

    const apply = (list) =>
      list.map((item) =>
        item.id === creditDetail.id
          ? addPaymentToCredit(item, payment)
          : item
      );

    if (creditDetail.source === "opening") {
      setOpeningCredits(apply);
      setCreditDetailPay("");
      return;
    }

    if (creditDetail.source === "closing") {
      setClosingCredits(apply);
      setCreditDetailPay("");
      return;
    }

    const isAll = creditDetail.source === "all";

    if (!isAll && creditDetail.source !== "live") return;

    if (!openRegister) {
      alert("Open today's register to record a payment.");
      return;
    }

    // A credit from the all-days list is paid inside today's open
    // register, where every unpaid credit is carried forward.
    if (
      isAll &&
      !getCreditList(openRegister).some(
        (item) => item.id === creditDetail.id
      )
    ) {
      alert("This credit is not in today's open register.");
      return;
    }

    setCreditDetailSaving(true);

    try {
      await updateDoc(
        doc(db, "cashRegisters", openRegister.id),
        {
          credits: apply(getCreditList(openRegister)),
          updatedAt: serverTimestamp(),
        }
      );

      setCreditDetailPay("");
    } catch (firebaseError) {
      console.error("Pay credit error:", firebaseError);

      alert(
        firebaseError.message ||
        "Unable to record payment."
      );
    } finally {
      setCreditDetailSaving(false);
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
  // CREDIT  -  EDIT / DELETE  (inside the credit box)
  // Works on today's open register, where every unpaid credit lives.
  // ----------------------------------------------------------

  const closeCreditDetail = () => {
    setCreditDetail(null);
    setCreditEdit(null);
    setCreditPayEdit(null);
  };

  // Applies `transform` to the open credit shown in the box and saves it.
  const saveOpenCredit = async (transform) => {
    if (!openRegister || !creditDetail) return false;

    setCreditDetailSaving(true);

    try {
      await updateDoc(
        doc(db, "cashRegisters", openRegister.id),
        {
          credits: getCreditList(openRegister).map((item) =>
            item.id === creditDetail.id ? transform(item) : item
          ),
          updatedAt: serverTimestamp(),
        }
      );

      return true;
    } catch (firebaseError) {
      console.error("Update credit error:", firebaseError);

      alert(
        firebaseError.message ||
        "Unable to update credit."
      );

      return false;
    } finally {
      setCreditDetailSaving(false);
    }
  };

  // UPDATE: change the name / reason and the total credit amount.
  // Opens the credit box straight in edit mode (from the history table).
  const startCreditEditFromTable = (item) => {
    const inOpen =
      Boolean(openRegister) &&
      getCreditList(openRegister).some(
        (entry) => entry.id === item.id
      );

    if (!inOpen) {
      alert("Open today's register to edit this credit.");
      return;
    }

    openCreditDetail("all", item);
    setCreditEdit({
      reason: item.reason || "",
      amount: String(Number(item.amount) || 0),
    });
  };

  const handleSaveCreditEdit = async () => {
    if (!creditEdit || !creditDetailItem) return;

    const reason = creditEdit.reason.trim();
    const amount = Number(creditEdit.amount);
    const paid = getCreditPaid(creditDetailItem);

    if (!reason) {
      alert("Please enter the reason / person name.");
      return;
    }

    if (!amount || amount <= 0) {
      alert("Please enter a valid credit amount.");
      return;
    }

    if (amount < paid) {
      alert(
        `Credit amount cannot be less than what is already paid (${formatCurrency(paid)}).`
      );
      return;
    }

    const ok = await saveOpenCredit((item) => ({
      ...item,
      reason,
      amount,
    }));

    if (ok) setCreditEdit(null);
  };

  // UPDATE: change the amount of one payment.
  const handleSavePaymentEdit = async () => {
    if (!creditPayEdit || !creditDetailItem) return;

    const value = Number(creditPayEdit.value);
    const payments = Array.isArray(creditDetailItem.payments)
      ? creditDetailItem.payments
      : [];
    const current = Number(payments[creditPayEdit.idx]?.amount) || 0;

    if (!value || value <= 0) {
      alert("Please enter a valid payment amount.");
      return;
    }

    const newPaid = getCreditPaid(creditDetailItem) - current + value;

    if (newPaid > (Number(creditDetailItem.amount) || 0)) {
      alert("Total paid cannot be more than the credit amount.");
      return;
    }

    const ok = await saveOpenCredit((item) => ({
      ...item,
      paid: newPaid,
      payments: (Array.isArray(item.payments) ? item.payments : []).map(
        (entry, index) =>
          index === creditPayEdit.idx
            ? { ...entry, amount: value }
            : entry
      ),
    }));

    if (ok) setCreditPayEdit(null);
  };

  // DELETE: remove one payment (the amount goes back to "Not paid").
  const handleDeleteCreditPayment = async (entry) => {
    if (!creditDetailItem) return;

    if (
      !window.confirm(
        `Remove this payment of ${formatCurrency(entry.amount)}? It will be added back to "Not paid".`
      )
    ) {
      return;
    }

    await saveOpenCredit((item) => {
      const payments = Array.isArray(item.payments) ? item.payments : [];

      // Payment made before history tracking existed ("Earlier payment")
      if (entry.idx < 0) {
        const logged = payments.reduce(
          (sum, row) => sum + (Number(row?.amount) || 0),
          0
        );

        return { ...item, paid: logged };
      }

      return {
        ...item,
        paid: Math.max(0, getCreditPaid(item) - entry.amount),
        payments: payments.filter((_, index) => index !== entry.idx),
      };
    });
  };

  // DELETE: remove the whole credit from every day it appears in.
  const handleDeleteCreditEverywhere = async (target = creditDetailItem) => {
    if (!target) return;

    if (
      !window.confirm(
        `Delete the credit "${target.reason}" (${formatCurrency(
          Number(target.amount) || 0
        )}) and all its payments? This also removes it from earlier days and cannot be undone.`
      )
    ) {
      return;
    }

    const id = target.id;
    const fields = ["credits", "openingCredits", "closingCredits"];

    setCreditDetailSaving(true);

    try {
      const batch = writeBatch(db);
      let touched = 0;

      registers.forEach((register) => {
        const patch = {};

        fields.forEach((field) => {
          if (
            Array.isArray(register?.[field]) &&
            register[field].some((item) => item?.id === id)
          ) {
            patch[field] = register[field].filter(
              (item) => item?.id !== id
            );
          }
        });

        if (Object.keys(patch).length > 0) {
          batch.update(doc(db, "cashRegisters", register.id), {
            ...patch,
            updatedAt: serverTimestamp(),
          });
          touched += 1;
        }
      });

      if (touched > 0) await batch.commit();

      if (creditDetail?.id === id) closeCreditDetail();
    } catch (firebaseError) {
      console.error("Delete credit error:", firebaseError);

      alert(
        firebaseError.message ||
        "Unable to delete credit."
      );
    } finally {
      setCreditDetailSaving(false);
    }
  };

  // ----------------------------------------------------------
  // EXPORT  (PDF / EXCEL)
  //
  // Columns: Date | Opening (Cash, Digital, Credit, Total)
  //          | Closing (Cash, Digital, Credit, Total) | Difference
  // Open (not yet closed) registers show "—" for closing + difference.
  // ----------------------------------------------------------

  const buildExportRows = () =>
    [...filteredRegisters]
      .sort((a, b) =>
        String(a.dateKey || "").localeCompare(
          String(b.dateKey || "")
        )
      )
      .map((item) => {
        const closed = item.status === "closed";

        return {
          date: formatDate(item.dateKey),
          openCash: Number(item.openingCash || 0),
          openDigital: calculateDigitalTotal(
            getOpeningDigital(item)
          ),
          openCredit: calculateCreditTotal(
            getOpeningCredits(item)
          ),
          openTotal: getOpeningTotal(item),
          closeCash: closed
            ? Number(item.closingCash || 0)
            : null,
          closeDigital: closed
            ? calculateDigitalTotal(
              getClosingDigital(item)
            )
            : null,
          closeCredit: closed
            ? calculateCreditTotal(
              getClosingCredits(item) || []
            )
            : null,
          closeTotal: closed
            ? getClosingTotal(item)
            : null,
          difference: closed
            ? getOverallDifference(item)
            : null,
          totalMoney: getTotalMoney(item),
        };
      });

  const exportExcel = async (rows) => {
    const XLSX = await import("xlsx");

    const money = (value) =>
      value === null ? "—" : Number(value);

    const aoa = [
      [
        "Date",
        "Opening", "", "", "",
        "Closing", "", "", "",
        "Difference",
        "Total Money",
      ],
      [
        "",
        "Cash", "Digital Money", "Credit (not paid)", "Total",
        "Cash", "Digital Money", "Credit (not paid)", "Total",
        "",
        "",
      ],
      ...rows.map((row) => [
        row.date,
        money(row.openCash),
        money(row.openDigital),
        money(row.openCredit),
        money(row.openTotal),
        money(row.closeCash),
        money(row.closeDigital),
        money(row.closeCredit),
        money(row.closeTotal),
        money(row.difference),
        money(row.totalMoney),
      ]),
    ];

    const sheet = XLSX.utils.aoa_to_sheet(aoa);

    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 0, c: 4 } },
      { s: { r: 0, c: 5 }, e: { r: 0, c: 8 } },
      { s: { r: 0, c: 9 }, e: { r: 1, c: 9 } },
      { s: { r: 0, c: 10 }, e: { r: 1, c: 10 } },
    ];

    sheet["!cols"] = [
      { wch: 14 },
      ...Array(8).fill({ wch: 15 }),
      { wch: 15 },
      { wch: 15 },
    ];

    // Rupee number format on every amount cell
    for (let r = 2; r < aoa.length; r += 1) {
      for (let c = 1; c <= 10; c += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];

        if (cell && typeof cell.v === "number") {
          cell.t = "n";
          cell.z = "#,##0.00";
        }
      }
    }

    const book = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      book,
      sheet,
      "Register History"
    );

    XLSX.writeFile(
      book,
      `cash-register-history-${todayKey}.xlsx`
    );
  };

  const exportPdf = async (rows) => {
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable =
      autoTableModule.default || autoTableModule.autoTable;

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    // The default PDF font has no rupee glyph, so amounts use "Rs."
    const money = (value) =>
      value === null
        ? "—"
        : Number(value).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(46, 16, 101);
    pdf.text("Cash Register History", 40, 42);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 110);
    pdf.text(
      `Amounts in Rs.  |  Total = Cash + Digital - Credit not paid  |  Total Money = Total amount of the day + Credit not paid  |  ${rows.length} record(s)  |  Generated ${new Date().toLocaleString()}`,
      40,
      58
    );

    autoTable(pdf, {
      startY: 74,
      theme: "grid",
      head: [
        [
          { content: "Date", rowSpan: 2 },
          { content: "Opening", colSpan: 4 },
          { content: "Closing", colSpan: 4 },
          { content: "Difference", rowSpan: 2 },
          { content: "Total Money", rowSpan: 2 },
        ],
        [
          "Cash",
          "Digital Money",
          "Credit (not paid)",
          "Total",
          "Cash",
          "Digital Money",
          "Credit (not paid)",
          "Total",
        ],
      ],
      body: rows.map((row) => [
        row.date,
        money(row.openCash),
        money(row.openDigital),
        money(row.openCredit),
        money(row.openTotal),
        money(row.closeCash),
        money(row.closeDigital),
        money(row.closeCredit),
        money(row.closeTotal),
        row.difference === null
          ? "—"
          : `${row.difference > 0 ? "+" : ""}${money(row.difference)}`,
        money(row.totalMoney),
      ]),
      styles: {
        fontSize: 8.5,
        cellPadding: 5,
        halign: "right",
        lineColor: [226, 222, 240],
        lineWidth: 0.5,
        textColor: [30, 24, 48],
      },
      headStyles: {
        fillColor: [76, 29, 149],
        textColor: [255, 255, 255],
        halign: "center",
        valign: "middle",
        fontStyle: "bold",
      },
      columnStyles: {
        0: { halign: "left", fontStyle: "bold" },
        9: { fontStyle: "bold" },
        10: { fontStyle: "bold" },
      },
      alternateRowStyles: {
        fillColor: [247, 244, 255],
      },
      didParseCell: (data) => {
        if (data.section === "head" && data.row.index === 1) {
          data.cell.styles.fillColor = [109, 40, 217];
        }

        if (data.section === "body" && data.column.index === 9) {
          const row = rows[data.row.index];

          if (row && row.difference > 0) {
            data.cell.styles.textColor = [11, 138, 90];
          } else if (row && row.difference < 0) {
            data.cell.styles.textColor = [216, 64, 76];
          }
        }
      },
    });

    pdf.save(`cash-register-history-${todayKey}.pdf`);
  };

  // ----------------------------------------------------------
  // CREDIT / LOAN HISTORY EXPORT (all days)
  //
  // Columns: Date | Name / Reason | Amount Credit | Amount Paid
  //          | Amount Not Paid   (+ a Total row)
  // ----------------------------------------------------------

  const buildCreditExportRows = () => {
    const rows = [...allCreditHistory]
      .sort(
        (a, b) =>
          Number(a?.createdAtMs || 0) - Number(b?.createdAtMs || 0)
      )
      .map((item) => {
        const credit = Number(item.amount) || 0;
        const paid = getCreditPaid(item);

        return {
          date: item.createdAtMs ? formatDate(item.createdAtMs) : "—",
          name: item.reason || "",
          credit,
          paid,
          notPaid: getCreditBalance(item),
          percent: credit > 0 ? Math.min(1, paid / credit) : 1,
        };
      });

    return rows;
  };

  const exportCreditExcel = async (rows) => {
    const XLSX = await import("xlsx");

    const totals = rows.reduce(
      (sum, row) => ({
        credit: sum.credit + row.credit,
        paid: sum.paid + row.paid,
        notPaid: sum.notPaid + row.notPaid,
      }),
      { credit: 0, paid: 0, notPaid: 0 }
    );

    const aoa = [
      [
        "Date",
        "Name / Reason",
        "Amount Credit",
        "Amount Paid",
        "Amount Not Paid",
      ],
      ...rows.map((row) => [
        row.date,
        row.name,
        row.credit,
        row.paid,
        row.notPaid,
      ]),
      ["Total", "", totals.credit, totals.paid, totals.notPaid],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(aoa);

    sheet["!cols"] = [
      { wch: 14 },
      { wch: 30 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
    ];

    for (let r = 1; r < aoa.length; r += 1) {
      for (let c = 2; c <= 4; c += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];

        if (cell && typeof cell.v === "number") {
          cell.t = "n";
          cell.z = "#,##0.00";
        }
      }
    }

    const book = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(book, sheet, "Credit History");

    XLSX.writeFile(book, `credit-loan-history-${todayKey}.xlsx`);
  };

  const exportCreditPdf = async (rows) => {
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable =
      autoTableModule.default || autoTableModule.autoTable;

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    const money = (value) =>
      Number(value).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const totals = rows.reduce(
      (sum, row) => ({
        credit: sum.credit + row.credit,
        paid: sum.paid + row.paid,
        notPaid: sum.notPaid + row.notPaid,
      }),
      { credit: 0, paid: 0, notPaid: 0 }
    );

    // Light row tint: red (nothing paid) -> green (fully paid)
    const tint = (percent) => {
      const hue = percent * 135;
      const light = 0.93;
      const sat = 0.85;
      const a = sat * Math.min(light, 1 - light);
      const channel = (n) => {
        const k = (n + hue / 30) % 12;
        return Math.round(
          255 *
          (light -
            a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
        );
      };

      return [channel(0), channel(8), channel(4)];
    };

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(46, 16, 101);
    pdf.text("Credit / Loan History (all days)", 40, 42);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 100, 110);
    pdf.text(
      `Amounts in Rs.  |  Not Paid = Credit - Paid  |  ${rows.length} record(s)  |  Generated ${new Date().toLocaleString()}`,
      40,
      58
    );

    autoTable(pdf, {
      startY: 74,
      theme: "grid",
      head: [
        [
          "Date",
          "Name / Reason",
          "Amount Credit",
          "Amount Paid",
          "Amount Not Paid",
        ],
      ],
      body: [
        ...rows.map((row) => [
          row.date,
          row.name,
          money(row.credit),
          money(row.paid),
          money(row.notPaid),
        ]),
        [
          "Total",
          "",
          money(totals.credit),
          money(totals.paid),
          money(totals.notPaid),
        ],
      ],
      styles: {
        fontSize: 8.5,
        cellPadding: 5,
        halign: "right",
        lineColor: [226, 222, 240],
        lineWidth: 0.5,
        textColor: [30, 24, 48],
      },
      headStyles: {
        fillColor: [76, 29, 149],
        textColor: [255, 255, 255],
        halign: "center",
        valign: "middle",
        fontStyle: "bold",
      },
      columnStyles: {
        0: { halign: "left", fontStyle: "bold" },
        1: { halign: "left" },
        4: { fontStyle: "bold" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;

        const row = rows[data.row.index];

        if (!row) {
          // Total row
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [237, 233, 254];
          return;
        }

        data.cell.styles.fillColor = tint(row.percent);

        if (data.column.index === 3) {
          data.cell.styles.textColor = [11, 138, 90];
        } else if (data.column.index === 4) {
          data.cell.styles.textColor =
            row.notPaid > 0 ? [216, 64, 76] : [11, 138, 90];
        }
      },
    });

    pdf.save(`credit-loan-history-${todayKey}.pdf`);
  };

  const handleExport = async (format) => {
    const isCredit = exportTarget === "credit";

    if (
      (isCredit ? allCreditHistory : filteredRegisters).length === 0
    ) {
      alert("No records available to export.");
      return;
    }

    setExporting(format);

    try {
      if (isCredit) {
        const creditRows = buildCreditExportRows();

        if (format === "pdf") {
          await exportCreditPdf(creditRows);
        } else {
          await exportCreditExcel(creditRows);
        }
      } else {
        const rows = buildExportRows();

        if (format === "pdf") {
          await exportPdf(rows);
        } else {
          await exportExcel(rows);
        }
      }

      setShowExportModal(false);
    } catch (exportError) {
      console.error("Export error:", exportError);

      alert(
        "Unable to create the file. Make sure the xlsx, jspdf and jspdf-autotable packages are installed."
      );
    } finally {
      setExporting("");
    }
  };

  // ----------------------------------------------------------
  // DENOMINATION EDITOR
  // ----------------------------------------------------------

  const renderDenominationEditor = (
    values,
    setter,
    single = false
  ) => (
    <div className={`cash-denomination-list ${single ? "single" : ""}`}>
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

  // ----------------------------------------------------------
  // CASH (left) + DIGITAL MONEY (right) SPLIT LAYOUT
  // 500, 200, 100, 50, 20, 10, coins, total  |  digital money
  // ----------------------------------------------------------

  const renderCashDigitalSplit = (
    denoms,
    setDenoms,
    digital,
    setDigital
  ) => {
    const cashTotal = calculateDenominationTotal(denoms);
    const digitalTotal = calculateDigitalTotal(digital);

    return (
      <div className="cash-split">
        <div className="cash-split-col">
          {renderDenominationEditor(denoms, setDenoms, true)}

          <div className="cash-split-total">
            <div>
              <span>Total</span>
              <strong>{formatCurrency(cashTotal)}</strong>
            </div>
            <WalletCards size={18} />
          </div>
        </div>

        <div className="cash-modal-block cash-split-digital">
          <div className="cash-modal-block-head">
            <div>
              <span className="cash-section-label">DIGITAL MONEY</span>
              <p>Enter the balance in each bank / wallet.</p>
            </div>

            <strong>{formatCurrency(digitalTotal)}</strong>
          </div>

          {renderDigitalEditor(digital, setDigital)}
        </div>
      </div>
    );
  };

  // ----------------------------------------------------------
  // TRANSACTION HISTORY  -  CREATE / EDIT / DELETE
  // ----------------------------------------------------------

  const denominationsToInputs = (denominations) =>
    DENOMINATIONS.reduce((acc, item) => {
      acc[item.value] = getDenominationCount(denominations, item);
      return acc;
    }, {});

  const makeCreditRow = (orig = null) => ({
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reason: orig?.reason || "",
    amount: orig ? String(Number(orig.amount) || 0) : "",
    paid: orig ? String(getCreditPaid(orig) || "") : "",
    orig,
  });

  const updateEntryCredit = (key, field, value) =>
    setEntryCredits((rows) =>
      rows.map((row) =>
        row.key === key ? { ...row, [field]: value } : row
      )
    );

  // Turns the form rows into credit records. Returns { error } when a row
  // is invalid. Existing credits keep their id, date and payment history.
  const buildEntryCredits = (rows, stampMs) => {
    const list = [];

    for (const row of rows) {
      const reason = row.reason.trim();
      const amount = Number(row.amount);
      const paid = Number(row.paid) || 0;

      // completely empty row -> ignore
      if (!reason && !row.amount && !row.paid) continue;

      if (!reason) {
        return { error: "Please enter the name / reason for every credit." };
      }

      if (!amount || amount <= 0) {
        return { error: `Please enter a valid credit amount for "${reason}".` };
      }

      if (paid < 0 || paid > amount) {
        return {
          error: `Paid amount for "${reason}" cannot be more than the credit amount.`,
        };
      }

      if (row.orig) {
        const paidChanged = paid !== getCreditPaid(row.orig);

        list.push({
          ...row.orig,
          reason,
          amount,
          paid,
          ...(paidChanged
            ? {
              payments:
                paid > 0
                  ? [
                    {
                      amount: paid,
                      atMs: row.orig.createdAtMs || stampMs,
                      note: "Edited entry",
                    },
                  ]
                  : [],
            }
            : {}),
        });
      } else {
        list.push({
          id: row.key,
          reason,
          amount,
          paid,
          payments:
            paid > 0
              ? [{ amount: paid, atMs: stampMs, note: "Paid at entry" }]
              : [],
          createdAtMs: stampMs,
          addedBy:
            profile?.name ||
            user?.displayName ||
            user?.email ||
            "Attendant",
        });
      }
    }

    return { list };
  };

  const openCreateEntry = () => {
    setEntryCredits([]);
    setEntryDate(getDateKey());
    setEntryOpenDen(emptyDenominations());
    setEntryOpenDigital(emptyDigital());
    setEntryCloseDen(emptyDenominations());
    setEntryCloseDigital(emptyDigital());
    setEntryModal({ mode: "create", id: null, status: "closed" });
  };

  const openEditEntry = (item) => {
    setEntryCredits(getCreditList(item).map((credit) => makeCreditRow(credit)));
    setEntryDate(item.dateKey || getDateKey());
    setEntryOpenDen(denominationsToInputs(item.openingDenominations));
    setEntryOpenDigital(digitalToInputs(getOpeningDigital(item)));
    setEntryCloseDen(
      item.status === "closed"
        ? denominationsToInputs(item.closingDenominations)
        : emptyDenominations()
    );
    setEntryCloseDigital(
      item.status === "closed"
        ? digitalToInputs(getClosingDigital(item))
        : emptyDigital()
    );
    setEntryModal({ mode: "edit", id: item.id, status: item.status });
  };

  const closeEntryModal = () => {
    if (saving) return;
    setEntryModal(null);
  };

  const handleSaveEntry = async () => {
    if (!entryModal) return;

    if (!entryDate) {
      alert("Please choose a date.");
      return;
    }

    const isCreate = entryModal.mode === "create";
    const hasClosing = isCreate || entryModal.status === "closed";

    const openCash = calculateDenominationTotal(entryOpenDen);
    const openDigitalAmount = calculateDigitalTotal(entryOpenDigital);
    const closeCash = calculateDenominationTotal(entryCloseDen);
    const closeDigitalAmount = calculateDigitalTotal(entryCloseDigital);

    if (openCash <= 0 && openDigitalAmount <= 0) {
      alert("Please enter the opening cash or digital money.");
      return;
    }

    if (hasClosing && closeCash <= 0 && closeDigitalAmount <= 0) {
      alert("Please enter the closing cash or digital money.");
      return;
    }

    const [entryYear, entryMonth, entryDay] = entryDate.split("-").map(Number);
    const credited = buildEntryCredits(
      entryCredits,
      new Date(entryYear, entryMonth - 1, entryDay, 12, 0, 0).getTime()
    );

    if (credited.error) {
      alert(credited.error);
      return;
    }

    const entryCreditList = credited.list;

    setSaving(true);

    try {
      const [year, month, day] = entryDate.split("-").map(Number);
      const entryDateObj = new Date(year, month - 1, day, 12, 0, 0);

      const dateFields = {
        dateKey: getDateKey(entryDateObj),
        monthKey: getMonthKey(entryDateObj),
        yearKey: getYearKey(entryDateObj),
      };

      if (isCreate) {
        const attendantName =
          profile?.name ||
          user?.displayName ||
          user?.email ||
          "Attendant";

        const stamp = Timestamp.fromDate(entryDateObj);

        await addDoc(collection(db, "cashRegisters"), {
          ...dateFields,
          attendantId: user.uid,
          attendantName,

          openingCash: openCash,
          openingDenominations: { ...entryOpenDen },
          openingDigital: cleanDigital(entryOpenDigital),

          digitalBalances: cleanDigital(entryCloseDigital),
          closingDigital: cleanDigital(entryCloseDigital),

          expenses: [],
          credits: entryCreditList,
          openingCredits: [],
          closingCredits: entryCreditList,

          cashAdded: 0,
          cashRemoved: 0,
          cashSales: 0,

          expectedCash: openCash,

          closingCash: closeCash,
          closingDenominations: { ...entryCloseDen },

          cashDifference: closeCash - openCash,
          difference:
            closeCash +
            closeDigitalAmount +
            calculateCreditEffect(entryCreditList) -
            (openCash + openDigitalAmount),

          status: "closed",

          openedAt: stamp,
          closedAt: stamp,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const item = registers.find((r) => r.id === entryModal.id);

        if (!item) {
          throw new Error("This session no longer exists.");
        }

        const expectedCash =
          openCash +
          Number(item.cashAdded || 0) -
          Number(item.cashRemoved || 0) +
          Number(item.cashSales || 0);

        const newOpeningDigital = cleanDigital(entryOpenDigital);

        const payload = {
          ...dateFields,
          openingCash: openCash,
          openingDenominations: { ...entryOpenDen },
          openingDigital: newOpeningDigital,
          expectedCash,
          credits: entryCreditList,
          updatedAt: serverTimestamp(),
        };

        if (hasClosing) {
          payload.closingCredits = entryCreditList;
          const newClosingDigital = cleanDigital(entryCloseDigital);

          payload.closingCash = closeCash;
          payload.closingDenominations = { ...entryCloseDen };
          payload.closingDigital = newClosingDigital;
          payload.digitalBalances = newClosingDigital;
          payload.cashDifference = closeCash - expectedCash;
          payload.difference =
            closeCash +
            closeDigitalAmount +
            calculateCreditEffect(entryCreditList) -
            (openCash +
              openDigitalAmount +
              calculateCreditEffect(getOpeningCredits(item)));
        } else {
          // Open session: only follow the new opening digital balances
          // if they had not been changed during the day.
          const oldOpening = cleanDigital(getOpeningDigital(item));
          const live = cleanDigital(item.digitalBalances);

          if (JSON.stringify(oldOpening) === JSON.stringify(live)) {
            payload.digitalBalances = newOpeningDigital;
          }
        }

        await updateDoc(doc(db, "cashRegisters", item.id), payload);

        setSelectedHistoryRegister((current) =>
          current?.id === item.id ? null : current
        );
      }

      setEntryModal(null);
    } catch (firebaseError) {
      console.error("Save entry error:", firebaseError);
      alert(firebaseError.message || "Unable to save this entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (item) => {
    const confirmed = window.confirm(
      `Delete the cash session of ${formatDate(item.dateKey)}?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingId(item.id);

    try {
      await deleteDoc(doc(db, "cashRegisters", item.id));

      setSelectedHistoryRegister((current) =>
        current?.id === item.id ? null : current
      );
    } catch (firebaseError) {
      console.error("Delete entry error:", firebaseError);
      alert(firebaseError.message || "Unable to delete this entry.");
    } finally {
      setDeletingId(null);
    }
  };

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

  // Shared "Credit ₹X · Paid ₹Y" detail line for a credit entry
  const creditDetailText = (item) => {
    const paid = getCreditPaid(item);
    const parts = [`Credit ${formatCurrency(Number(item.amount) || 0)}`];

    if (paid > 0) parts.push(`Paid ${formatCurrency(paid)}`);
    if (getCreditBalance(item) <= 0) parts.push("Settled");
    if (item.carriedOver) parts.push("Carried forward");

    return parts.join(" · ");
  };

  const renderCreditRows = (
    list,
    removable = false,
    source = removable ? "live" : "history"
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
            className={`cash-expense-item cash-credit-item clickable${getCreditBalance(item) <= 0 ? " settled" : ""}`}
            key={item.id || `${item.reason}-${item.createdAtMs}`}
            role="button"
            tabIndex={0}
            title="View payment details"
            onClick={() => openCreditDetail(source, item)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                openCreditDetail(source, item);
              }
            }}
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
              <span className="cash-credit-detail">
                {creditDetailText(item)}
              </span>
            </div>

            <div className="cash-credit-amount">
              {formatCurrency(
                getCreditBalance(item)
              )}
            </div>

            {removable && (
              <button
                type="button"
                className="cash-expense-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  handleRemoveCredit(
                    item.id
                  );
                }}
                aria-label="Remove credit"
              >
                <Trash2 size={14} />
              </button>
            )}

            <ChevronRight
              size={15}
              className="cash-credit-chevron"
            />
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
    calculateCreditEffect(closingCredits) -
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
              onClick={openOpenModal}
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
            Cash + digital + credit paid
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
              ? "Cash + digital + credit paid"
              : "Expected cash + digital + credit paid"}
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
              onClick={openOpenModal}
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
                    <h3>Credit / Loan (all days)</h3>
                  </div>

                  <div className="cash-panel-total green">
                    {formatCurrency(
                      dayTotals.credits
                    )}
                  </div>
                </div>

                {openRegister && (
                  <div className="cash-expense-form cash-credit-form">
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

                    <div className="cash-expense-money">
                      <b>₹</b>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="Paid"
                        title="Amount already paid - reduces the credit amount"
                        value={creditPaid}
                        onChange={(event) =>
                          setCreditPaid(event.target.value)
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
                  TOTAL MONEY
                </div>
                <strong>
                  {formatCurrency(
                    dayTotals.net +
                    dayTotals.credits
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
                <span>Total amount of the day</span>
                <strong>
                  {formatCurrency(
                    dayTotals.net
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

              <div className="cash-credit-split">
                <div className="given">
                  <span>Credit given (shown only)</span>
                  <strong>
                    {formatCurrency(
                      dayTotals.creditGiven
                    )}
                  </strong>
                </div>

                <div className="paid">
                  <span>Paid / update (added)</span>
                  <strong>
                    +{formatCurrency(
                      dayTotals.creditPaid
                    )}
                  </strong>
                </div>

                <div className="due">
                  <span>Not paid</span>
                  <strong>
                    {formatCurrency(
                      dayTotals.credits
                    )}
                  </strong>
                </div>
              </div>
            </div>

          </div>

        </section>
      )}

      {/* ====================================================
          CREDIT / LOAN HISTORY (all days)
      ==================================================== */}

      <section className="cash-history-card cash-credit-history-card">
        <div className="cash-history-head">
          <div>
            <div className="cash-section-label">
              CREDIT
            </div>

            <h2>Credit / Loan history (all days)</h2>

            <p>
              Every credit given on any day. Tap one to see its
              payment history.
            </p>
          </div>

          <div className="cash-history-head-actions">
            <div className="cash-panel-total green">
              {formatCurrency(calculateCreditTotal(allCreditHistory))}
            </div>

            <button
              type="button"
              className="cash-export-btn"
              onClick={() => {
                setExportTarget("credit");
                setShowExportModal(true);
              }}
            >
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        {allCreditHistory.length === 0 ? (
          <div className="cash-expense-empty">
            <Receipt size={16} />
            No credit added yet
          </div>
        ) : (
          <div className="cash-table-wrap">
            <table className="cash-table cash-credit-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name / Reason</th>
                  <th>Amount Credit</th>
                  <th>Amount Paid</th>
                  <th>Amount Not Paid</th>
                  <th className="cash-credit-actions-th">Actions</th>
                </tr>
              </thead>

              <tbody>
                {allCreditHistory.map((item) => {
                  const total = Number(item.amount) || 0;
                  const paid = getCreditPaid(item);
                  const balance = getCreditBalance(item);
                  const percent =
                    total > 0 ? Math.min(1, paid / total) : 1;

                  // 0 = red (nothing paid) ... 135 = green (fully paid)
                  const hue = Math.round(percent * 135);

                  return (
                    <tr
                      key={item.id || `${item.reason}-${item.createdAtMs}`}
                      className={`cash-row-clickable cash-credit-row${balance <= 0 ? " settled" : ""}`}
                      style={{ "--credit-hue": hue }}
                      tabIndex={0}
                      title="View payment details"
                      onClick={() => openCreditDetail("all", item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          openCreditDetail("all", item);
                        }
                      }}
                    >
                      <td>
                        <strong>
                          {item.createdAtMs
                            ? formatDate(item.createdAtMs)
                            : "—"}
                        </strong>
                        <small>
                          {item.createdAtMs
                            ? formatDateTime(item.createdAtMs)
                            : ""}
                        </small>
                      </td>

                      <td>
                        <strong>{item.reason}</strong>
                        {item.carriedOver && <small>Carried forward</small>}
                      </td>

                      <td>
                        <strong>{formatCurrency(total)}</strong>
                      </td>

                      <td className="cash-credit-paid-cell">
                        <strong>{formatCurrency(paid)}</strong>
                      </td>

                      <td className="cash-credit-due-cell">
                        <strong>{formatCurrency(balance)}</strong>
                      </td>

                      <td className="cash-credit-actions-cell">
                        <div className="cash-credit-row-tools">
                          <button
                            type="button"
                            className="cash-credit-icon-btn"
                            title="Edit credit"
                            disabled={creditDetailSaving}
                            onClick={(event) => {
                              event.stopPropagation();
                              startCreditEditFromTable(item);
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <Pencil size={14} />
                          </button>

                          <button
                            type="button"
                            className="cash-credit-icon-btn danger"
                            title="Delete credit"
                            disabled={creditDetailSaving}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteCreditEverywhere(item);
                            }}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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

          <div className="cash-history-head-actions">
            <button
              type="button"
              className="cash-export-btn"
              onClick={openCreateEntry}
            >
              <Plus size={14} />

              Add Entry
            </button>

            <button
              className="cash-export-btn"
              onClick={() => {
                setExportTarget("history");
                setShowExportModal(true);
              }}
            >
              <Download
                size={14}
              />

              Export
            </button>
          </div>

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
                  <th>Total Money</th>
                  <th className="cash-actions-th">Actions</th>
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

                      <td>
                        <strong>{formatCurrency(getTotalMoney(item))}</strong>
                      </td>

                      <td
                        className="cash-actions-td"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <div className="cash-row-actions">
                          <button
                            type="button"
                            className="cash-icon-btn"
                            onClick={() => openEditEntry(item)}
                            aria-label="Edit session"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>

                          <button
                            type="button"
                            className="cash-icon-btn danger"
                            onClick={() => handleDeleteEntry(item)}
                            disabled={deletingId === item.id}
                            aria-label="Delete session"
                            title="Delete"
                          >
                            {deletingId === item.id ? (
                              <RefreshCw size={14} className="spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
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

          <div className="cash-modal wide">

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

            {renderCashDigitalSplit(
              openingDenominations,
              setOpeningDenominations,
              openingDigital,
              setOpeningDigital
            )}

            <div className="cash-modal-block">
              <div className="cash-modal-block-head">
                <div>
                  <span className="cash-section-label">
                    CREDIT (LOAN)
                  </span>
                  <p>
                    Add the reason / person, amount and amount already paid.
                  </p>
                </div>

                <strong>
                  {formatCurrency(
                    openingCreditTotal
                  )}
                </strong>
              </div>

              <div className="cash-expense-form cash-credit-form">
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

                <div className="cash-expense-money">
                  <b>₹</b>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="Paid"
                    title="Amount already paid - reduces the credit amount"
                    value={openingCreditPaid}
                    onChange={(event) =>
                      setOpeningCreditPaid(event.target.value)
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
                      className={`cash-expense-item cash-credit-item clickable${getCreditBalance(item) <= 0 ? " settled" : ""}`}
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      title="View payment details"
                      onClick={() =>
                        openCreditDetail("opening", item)
                      }
                    >
                      <div className="cash-expense-text">
                        <strong>{item.reason}</strong>
                        <span className="cash-credit-detail">
                          {creditDetailText(item)}
                        </span>
                      </div>

                      <div className="cash-credit-amount">
                        {formatCurrency(
                          getCreditBalance(item)
                        )}
                      </div>

                      <button
                        type="button"
                        className="cash-expense-remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRemoveOpeningCredit(
                            item.id
                          );
                        }}
                        aria-label="Remove credit"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                <span>Credit (not paid)</span>
                <strong>{formatCurrency(openingCreditTotal)}</strong>
              </div>
              <div className="sum">
                <span>Total</span>
                <strong>
                  {formatCurrency(
                    openingModalTotal +
                    openingDigitalTotal +
                    calculateCreditEffect(openingCredits)
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

            <div className="cash-modal wide">

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

              {renderCashDigitalSplit(
                closingDenominations,
                setClosingDenominations,
                closingDigital,
                setClosingDigital
              )}

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

                <div className="cash-expense-form cash-credit-form">
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

                  <div className="cash-expense-money">
                    <b>₹</b>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      placeholder="Paid"
                      title="Amount already paid - reduces the credit amount"
                      value={closingCreditPaid}
                      onChange={(event) =>
                        setClosingCreditPaid(event.target.value)
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
                        className={`cash-expense-item cash-credit-item clickable${getCreditBalance(item) <= 0 ? " settled" : ""}`}
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        title="View payment details"
                        onClick={() =>
                          openCreditDetail("closing", item)
                        }
                      >
                        <div className="cash-expense-text">
                          <strong>{item.reason}</strong>
                          <span className="cash-credit-detail">
                            {creditDetailText(item)}
                          </span>
                        </div>

                        <div className="cash-credit-amount">
                          {formatCurrency(
                            getCreditBalance(item)
                          )}
                        </div>

                        <button
                          type="button"
                          className="cash-expense-remove"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRemoveClosingCredit(
                              item.id
                            );
                          }}
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
                  <span>Credit (not paid)</span>
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
                      getDayTotals({
                        ...openRegister,
                        status: "closed",
                        closingCash: closingModalTotal,
                        digitalBalances: closingDigital,
                        credits: closingCredits,
                      }).net
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

      {/* ====================================================
          ADD / EDIT ENTRY MODAL (transaction history)
      ==================================================== */}

      {entryModal && (
        <div
          className="cash-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEntryModal();
            }
          }}
        >
          <div className="cash-modal wide">
            <div className="cash-modal-head">
              <div className="cash-modal-title">
                <div className="cash-modal-icon">
                  {entryModal.mode === "create" ? (
                    <Plus size={17} />
                  ) : (
                    <Pencil size={17} />
                  )}
                </div>

                <div>
                  <strong>
                    {entryModal.mode === "create"
                      ? "Add Entry"
                      : "Edit Entry"}
                  </strong>
                  <span>
                    {entryModal.mode === "create"
                      ? "Record a completed cash session."
                      : "Correct the opening / closing figures."}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="cash-modal-close"
                onClick={closeEntryModal}
              >
                <X size={17} />
              </button>
            </div>

            <div className="cash-entry-date">
              <label htmlFor="cash-entry-date-input">Date</label>
              <input
                id="cash-entry-date-input"
                type="date"
                value={entryDate}
                max={getDateKey()}
                onChange={(event) => setEntryDate(event.target.value)}
              />
            </div>

            <div className="cash-entry-section-title">
              <UnlockKeyhole size={14} />
              Opening
            </div>

            {renderCashDigitalSplit(
              entryOpenDen,
              setEntryOpenDen,
              entryOpenDigital,
              setEntryOpenDigital
            )}

            {(entryModal.mode === "create" ||
              entryModal.status === "closed") && (
                <>
                  <div className="cash-entry-section-title">
                    <LockKeyhole size={14} />
                    Closing
                  </div>

                  {renderCashDigitalSplit(
                    entryCloseDen,
                    setEntryCloseDen,
                    entryCloseDigital,
                    setEntryCloseDigital
                  )}
                </>
              )}

            <div className="cash-entry-section-title">
              <WalletCards size={14} />
              Credit / Loan
            </div>

            <div className="cash-entry-credit">
              {entryCredits.length === 0 ? (
                <div className="cash-expense-empty">
                  <Receipt size={16} />
                  No credit on this day
                </div>
              ) : (
                <>
                  <div className="cash-entry-credit-head">
                    <span>Name / reason</span>
                    <span>Credit</span>
                    <span>Paid</span>
                    <span />
                  </div>

                  {entryCredits.map((row) => (
                    <div className="cash-entry-credit-row" key={row.key}>
                      <div className="cash-expense-money">
                        <input
                          type="text"
                          placeholder="Name / reason"
                          value={row.reason}
                          onChange={(event) =>
                            updateEntryCredit(row.key, "reason", event.target.value)
                          }
                        />
                      </div>

                      <div className="cash-expense-money">
                        <b>₹</b>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="Amount"
                          value={row.amount}
                          onChange={(event) =>
                            updateEntryCredit(row.key, "amount", event.target.value)
                          }
                        />
                      </div>

                      <div className="cash-expense-money">
                        <b>₹</b>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="Paid"
                          value={row.paid}
                          onChange={(event) =>
                            updateEntryCredit(row.key, "paid", event.target.value)
                          }
                        />
                      </div>

                      <button
                        type="button"
                        className="cash-credit-icon-btn danger"
                        title="Remove credit"
                        onClick={() =>
                          setEntryCredits((rows) =>
                            rows.filter((entry) => entry.key !== row.key)
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              <button
                type="button"
                className="cash-credit-action-btn cash-entry-credit-add"
                onClick={() =>
                  setEntryCredits((rows) => [...rows, makeCreditRow()])
                }
              >
                <Plus size={14} />
                Add credit
              </button>
            </div>

            <div className="cash-modal-actions">
              <button
                type="button"
                className="cash-cancel-btn"
                onClick={closeEntryModal}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                className="cash-save-btn"
                onClick={handleSaveEntry}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw size={15} className="spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    {entryModal.mode === "create"
                      ? "Add Entry"
                      : "Save Changes"}
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
                <span>Credit Given</span>
                <strong>{formatCurrency(getDayTotals(selectedHistoryRegister).creditGiven)}</strong>
              </div>
              <div>
                <span>Credit Paid (+)</span>
                <strong>+{formatCurrency(getDayTotals(selectedHistoryRegister).creditPaid)}</strong>
              </div>
              <div>
                <span>Credit Not Paid</span>
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
              <div>
                <span>Total Money</span>
                <strong>{formatCurrency(getTotalMoney(selectedHistoryRegister))}</strong>
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

      {showExportModal && (
        <div
          className="cash-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !exporting) {
              setShowExportModal(false);
            }
          }}
        >
          <div className="cash-modal cash-export-modal">
            <div className="cash-modal-head">
              <div className="cash-modal-title">
                <div className="cash-modal-icon">
                  <Download size={17} />
                </div>

                <div>
                  <strong>
                    {exportTarget === "credit"
                      ? "Export credit / loan history"
                      : "Export history"}
                  </strong>
                  <span>
                    {exportTarget === "credit"
                      ? "Choose a file type. Date, name, credit, paid and not paid."
                      : "Choose a file type. Date, opening, closing, total and difference."}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="cash-modal-close"
                onClick={() => setShowExportModal(false)}
                disabled={Boolean(exporting)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="cash-export-options">
              <button
                type="button"
                className="cash-export-option pdf"
                onClick={() => handleExport("pdf")}
                disabled={Boolean(exporting)}
              >
                {exporting === "pdf" ? (
                  <RefreshCw size={26} className="spin" />
                ) : (
                  <FileText size={26} />
                )}
                <strong>PDF</strong>
                <span>Ready to print or share</span>
              </button>

              <button
                type="button"
                className="cash-export-option xlsx"
                onClick={() => handleExport("xlsx")}
                disabled={Boolean(exporting)}
              >
                {exporting === "xlsx" ? (
                  <RefreshCw size={26} className="spin" />
                ) : (
                  <FileSpreadsheet size={26} />
                )}
                <strong>Excel (.xlsx)</strong>
                <span>Editable spreadsheet</span>
              </button>
            </div>

            <p className="cash-export-note">
              {exportTarget === "credit"
                ? `Exports all ${allCreditHistory.length} credit / loan record(s) from every day.`
                : `Exports the ${filteredRegisters.length} record(s) shown in the list below, using the current search and status filter.`}
            </p>
          </div>
        </div>
      )}

      {creditDetail && creditDetailItem && (() => {
        const total = Number(creditDetailItem.amount) || 0;
        const paid = getCreditPaid(creditDetailItem);
        const balance = getCreditBalance(creditDetailItem);
        const percent = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
        const payments = getCreditPayments(creditDetailItem);
        const inOpenRegister =
          Boolean(openRegister) &&
          getCreditList(openRegister).some(
            (item) => item.id === creditDetailItem.id
          );
        const canPay =
          balance > 0 &&
          (creditDetail.source === "all"
            ? inOpenRegister
            : creditDetail.source !== "history");

        // Edit / delete only for credits that live in today's open register
        const canManage =
          inOpenRegister &&
          (creditDetail.source === "all" ||
            creditDetail.source === "live");

        return (
          <div
            className="cash-modal-overlay cash-credit-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeCreditDetail();
              }
            }}
          >
            <div className="cash-modal cash-credit-modal">
              <div className="cash-modal-head">
                <div className="cash-modal-title">
                  <div className="cash-modal-icon">
                    <WalletCards size={17} />
                  </div>

                  <div>
                    <strong>{creditDetailItem.reason}</strong>
                    <span>
                      {creditDetailItem.createdAtMs
                        ? `Credit given ${formatDateTime(creditDetailItem.createdAtMs)}`
                        : "Credit details"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="cash-modal-close"
                  onClick={closeCreditDetail}
                >
                  <X size={17} />
                </button>
              </div>

              <div className={`cash-credit-summary${balance <= 0 ? " settled" : ""}`}>
                <div>
                  <span>Total credit</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>
                <div className="paid">
                  <span>Paid</span>
                  <strong>{formatCurrency(paid)}</strong>
                </div>
                <div className="due">
                  <span>Not paid</span>
                  <strong>{formatCurrency(balance)}</strong>
                </div>
              </div>

              <div className="cash-credit-progress">
                <i style={{ width: `${percent}%` }} />
              </div>

              {canManage && !creditEdit && (
                <div className="cash-credit-actions">
                  <button
                    type="button"
                    className="cash-credit-action-btn"
                    disabled={creditDetailSaving}
                    onClick={() =>
                      setCreditEdit({
                        reason: creditDetailItem.reason || "",
                        amount: String(total),
                      })
                    }
                  >
                    <Pencil size={14} />
                    Edit
                  </button>

                  <button
                    type="button"
                    className="cash-credit-action-btn danger"
                    disabled={creditDetailSaving}
                    onClick={() => handleDeleteCreditEverywhere()}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              )}

              {canManage && creditEdit && (
                <div className="cash-credit-update cash-credit-edit">
                  <span className="cash-section-label">
                    EDIT CREDIT
                  </span>

                  <div className="cash-credit-edit-form">
                    <div className="cash-expense-money">
                      <input
                        type="text"
                        placeholder="Name / reason"
                        value={creditEdit.reason}
                        onChange={(event) =>
                          setCreditEdit((prev) => ({
                            ...prev,
                            reason: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="cash-expense-money">
                      <b>₹</b>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="Credit amount"
                        value={creditEdit.amount}
                        onChange={(event) =>
                          setCreditEdit((prev) => ({
                            ...prev,
                            amount: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleSaveCreditEdit();
                          }
                        }}
                      />
                    </div>

                    <div className="cash-credit-edit-buttons">
                      <button
                        type="button"
                        className="cash-expense-add"
                        onClick={handleSaveCreditEdit}
                        disabled={creditDetailSaving}
                      >
                        {creditDetailSaving ? (
                          <RefreshCw size={14} className="spin" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        Save
                      </button>

                      <button
                        type="button"
                        className="cash-credit-action-btn"
                        onClick={() => setCreditEdit(null)}
                        disabled={creditDetailSaving}
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {canPay ? (
                <div className="cash-credit-update">
                  <span className="cash-section-label">
                    UPDATE PAYMENT
                  </span>

                  <div className="cash-credit-update-row">
                    <div className="cash-expense-money">
                      <b>₹</b>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        placeholder="Amount received"
                        value={creditDetailPay}
                        onChange={(event) =>
                          setCreditDetailPay(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleCreditDetailPay();
                          }
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      className="cash-expense-add"
                      onClick={handleCreditDetailPay}
                      disabled={creditDetailSaving}
                    >
                      {creditDetailSaving ? (
                        <RefreshCw size={14} className="spin" />
                      ) : (
                        <Plus size={14} />
                      )}
                      Update
                    </button>
                  </div>
                </div>
              ) : balance <= 0 ? (
                <div className="cash-credit-settled">
                  <CheckCircle2 size={16} />
                  Fully paid
                </div>
              ) : creditDetail.source === "all" ? (
                <div className="cash-expense-empty">
                  <LockKeyhole size={16} />
                  Open today's register to record a payment
                </div>
              ) : null}

              <div className="cash-credit-history">
                <span className="cash-section-label">
                  PAYMENT HISTORY
                </span>

                {payments.length === 0 ? (
                  <div className="cash-expense-empty">
                    <Receipt size={16} />
                    No payments yet
                  </div>
                ) : (
                  payments.map((entry, index) => (
                    <div
                      className="cash-credit-history-row"
                      key={`${entry.atMs}-${index}`}
                    >
                      <div>
                        <strong>
                          {entry.note || "Payment received"}
                        </strong>
                        <span>
                          {entry.atMs ? formatDateTime(entry.atMs) : "—"}
                        </span>
                      </div>

                      {canManage &&
                        creditPayEdit &&
                        creditPayEdit.idx === entry.idx &&
                        entry.idx >= 0 ? (
                        <div className="cash-credit-pay-tools">
                          <div className="cash-expense-money">
                            <b>₹</b>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              value={creditPayEdit.value}
                              onChange={(event) =>
                                setCreditPayEdit((prev) => ({
                                  ...prev,
                                  value: event.target.value,
                                }))
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  handleSavePaymentEdit();
                                }
                              }}
                            />
                          </div>

                          <button
                            type="button"
                            className="cash-credit-icon-btn ok"
                            title="Save"
                            disabled={creditDetailSaving}
                            onClick={handleSavePaymentEdit}
                          >
                            <CheckCircle2 size={14} />
                          </button>

                          <button
                            type="button"
                            className="cash-credit-icon-btn"
                            title="Cancel"
                            onClick={() => setCreditPayEdit(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="cash-credit-pay-tools">
                          <b>{formatCurrency(entry.amount)}</b>

                          {canManage && (
                            <>
                              {entry.idx >= 0 && (
                                <button
                                  type="button"
                                  className="cash-credit-icon-btn"
                                  title="Edit payment"
                                  disabled={creditDetailSaving}
                                  onClick={() =>
                                    setCreditPayEdit({
                                      idx: entry.idx,
                                      value: String(entry.amount),
                                    })
                                  }
                                >
                                  <Pencil size={14} />
                                </button>
                              )}

                              <button
                                type="button"
                                className="cash-credit-icon-btn danger"
                                title="Delete payment"
                                disabled={creditDetailSaving}
                                onClick={() =>
                                  handleDeleteCreditPayment(entry)
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}

                <div className="cash-credit-history-row start">
                  <div>
                    <strong>Credit given</strong>
                    <span>
                      {creditDetailItem.createdAtMs
                        ? formatDateTime(creditDetailItem.createdAtMs)
                        : "—"}
                    </span>
                  </div>
                  <b>{formatCurrency(total)}</b>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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