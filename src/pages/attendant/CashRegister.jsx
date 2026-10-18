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
  increment,
} from "firebase/firestore";

import { useNavigate } from "react-router-dom";

import FloatingCalculator from "./FloatingCalculator";

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
  LayoutDashboard,
  History as HistoryIcon,
  Sun,
  Moon,
  ArrowLeft,
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
  const totalMoney = cash + digital;

  // Day total = total money - expenses.
  return {
    cash,
    digital,
    expenses,
    totalMoney,
    net: totalMoney - expenses,
  };
}

// ============================================================
// HELPERS
// ============================================================

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

// Notes / coins added to or taken out of the drawer today,
// grouped by denomination, for the closing screen.
function getMovementSummary(register, type) {
  const list = (register?.cashMovements || []).filter(
    (item) => item.type === type
  );

  const total = list.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );

  const chips = DENOMINATIONS.map((item) => ({
    label: item.label,
    pcs: list.reduce(
      (sum, entry) =>
        sum + (Number(entry.denominations?.[item.value]) || 0),
      0
    ),
  })).filter((chip) => chip.pcs > 0);

  // entries saved before denominations were tracked
  const counted = list.reduce(
    (sum, entry) =>
      sum +
      DENOMINATIONS.reduce(
        (inner, item) =>
          inner +
          (Number(entry.denominations?.[item.value]) || 0) *
            item.value,
        0
      ),
    0
  );

  return {
    count: list.length,
    total,
    chips,
    other: Math.max(0, total - counted),
  };
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

// Opening / closing snapshots of digital money.
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

function getOpeningTotal(register) {
  if (!register) return 0;

  return (
    Number(register.openingCash || 0) +
    calculateDigitalTotal(getOpeningDigital(register))
  );
}

// Closing total = counted cash + digital (closed registers only).
function getClosingTotal(register) {
  if (!register || register.status !== "closed") return null;

  const totals = getDayTotals(register);

  return totals.cash + totals.digital;
}

// Overall difference = closing total - opening total
// (cash + digital money, at close minus open).
function getOverallDifference(register) {
  const closingTotal = getClosingTotal(register);

  if (closingTotal === null) return 0;

  return closingTotal - getOpeningTotal(register);
}

// Total money = total amount of the day (cash + digital - expenses).
function getTotalMoney(register) {
  if (!register) return 0;

  return getDayTotals(register).net;
}

function formatTimeOnly(value) {
  if (!value) return "";

  const date =
    value?.toDate && typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
// EXPORT STYLING  (shared by the PDF and Excel exports)
// ============================================================

const EXPORT_COLORS = {
  ink: [15, 31, 30],
  deep: [4, 48, 46],
  violet: [11, 127, 115],
  violetSoft: [13, 148, 136],
  indigo: [14, 116, 144],
  indigoSoft: [20, 165, 180],
  pale: [220, 245, 241],
  zebra: [245, 250, 249],
  line: [223, 233, 231],
  muted: [88, 115, 112],
  faint: [147, 168, 165],
  green: [22, 163, 74],
  greenBg: [227, 247, 233],
  amber: [180, 83, 9],
  amberBg: [254, 243, 199],
  red: [225, 29, 72],
  redBg: [255, 233, 237],
  blue: [14, 116, 144],
  blueBg: [223, 243, 248],
  white: [255, 255, 255],
};

const rgbToHex = (rgb) =>
  rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

// Colour + label for every status badge used in the exports.
function getStatusPill(status) {
  const C = EXPORT_COLORS;

  switch (status) {
    case "Closed":
    case "Paid":
      return { label: status.toUpperCase(), fg: C.green, bg: C.greenBg };
    case "Open":
      return { label: "OPEN", fg: C.blue, bg: C.blueBg };
    case "Partial":
      return { label: "PARTIAL", fg: C.amber, bg: C.amberBg };
    default:
      return { label: String(status).toUpperCase(), fg: C.red, bg: C.redBg };
  }
}

// Coloured header band + summary cards. Returns the y position
// where the table can start.
function drawExportHeader(pdf, { title, subtitle, generated, cards, legend }) {
  const C = EXPORT_COLORS;
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 40;

  pdf.setFillColor(...C.deep);
  pdf.rect(0, 0, pageW, 84, "F");
  pdf.setFillColor(...C.violetSoft);
  pdf.rect(0, 84, pageW, 3, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(21);
  pdf.setTextColor(255, 255, 255);
  pdf.text(title, margin, 40);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(190, 235, 228);
  pdf.text(subtitle, margin, 60);

  pdf.setFontSize(8.5);
  pdf.text(`Generated ${generated}`, pageW - margin, 40, {
    align: "right",
  });

  const gap = 14;
  const top = 106;
  const height = 48;
  const width =
    (pageW - margin * 2 - gap * (cards.length - 1)) / cards.length;

  cards.forEach((card, index) => {
    const x = margin + index * (width + gap);

    pdf.setFillColor(...C.white);
    pdf.setDrawColor(...C.line);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(x, top, width, height, 6, 6, "FD");

    pdf.setFillColor(...card.accent);
    pdf.roundedRect(x, top, 4, height, 2, 2, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(...C.muted);
    pdf.text(card.label.toUpperCase(), x + 16, top + 18);

    pdf.setFontSize(15);
    pdf.setTextColor(...C.ink);
    pdf.text(String(card.value), x + 16, top + 38);
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...C.muted);

  const lines = pdf.splitTextToSize(legend, pageW - margin * 2);
  pdf.text(lines, margin, top + height + 18);

  return top + height + 18 + lines.length * 10;
}

// Footer line + "Page x of y" on every page.
function drawExportFooter(pdf, label) {
  const C = EXPORT_COLORS;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const total = pdf.getNumberOfPages();

  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);

    pdf.setDrawColor(...C.line);
    pdf.setLineWidth(0.8);
    pdf.line(40, pageH - 32, pageW - 40, pageH - 32);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.text(label, 40, pageH - 18);
    pdf.text(`Page ${page} of ${total}`, pageW - 40, pageH - 18, {
      align: "right",
    });
  }
}

// Rounded status badge with a small dot, centred inside a table cell.
function drawStatusPill(pdf, cell, pill) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);

  const textWidth = pdf.getTextWidth(pill.label);
  const pillW = textWidth + 24;
  const pillH = 14;
  const x = cell.x + (cell.width - pillW) / 2;
  const y = cell.y + (cell.height - pillH) / 2;

  pdf.setFillColor(...pill.bg);
  pdf.roundedRect(x, y, pillW, pillH, 7, 7, "F");

  pdf.setFillColor(...pill.fg);
  pdf.circle(x + 9, y + pillH / 2, 2, "F");

  pdf.setTextColor(...pill.fg);
  pdf.text(pill.label, x + 15, y + pillH / 2, { baseline: "middle" });
}

// Thin horizontal rule under a table cell (row separator).
function drawCellRule(pdf, cell) {
  pdf.setDrawColor(...EXPORT_COLORS.line);
  pdf.setLineWidth(0.6);
  pdf.line(
    cell.x,
    cell.y + cell.height,
    cell.x + cell.width,
    cell.y + cell.height
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

  const navigate = useNavigate();

  // ----------------------------------------------------------
  // THEME  (light / dark) - saved in the browser, starts from the
  // saved choice, then the app theme, then the device setting.
  // ----------------------------------------------------------

  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage.getItem("cash-register-theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      /* storage not available */
    }

    const appTheme = document.documentElement.getAttribute("data-theme");
    if (appTheme === "dark" || appTheme === "light") return appTheme;

    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";

      try {
        window.localStorage.setItem("cash-register-theme", next);
      } catch {
        /* storage not available */
      }

      return next;
    });
  };

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

  // Cash added to / taken out of the drawer (movements)
  const [movementModal, setMovementModal] = useState(null); // "add" | "remove" | null
  const [movementDen, setMovementDen] = useState(emptyDenominations());
  const [movementReason, setMovementReason] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);

  // Transaction history CRUD (create / edit entry)
  const [entryModal, setEntryModal] = useState(null); // { mode, id, status }
  const [entryDate, setEntryDate] = useState("");
  const [entryOpenDen, setEntryOpenDen] = useState(emptyDenominations());
  const [entryOpenDigital, setEntryOpenDigital] = useState(emptyDigital());
  const [entryCloseDen, setEntryCloseDen] = useState(emptyDenominations());
  const [entryCloseDigital, setEntryCloseDigital] = useState(emptyDigital());
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

  // Overall register balance = drawer cash + digital balances.
  const currentOverallTotal =
    currentRegister?.status === "closed"
      ? Number(getClosingTotal(currentRegister) || 0)
      : currentCash +
      calculateDigitalTotal(currentRegister?.digitalBalances);

  // ----------------------------------------------------------
  // DIFFERENCE
  // ----------------------------------------------------------

  const difference =
    getOverallDifference(currentRegister);

  // ----------------------------------------------------------
  // CARD INSIGHTS
  // ----------------------------------------------------------

  const openingDigitalAmount = Math.max(
    0,
    openingTotal - openingCash
  );

  const changeSinceOpening =
    currentOverallTotal - openingTotal;

  const statusTime =
    currentRegister?.status === "closed"
      ? formatTimeOnly(currentRegister?.closedAt)
      : formatTimeOnly(currentRegister?.openedAt);

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

  // Cash vs digital share of the total money (for the split bar)
  const daySplitDigital = Math.max(
    0,
    Number(
      openRegister ? digitalDraftTotal : dayTotals.digital
    ) || 0
  );
  const daySplitCash = Math.max(0, Number(dayTotals.cash) || 0);
  const daySplitSum = daySplitCash + daySplitDigital;
  const daySplitCashPct =
    daySplitSum > 0
      ? Math.round((daySplitCash / daySplitSum) * 100)
      : 0;
  const daySplit = {
    cash: daySplitSum > 0 ? daySplitCashPct : 0,
    digital: daySplitSum > 0 ? 100 - daySplitCashPct : 0,
  };

  const openingDigitalTotal =
    calculateDigitalTotal(openingDigital);

  const closingDigitalTotal =
    calculateDigitalTotal(closingDigital);

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
          calculateDigitalTotal(closingDigital) -
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
  // CASH MOVEMENTS  (add cash to / take cash out of the drawer)
  //
  // Each entry is saved in `cashMovements`; cashAdded / cashRemoved
  // and expectedCash are kept in step with it using increment().
  // ----------------------------------------------------------

  const currentMovements = useMemo(
    () =>
      [...(currentRegister?.cashMovements || [])].sort(
        (a, b) =>
          Number(b?.createdAtMs || 0) -
          Number(a?.createdAtMs || 0)
      ),
    [currentRegister]
  );

  const closeMovementModal = () => {
    if (savingMovement) return;
    setMovementModal(null);
    setMovementDen(emptyDenominations());
    setMovementReason("");
  };

  const handleSaveMovement = async () => {
    if (!openRegister || !movementModal) return;

    const type = movementModal; // "add" | "remove"
    const reason = movementReason.trim();
    const amount = calculateDenominationTotal(movementDen);

    if (!amount || amount <= 0) {
      alert("Please enter the notes / coins first.");
      return;
    }

    if (!reason) {
      alert("Please enter a reason.");
      return;
    }

    if (type === "remove" && amount > storedExpectedCash) {
      alert(
        `The drawer only has ${formatCurrency(
          storedExpectedCash
        )}. You cannot take out more than that.`
      );
      return;
    }

    setSavingMovement(true);

    try {
      await updateDoc(
        doc(db, "cashRegisters", openRegister.id),
        {
          cashMovements: arrayUnion({
            id: `${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            type,
            reason,
            amount,
            denominations: DENOMINATIONS.reduce((acc, item) => {
              const pcs = Number(movementDen?.[item.value]) || 0;
              if (pcs > 0) acc[item.value] = pcs;
              return acc;
            }, {}),
            createdAtMs: Date.now(),
            addedBy:
              profile?.name ||
              user?.displayName ||
              user?.email ||
              "Attendant",
          }),

          ...(type === "add"
            ? { cashAdded: increment(amount) }
            : { cashRemoved: increment(amount) }),

          expectedCash: increment(
            type === "add" ? amount : -amount
          ),

          updatedAt: serverTimestamp(),
        }
      );

      setMovementDen(emptyDenominations());
      setMovementReason("");
    } catch (firebaseError) {
      console.error("Cash movement error:", firebaseError);
      alert(
        firebaseError.message ||
        "Unable to save this entry."
      );
    } finally {
      setSavingMovement(false);
    }
  };

  const handleDeleteMovement = async (item) => {
    if (!openRegister) return;

    if (!window.confirm("Delete this entry?")) return;

    const amount = Number(item.amount || 0);

    try {
      await updateDoc(
        doc(db, "cashRegisters", openRegister.id),
        {
          cashMovements: (
            openRegister.cashMovements || []
          ).filter((entry) => entry.id !== item.id),

          ...(item.type === "add"
            ? { cashAdded: increment(-amount) }
            : { cashRemoved: increment(-amount) }),

          expectedCash: increment(
            item.type === "add" ? -amount : amount
          ),

          updatedAt: serverTimestamp(),
        }
      );
    } catch (firebaseError) {
      console.error("Delete movement error:", firebaseError);
      alert(
        firebaseError.message ||
        "Unable to delete this entry."
      );
    }
  };

  // ----------------------------------------------------------
  // EXPORT  (PDF / EXCEL)
  //
  // Columns: Date | Opening (Cash, Digital, Total)
  //          | Closing (Cash, Digital, Total) | Difference
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
          status: closed ? "Closed" : "Open",
          openCash: Number(item.openingCash || 0),
          openDigital: calculateDigitalTotal(
            getOpeningDigital(item)
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
          closeTotal: closed
            ? getClosingTotal(item)
            : null,
          difference: closed
            ? getOverallDifference(item)
            : null,
          totalMoney: getTotalMoney(item),
        };
      });

  // ----------------------------------------------------------
  // HISTORY  -  EXCEL
  // Columns: Date | Status | Opening (4) | Closing (4)
  //          | Difference | Total Money
  // ----------------------------------------------------------

  const exportExcel = async (rows) => {
    const excelModule = await import("xlsx-js-style");
    const XLSX = excelModule.default || excelModule;
    const C = EXPORT_COLORS;

    const COLS = 10;
    const LAST = COLS - 1;
    const HEAD_ROWS = 5;

    const closedCount = rows.filter(
      (row) => row.status === "Closed"
    ).length;
    const openCount = rows.length - closedCount;

    const money = (value) =>
      value === null ? "—" : Number(value);

    const blank = (count) => Array(count).fill("");

    const legend =
      "Total = Cash + Digital   |   Total Money = Total amount of the day (Cash + Digital - Expenses)";

    const aoa = [
      ["Cash Register History", ...blank(LAST)],
      [
        `Amounts in ₹   |   ${rows.length} record(s)   |   ${closedCount} closed, ${openCount} open   |   Generated ${formatDateTime(new Date())}`,
        ...blank(LAST),
      ],
      blank(COLS),
      [
        "Date", "Status",
        "Opening", "", "",
        "Closing", "", "",
        "Difference", "Total Money",
      ],
      [
        "", "",
        "Cash", "Digital Money", "Total",
        "Cash", "Digital Money", "Total",
        "", "",
      ],
      ...rows.map((row) => [
        row.date,
        row.status,
        money(row.openCash),
        money(row.openDigital),
        money(row.openTotal),
        money(row.closeCash),
        money(row.closeDigital),
        money(row.closeTotal),
        money(row.difference),
        money(row.totalMoney),
      ]),
      blank(COLS),
      [legend, ...blank(LAST)],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(aoa);

    // ---- style helpers ------------------------------------
    const rgb = (color) => ({ rgb: rgbToHex(color) });
    const solid = (color) => ({
      patternType: "solid",
      fgColor: rgb(color),
    });
    const thin = (color) => ({ style: "thin", color: rgb(color) });
    const box = (color) => ({
      top: thin(color),
      bottom: thin(color),
      left: thin(color),
      right: thin(color),
    });
    const font = (color, extra = {}) => ({
      name: "Calibri",
      sz: 11,
      color: rgb(color),
      ...extra,
    });

    const put = (r, c, style) => {
      const address = XLSX.utils.encode_cell({ r, c });

      if (!sheet[address]) sheet[address] = { t: "s", v: "" };

      sheet[address].s = style;

      return sheet[address];
    };

    // ---- title band ---------------------------------------
    for (let c = 0; c < COLS; c += 1) {
      put(0, c, {
        fill: solid(C.deep),
        font: font(C.white, { sz: 20, bold: true }),
        alignment: { vertical: "center", horizontal: "left", indent: 1 },
      });

      put(1, c, {
        fill: solid(C.deep),
        font: font([190, 235, 228], { sz: 10 }),
        alignment: { vertical: "center", horizontal: "left", indent: 1 },
      });
    }

    // ---- header -------------------------------------------
    const headFill = (c, sub) => {
      if (c >= 2 && c <= 4) return sub ? C.violetSoft : C.violet;
      if (c >= 5 && c <= 7) return sub ? C.indigoSoft : C.indigo;
      return C.deep;
    };

    for (let r = 3; r <= 4; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        put(r, c, {
          fill: solid(headFill(c, r === 4)),
          font: font(C.white, { bold: true }),
          alignment: {
            horizontal: "center",
            vertical: "center",
            wrapText: true,
          },
          border: box(C.white),
        });
      }
    }

    // ---- body ---------------------------------------------
    rows.forEach((row, index) => {
      const r = HEAD_ROWS + index;
      const band = index % 2 === 1 ? C.zebra : C.white;

      for (let c = 0; c < COLS; c += 1) {
        const value = aoa[r][c];
        const isDash = value === "—";

        let style = {
          fill: solid(band),
          font: font(C.ink, { bold: c === 4 || c === 7 }),
          border: box(C.line),
          alignment: { vertical: "center", horizontal: "right", indent: 1 },
        };
        let numFmt = "#,##0.00";

        if (c === 0) {
          style.font = font(C.ink, { bold: true });
          style.alignment = {
            vertical: "center",
            horizontal: "left",
            indent: 1,
          };
        } else if (c === 1) {
          const pill = getStatusPill(row.status);

          style = {
            fill: solid(pill.bg),
            font: font(pill.fg, { bold: true }),
            border: box(C.white),
            alignment: { vertical: "center", horizontal: "center" },
          };
        } else if (isDash) {
          style.font = font(C.faint);
          style.alignment = { vertical: "center", horizontal: "center" };
        } else if (c === 8) {
          const diffColor =
            row.difference > 0
              ? C.green
              : row.difference < 0
                ? C.red
                : C.muted;

          style.font = font(diffColor, { bold: true });
          numFmt = "+#,##0.00;-#,##0.00;0.00";
        } else if (c === 9) {
          style.fill = solid(C.pale);
          style.font = font(C.deep, { bold: true });
        }

        const cell = put(r, c, style);

        if (typeof cell.v === "number") {
          cell.t = "n";
          cell.z = numFmt;
        }
      }
    });

    // ---- legend -------------------------------------------
    const legendRow = HEAD_ROWS + rows.length + 1;

    for (let c = 0; c < COLS; c += 1) {
      put(legendRow, c, {
        font: font(C.muted, { sz: 9, italic: true }),
        alignment: { vertical: "center", horizontal: "left", indent: 1 },
      });
    }

    // ---- layout -------------------------------------------
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: LAST } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: LAST } },
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
      { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
      { s: { r: 3, c: 2 }, e: { r: 3, c: 4 } },
      { s: { r: 3, c: 5 }, e: { r: 3, c: 7 } },
      { s: { r: 3, c: 8 }, e: { r: 4, c: 8 } },
      { s: { r: 3, c: 9 }, e: { r: 4, c: 9 } },
      { s: { r: legendRow, c: 0 }, e: { r: legendRow, c: LAST } },
    ];

    sheet["!cols"] = [
      { wch: 15 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 15 },
      { wch: 17 },
    ];

    sheet["!rows"] = [
      { hpt: 36 },
      { hpt: 22 },
      { hpt: 8 },
      { hpt: 26 },
      { hpt: 26 },
      ...rows.map(() => ({ hpt: 24 })),
      { hpt: 10 },
      { hpt: 20 },
    ];

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

  // ----------------------------------------------------------
  // HISTORY  -  PDF
  // ----------------------------------------------------------

  const exportPdf = async (rows) => {
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable =
      autoTableModule.default || autoTableModule.autoTable;
    const C = EXPORT_COLORS;

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

    const closedCount = rows.filter(
      (row) => row.status === "Closed"
    ).length;
    const openCount = rows.length - closedCount;
    const latest = rows[rows.length - 1];

    const tableTop = drawExportHeader(pdf, {
      title: "Cash Register History",
      subtitle: "All amounts in Rs.",
      generated: formatDateTime(new Date()),
      cards: [
        { label: "Records", value: rows.length, accent: C.violet },
        { label: "Closed", value: closedCount, accent: C.green },
        { label: "Open", value: openCount, accent: C.blue },
        {
          label: "Latest total money (Rs.)",
          value: latest ? money(latest.totalMoney) : "—",
          accent: C.violetSoft,
        },
      ],
      legend:
        "Total = Cash + Digital   |   Total Money = Total amount of the day (Cash + Digital - Expenses)",
    });

    autoTable(pdf, {
      startY: tableTop + 6,
      theme: "plain",
      margin: { top: 40, left: 40, right: 40, bottom: 46 },
      head: [
        [
          { content: "Date", rowSpan: 2 },
          { content: "Status", rowSpan: 2 },
          { content: "Opening", colSpan: 3 },
          { content: "Closing", colSpan: 3 },
          { content: "Difference", rowSpan: 2 },
          { content: "Total Money", rowSpan: 2 },
        ],
        [
          "Cash",
          "Digital Money",
          "Total",
          "Cash",
          "Digital Money",
          "Total",
        ],
      ],
      body: rows.map((row) => [
        row.date,
        "",
        money(row.openCash),
        money(row.openDigital),
        money(row.openTotal),
        money(row.closeCash),
        money(row.closeDigital),
        money(row.closeTotal),
        row.difference === null
          ? "—"
          : `${row.difference > 0 ? "+" : ""}${money(row.difference)}`,
        money(row.totalMoney),
      ]),
      styles: {
        font: "helvetica",
        fontSize: 8.5,
        cellPadding: { top: 8, bottom: 8, left: 6, right: 8 },
        halign: "right",
        valign: "middle",
        lineWidth: 0,
        textColor: C.ink,
      },
      headStyles: {
        fillColor: C.deep,
        textColor: C.white,
        halign: "center",
        valign: "middle",
        fontStyle: "bold",
        lineWidth: 0.6,
        lineColor: C.white,
      },
      alternateRowStyles: { fillColor: C.zebra },
      columnStyles: {
        0: { halign: "left", fontStyle: "bold", cellWidth: 66 },
        1: { halign: "center", cellWidth: 66 },
        4: { fontStyle: "bold" },
        7: { fontStyle: "bold" },
        8: { fontStyle: "bold" },
        9: { fontStyle: "bold" },
      },
      didParseCell: (data) => {
        const col = data.column.index;

        if (data.section === "head") {
          const sub = data.row.index === 1;

          if (col >= 2 && col <= 4) {
            data.cell.styles.fillColor = sub ? C.violetSoft : C.violet;
          } else if (col >= 5 && col <= 7) {
            data.cell.styles.fillColor = sub ? C.indigoSoft : C.indigo;
          }

          return;
        }

        if (data.section !== "body") return;

        const row = rows[data.row.index];

        if (data.cell.raw === "—") {
          data.cell.styles.textColor = C.faint;
          data.cell.styles.halign = "center";
        }

        if (col === 8 && row) {
          if (row.difference > 0) {
            data.cell.styles.textColor = C.green;
          } else if (row.difference < 0) {
            data.cell.styles.textColor = C.red;
          } else if (row.difference === 0) {
            data.cell.styles.textColor = C.muted;
          }
        }

        if (col === 9) {
          data.cell.styles.fillColor = C.pale;
          data.cell.styles.textColor = C.deep;
        }
      },
      didDrawCell: (data) => {
        if (data.section !== "body") return;

        drawCellRule(pdf, data.cell);

        if (data.column.index === 1) {
          const row = rows[data.row.index];

          if (row) drawStatusPill(pdf, data.cell, getStatusPill(row.status));
        }
      },
    });

    drawExportFooter(pdf, "Cash Register History");

    pdf.save(`cash-register-history-${todayKey}.pdf`);
  };

  const handleExport = async (format) => {
    if (filteredRegisters.length === 0) {
      alert("No records available to export.");
      return;
    }

    setExporting(format);

    try {
      const rows = buildExportRows();

      if (format === "pdf") {
        await exportPdf(rows);
      } else {
        await exportExcel(rows);
      }

      setShowExportModal(false);
    } catch (exportError) {
      console.error("Export error:", exportError);

      alert(
        "Unable to create the file. Make sure the xlsx-js-style, jspdf and jspdf-autotable packages are installed."
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

  const openCreateEntry = () => {
    setEntryDate(getDateKey());
    setEntryOpenDen(emptyDenominations());
    setEntryOpenDigital(emptyDigital());
    setEntryCloseDen(emptyDenominations());
    setEntryCloseDigital(emptyDigital());
    setEntryModal({ mode: "create", id: null, status: "closed" });
  };

  const openEditEntry = (item) => {
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

          cashAdded: 0,
          cashRemoved: 0,
          cashSales: 0,

          expectedCash: openCash,

          closingCash: closeCash,
          closingDenominations: { ...entryCloseDen },

          cashDifference: closeCash - openCash,
          difference:
            closeCash +
            closeDigitalAmount -
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
          updatedAt: serverTimestamp(),
        };

        if (hasClosing) {
          const newClosingDigital = cleanDigital(entryCloseDigital);

          payload.closingCash = closeCash;
          payload.closingDenominations = { ...entryCloseDen };
          payload.closingDigital = newClosingDigital;
          payload.digitalBalances = newClosingDigital;
          payload.cashDifference = closeCash - expectedCash;
          payload.difference =
            closeCash +
            closeDigitalAmount -
            (openCash + openDigitalAmount);
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
    closingDigitalTotal -
    getOpeningTotal(openRegister);

  // ----------------------------------------------------------
  // BOTTOM NAVIGATION  (curved-notch bar)
  // Items scroll to a section of the page; the active one is
  // tracked while scrolling.
  // ----------------------------------------------------------

  const navItems = useMemo(
    () => [
      { id: "cash-sec-overview", label: "Overview", Icon: LayoutDashboard },
      ...(currentRegister
        ? [{ id: "cash-sec-money", label: "Money", Icon: Landmark }]
        : []),
      { id: "cash-sec-history", label: "History", Icon: HistoryIcon },
    ],
    [Boolean(currentRegister)] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [activeNav, setActiveNav] = useState("cash-sec-overview");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveNav(entry.target.id);
        });
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: 0 }
    );

    navItems.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [navItems, loading]);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveNav(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeNavIndex = Math.max(
    0,
    navItems.findIndex((item) => item.id === activeNav)
  );

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="cash-register-page" data-theme={theme}>

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
          <button
            type="button"
            className="cash-icon-action cash-theme-btn"
            onClick={toggleTheme}
            aria-label={
              theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}
          </button>

          <button
            type="button"
            className="cash-icon-action wide"
            onClick={() =>
              navigate(role === "admin" ? "/admin" : "/attendant")
            }
            aria-label="Back to dashboard"
            title="Back to dashboard"
          >
            <ArrowLeft size={18} />
            <span>Dashboard</span>
          </button>

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
          MAIN REGISTER
      ==================================================== */}

      <section className="cash-main-card" id="cash-sec-overview">

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

          <div className="cr-flow">

            <div className="cr-flow-cell">
              <span className="cr-flow-label">
                <i className="cr-flow-sign">●</i>
                Opening cash
              </span>
              <strong className="cr-flow-value">
                {formatCurrency(openingCash)}
              </strong>
              <small className="cr-flow-note">In drawer at start</small>
            </div>

            <div className={`cr-flow-cell pos${cashSales > 0 ? " has-value" : ""}`}>
              <span className="cr-flow-label">
                <i className="cr-flow-sign">+</i>
                Cash sales
              </span>
              <strong className="cr-flow-value">
                {formatCurrency(cashSales)}
              </strong>
              <small className="cr-flow-note">
                {cashSales > 0 ? "From today's sales" : "Fills in as you sell"}
              </small>
            </div>

            <button
              type="button"
              className={`cr-flow-cell pos action${cashAdded > 0 ? " has-value" : ""}`}
              disabled={!currentRegister}
              onClick={() => setMovementModal("add")}
            >
              <span className="cr-flow-label">
                <i className="cr-flow-sign">+</i>
                Added
              </span>
              <strong className="cr-flow-value">
                {formatCurrency(cashAdded)}
              </strong>
              <small className="cr-flow-note">
                {openRegister
                  ? "Tap to add cash"
                  : cashAdded > 0
                    ? "Tap to view"
                    : "Nothing added"}
              </small>
              <ChevronRight size={15} className="cr-flow-go" />
            </button>

            <button
              type="button"
              className={`cr-flow-cell neg action${cashRemoved > 0 ? " has-value" : ""}`}
              disabled={!currentRegister}
              onClick={() => setMovementModal("remove")}
            >
              <span className="cr-flow-label">
                <i className="cr-flow-sign">−</i>
                Removed
              </span>
              <strong className="cr-flow-value">
                {formatCurrency(cashRemoved)}
              </strong>
              <small className="cr-flow-note">
                {openRegister
                  ? "Tap to take cash out"
                  : cashRemoved > 0
                    ? "Tap to view"
                    : "Nothing removed"}
              </small>
              <ChevronRight size={15} className="cr-flow-go" />
            </button>

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

          <div className="cash-action-head">
            <div className="cash-action-icon">
              <Calculator size={18} />
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
          </div>

          <div className="cash-quick-actions">
            {openRegister ? (
              <button
                type="button"
                className="cash-quick-btn danger"
                onClick={() => openCloseModal()}
              >
                <LockKeyhole size={17} />
                Close
              </button>
            ) : (
              <button
                type="button"
                className="cash-quick-btn primary"
                onClick={openOpenModal}
              >
                <UnlockKeyhole size={17} />
                Open
              </button>
            )}

            <button
              type="button"
              className="cash-quick-btn"
              onClick={openCreateEntry}
            >
              <Plus size={17} />
              Add Entry
            </button>

            <button
              type="button"
              className="cash-quick-btn"
              onClick={() => {
                setShowExportModal(true);
              }}
            >
              <Download size={17} />
              Export
            </button>
          </div>

        </div>

      </section>

      {/* ====================================================
          STATS
      ==================================================== */}

      <section className="cr-kpis">

        {/* STATUS */}

        <article className="cr-kpi tone-purple">
          <div className="cr-kpi-head">
            <span className="cr-kpi-icon">
              {openRegister ? (
                <UnlockKeyhole size={16} />
              ) : (
                <LockKeyhole size={16} />
              )}
            </span>
            <span className="cr-kpi-label">Today's Status</span>
          </div>

          <strong className="cr-kpi-value">
            {openRegister
              ? "Open"
              : latestTodayRegister
                ? "Closed"
                : "Not Opened"}
          </strong>

          <div className="cr-kpi-foot">
            <span className={`cr-chip${openRegister ? " live" : ""}`}>
              <i />
              {openRegister
                ? `Opened at ${statusTime || "—"}`
                : latestTodayRegister
                  ? `Closed at ${statusTime || "—"}`
                  : "Open the register to start"}
            </span>
          </div>
        </article>

        {/* OPENING TOTAL */}

        <article className="cr-kpi tone-blue">
          <div className="cr-kpi-head">
            <span className="cr-kpi-icon">
              <Banknote size={16} />
            </span>
            <span className="cr-kpi-label">Opening Overall Total</span>
          </div>

          <strong className="cr-kpi-value">
            {formatCurrency(openingTotal)}
          </strong>

          <div className="cr-kpi-foot">
            <span className="cr-chip">
              Cash {formatCurrency(openingCash)}
            </span>
            <span className="cr-chip">
              Digital {formatCurrency(openingDigitalAmount)}
            </span>
          </div>
        </article>

        {/* CASH IN DRAWER */}

        <article className="cr-kpi tone-green">
          <div className="cr-kpi-head">
            <span className="cr-kpi-icon">
              <WalletCards size={16} />
            </span>
            <span className="cr-kpi-label">
              {currentRegister?.status === "closed"
                ? "Closing Cash"
                : "Cash in Drawer"}
            </span>
          </div>

          <strong className="cr-kpi-value">
            {formatCurrency(currentCash)}
          </strong>

          <div className="cr-kpi-foot">
            <span className="cr-chip">
              {currentRegister?.status === "closed"
                ? `Expected ${formatCurrency(storedExpectedCash)}`
                : `Incl. ${formatCurrency(cashSales)} cash sales`}
            </span>
          </div>
        </article>

        {/* OVERALL TOTAL */}

        <article className="cr-kpi tone-orange">
          <div className="cr-kpi-head">
            <span className="cr-kpi-icon">
              <CircleDollarSign size={16} />
            </span>
            <span className="cr-kpi-label">
              {currentRegister?.status === "closed"
                ? "Closing Overall Total"
                : "Current Overall Total"}
            </span>
          </div>

          <strong className="cr-kpi-value">
            {formatCurrency(currentOverallTotal)}
          </strong>

          <div className="cr-kpi-foot">
            <span
              className={`cr-chip${
                changeSinceOpening > 0
                  ? " up"
                  : changeSinceOpening < 0
                    ? " down"
                    : ""
              }`}
            >
              {changeSinceOpening > 0
                ? `▲ +${formatCurrency(changeSinceOpening)} since opening`
                : changeSinceOpening < 0
                  ? `▼ −${formatCurrency(Math.abs(changeSinceOpening))} since opening`
                  : "No change since opening"}
            </span>
          </div>
        </article>

      </section>

      {/* ====================================================
          DIGITAL MONEY + EXPENSES + DAY TOTAL
      ==================================================== */}

      {currentRegister && (
        <section className="cash-money-section" id="cash-sec-money">

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

            {/* EXPENSES */}

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

            </div>

          </div>

          {/* DAY TOTAL */}

          <div className="cr-day">

            {/* LEFT: big number + cash/digital split */}

            <div className="cr-day-hero">
              <div className="cr-day-top">
                <span className="cr-day-label">Day total</span>

                <span className={`cr-day-status${openRegister ? " live" : ""}`}>
                  <i />
                  {openRegister ? "Live · register open" : "Final · register closed"}
                </span>
              </div>

              <strong className="cr-day-amount">
                {formatCurrency(dayTotals.net)}
              </strong>

              <span className="cr-day-caption">
                Total amount of the day · {formatDate(currentRegister.dateKey)}
              </span>

              <div className="cr-day-split">
                <div className="cr-day-bar">
                  <span style={{ width: `${daySplit.cash}%` }} />
                  <span style={{ width: `${daySplit.digital}%` }} />
                </div>

                <div className="cr-day-legend">
                  <span className="cash">
                    <i />
                    Cash {daySplit.cash}%
                  </span>
                  <span className="digital">
                    <i />
                    Digital {daySplit.digital}%
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT: how the total is made */}

            <div className="cr-day-statement">

              <div className="cr-day-row cash">
                <span className="cr-day-ico"><Banknote size={16} /></span>
                <span className="cr-day-name">
                  Cash
                  <small>
                    {currentRegister.status === "closed"
                      ? "Counted at closing"
                      : "Expected in drawer"}
                  </small>
                </span>
                <strong className="cr-day-value">
                  {formatCurrency(dayTotals.cash)}
                </strong>
              </div>

              <div className="cr-day-row digital">
                <span className="cr-day-ico"><Landmark size={16} /></span>
                <span className="cr-day-name">
                  Digital money
                  <small>Bank &amp; wallet balances</small>
                </span>
                <strong className="cr-day-value">
                  {formatCurrency(
                    openRegister ? digitalDraftTotal : dayTotals.digital
                  )}
                </strong>
              </div>

              <div className="cr-day-row money">
                <span className="cr-day-ico"><WalletCards size={16} /></span>
                <span className="cr-day-name">
                  Total money
                  <small>Cash + digital</small>
                </span>
                <strong className="cr-day-value">
                  {formatCurrency(dayTotals.totalMoney)}
                </strong>
              </div>

              <div className="cr-day-row expense">
                <span className="cr-day-ico"><Receipt size={16} /></span>
                <span className="cr-day-name">
                  Expenses
                  <small>Spent today</small>
                </span>
                <strong className="cr-day-value">
                  −{formatCurrency(dayTotals.expenses)}
                </strong>
              </div>

              <div className="cr-day-row total">
                <span className="cr-day-ico"><CircleDollarSign size={16} /></span>
                <span className="cr-day-name">Total amount of the day</span>
                <strong className="cr-day-value">
                  {formatCurrency(dayTotals.net)}
                </strong>
              </div>

            </div>

          </div>

        </section>
      )}

      {/* ====================================================
          HISTORY
      ==================================================== */}

      <section className="cash-history-card" id="cash-sec-history">

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

                      <td data-label="Status">
                        <span className={`cash-table-status ${item.status}`}>
                          <i />
                          {item.status}
                        </span>
                      </td>

                      <td data-label="Date">
                        <strong>{formatDate(item.dateKey)}</strong>
                        <small>{formatDateTime(item.openedAt)}</small>
                      </td>

                      <td data-label="Opening">
                        <strong>{formatCurrency(getOpeningTotal(item))}</strong>
                      </td>

                      <td data-label="Closing">
                        {itemClosingTotal === null ? (
                          "—"
                        ) : (
                          <strong>{formatCurrency(itemClosingTotal)}</strong>
                        )}
                      </td>

                      <td data-label="Difference">
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

                      <td data-label="Total money">
                        <strong>{formatCurrency(getTotalMoney(item))}</strong>
                      </td>

                      <td
                        className="cash-actions-td"
                        data-label=""
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

            <div className="cash-modal-grand">
              <div>
                <span>Cash</span>
                <strong>{formatCurrency(openingModalTotal)}</strong>
              </div>
              <div>
                <span>Digital</span>
                <strong>{formatCurrency(openingDigitalTotal)}</strong>
              </div>
              <div className="sum">
                <span>Total</span>
                <strong>
                  {formatCurrency(
                    openingModalTotal +
                    openingDigitalTotal
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

              {/* CASH IN / OUT DURING THE DAY */}
              {(() => {
                const added = getMovementSummary(openRegister, "add");
                const removed = getMovementSummary(openRegister, "remove");

                const renderSide = (summary, type) => (
                  <div className={`cr-close-mv ${type}`}>
                    <div className="cr-close-mv-head">
                      <span>
                        {type === "add" ? "+ Cash added" : "− Cash taken out"}
                      </span>
                      <strong>
                        {type === "add" ? "+" : "−"}
                        {formatCurrency(summary.total)}
                      </strong>
                    </div>

                    {summary.count === 0 ? (
                      <small>None today</small>
                    ) : (
                      <div className="cr-close-mv-chips">
                        {summary.chips.map((chip) => (
                          <span key={chip.label}>
                            {chip.label} × {chip.pcs}
                          </span>
                        ))}
                        {summary.other > 0 && (
                          <span>Other {formatCurrency(summary.other)}</span>
                        )}
                      </div>
                    )}
                  </div>
                );

                return (
                  <div className="cash-modal-block">
                    <div className="cash-modal-block-head">
                      <div>
                        <span className="cash-section-label">
                          CASH IN / OUT
                        </span>
                        <p>
                          Opening {formatCurrency(Number(openRegister.openingCash || 0))}
                          {" + "}Sales {formatCurrency(Number(openRegister.cashSales || 0))}
                          {" + "}Added {formatCurrency(added.total)}
                          {" − "}Removed {formatCurrency(removed.total)}
                        </p>
                      </div>
                    </div>

                    <div className="cr-close-mv-grid">
                      {renderSide(added, "add")}
                      {renderSide(removed, "remove")}
                    </div>
                  </div>
                );
              })()}

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
                <div className="sum">
                  <span>Total of the day</span>
                  <strong>
                    {formatCurrency(
                      getDayTotals({
                        ...openRegister,
                        status: "closed",
                        closingCash: closingModalTotal,
                        digitalBalances: closingDigital,
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

      {movementModal && currentRegister && (
        <div
          className="cash-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeMovementModal();
            }
          }}
        >
          <div className="cash-modal cash-movement-modal">
            <div className="cash-modal-head">
              <div className="cash-modal-title">
                <div
                  className={`cash-modal-icon${
                    movementModal === "remove" ? " danger" : ""
                  }`}
                >
                  {movementModal === "remove" ? (
                    <Minus size={17} />
                  ) : (
                    <Plus size={17} />
                  )}
                </div>

                <div>
                  <strong>Cash in / out</strong>
                  <span>
                    Money you put into or take out of the drawer today
                    (not sales, not expenses).
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="cash-modal-close"
                onClick={closeMovementModal}
                disabled={savingMovement}
              >
                <X size={17} />
              </button>
            </div>

            {openRegister ? (
              <div className="cr-mv-form">
                <div className="cr-mv-tabs">
                  <button
                    type="button"
                    className={movementModal === "add" ? "active add" : ""}
                    onClick={() => setMovementModal("add")}
                  >
                    <Plus size={14} /> Add cash
                  </button>
                  <button
                    type="button"
                    className={movementModal === "remove" ? "active remove" : ""}
                    onClick={() => setMovementModal("remove")}
                  >
                    <Minus size={14} /> Take out
                  </button>
                </div>

                <div className="cr-mv-notes">
                  {renderDenominationEditor(
                    movementDen,
                    setMovementDen,
                    true
                  )}
                </div>

                <div className={`cr-mv-total ${movementModal}`}>
                  <span>
                    {movementModal === "add" ? "Total to add" : "Total to take out"}
                  </span>
                  <strong>
                    {movementModal === "remove" ? "−" : "+"}
                    {formatCurrency(calculateDenominationTotal(movementDen))}
                  </strong>
                </div>

                <input
                  type="text"
                  className="cr-mv-input"
                  maxLength={80}
                  placeholder={
                    movementModal === "add"
                      ? "Reason (e.g. Change from bank, Owner top-up)"
                      : "Reason (e.g. Deposited to bank, Owner took cash)"
                  }
                  value={movementReason}
                  onChange={(event) => setMovementReason(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSaveMovement();
                  }}
                />

                <button
                  type="button"
                  className={`cr-mv-save ${movementModal}`}
                  onClick={handleSaveMovement}
                  disabled={savingMovement}
                >
                  {savingMovement
                    ? "Saving…"
                    : movementModal === "add"
                      ? "Add to drawer"
                      : "Take out of drawer"}
                </button>

                <p className="cr-mv-hint">
                  Drawer now: <strong>{formatCurrency(storedExpectedCash)}</strong>
                </p>
              </div>
            ) : (
              <p className="cr-mv-hint">
                The register is closed, so entries can't be changed.
              </p>
            )}

            <div className="cr-mv-list">
              <div className="cash-section-label">TODAY'S ENTRIES</div>

              {currentMovements.length === 0 ? (
                <div className="cr-mv-empty">No cash added or taken out yet.</div>
              ) : (
                currentMovements.map((item) => (
                  <div
                    key={item.id}
                    className={`cr-mv-item ${item.type === "remove" ? "remove" : "add"}`}
                  >
                    <span className="cr-mv-badge">
                      {item.type === "remove" ? <Minus size={14} /> : <Plus size={14} />}
                    </span>

                    <span className="cr-mv-info">
                      <strong>{item.reason}</strong>
                      <small>
                        {formatTimeOnly(item.createdAtMs)}
                        {item.addedBy ? ` · ${item.addedBy}` : ""}
                      </small>
                      {DENOMINATIONS.some(
                        (d) => Number(item.denominations?.[d.value]) > 0
                      ) && (
                        <small className="cr-mv-break">
                          {DENOMINATIONS.filter(
                            (d) => Number(item.denominations?.[d.value]) > 0
                          )
                            .map((d) =>
                              d.type === "coin"
                                ? `Coins ${formatCurrency(Number(item.denominations[d.value]))}`
                                : `${item.denominations[d.value]} × ${d.label}`
                            )
                            .join(" · ")}
                        </small>
                      )}
                    </span>

                    <span className="cr-mv-amount">
                      {item.type === "remove" ? "−" : "+"}
                      {formatCurrency(Number(item.amount || 0))}
                    </span>

                    {openRegister && (
                      <button
                        type="button"
                        className="cr-mv-del"
                        onClick={() => handleDeleteMovement(item)}
                        aria-label="Delete entry"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
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
                    Export history
                  </strong>
                  <span>
                    Choose a file type. Date, status, opening, closing, total and difference.
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
              {`Exports the ${filteredRegisters.length} record(s) shown in the list below, using the current search and status filter.`}
            </p>
          </div>
        </div>
      )}

      {/* ====================================================
          BOTTOM NAVIGATION
      ==================================================== */}

      <nav
        className="cash-bottom-nav"
        aria-label="Cash register sections"
        style={{
          "--n": navItems.length + 1,
          "--i": activeNavIndex,
        }}
      >
        <div className="cash-bottom-nav-bar" />

        {navItems.map(({ id, label, Icon }, index) => (
          <button
            key={id}
            type="button"
            className={`cash-nav-item${index === activeNavIndex ? " active" : ""}`}
            onClick={() => scrollToSection(id)}
            aria-current={index === activeNavIndex ? "true" : undefined}
          >
            <span className="cash-nav-icon">
              <Icon size={20} />
            </span>
            <span className="cash-nav-label">{label}</span>
          </button>
        ))}

        <button
          type="button"
          className={`cash-nav-item cash-nav-action${openRegister ? " danger" : ""}`}
          onClick={openRegister ? () => openCloseModal() : openOpenModal}
        >
          <span className="cash-nav-icon">
            {openRegister ? <LockKeyhole size={20} /> : <UnlockKeyhole size={20} />}
          </span>
          <span className="cash-nav-label">
            {openRegister ? "Close" : "Open"}
          </span>
        </button>
      </nav>

      <FloatingCalculator theme={theme} />

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