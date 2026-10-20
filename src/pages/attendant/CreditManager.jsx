import React, { useEffect, useMemo, useState } from "react";

import {
  collection,
  setDoc,
  arrayUnion,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import FloatingCalculator from "./FloatingCalculator";

import {
  Plus,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Receipt,
  Trash2,
  Pencil,
  FileText,
  FileSpreadsheet,
  WalletCards,
  Users,
  ArrowUpRight,
  CircleDollarSign,
  Banknote,
} from "lucide-react";

import { db } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatCurrency } from "../../utils/currency";

import "./CreditManager.css";

// ============================================================
// CREDIT / LOAN MANAGER
//
// Credit is kept completely separate from the cash register.
// Every credit is its own document in the "credits" collection,
// so it never touches the register's opening / closing / day
// totals. A credit keeps its ORIGINAL amount and a running
// `paid` total; balance (not paid) = amount - paid.
// ============================================================

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

// Credit status: Paid (settled) / Partial (some paid) / Unpaid.
function getCreditStatusLabel(credit, paid) {
  if (credit > 0 && paid >= credit) return "Paid";
  if (paid > 0) return "Partial";
  return "Unpaid";
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

// ------------------------------------------------------------
// OLD DATA
// Before this page existed, credits lived inside each cash
// register record. This gathers the latest copy of every one so
// they can be copied into the new "credits" collection once.
// The old register records are not changed or deleted.
// ------------------------------------------------------------

function collectLegacyCredits(registers) {
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

  // Oldest register first, so a newer copy of the same credit wins.
  const map = new Map();

  ordered.forEach((register) => {
    const list =
      register?.status === "closed" &&
        Array.isArray(register.closingCredits)
        ? register.closingCredits
        : Array.isArray(register?.credits)
          ? register.credits
          : [];

    list.forEach((item) => {
      const id = String(
        item?.id || `legacy-${item?.createdAtMs || 0}-${item?.reason || ""}`
      ).replace(/\//g, "-");

      map.set(id, {
        ...item,
        id,
        attendantId: register.attendantId || "",
        attendantName: register.attendantName || "",
      });
    });
  });

  return [...map.values()];
}

// ============================================================
// COMPONENT
// ============================================================

export default function CreditManager() {
  const { user, role, profile } = useAuth();

  // Same saved light / dark choice as the cash register page.
  const [theme] = useState(() => {
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

  const todayKey = getDateKey();

  const [credits, setCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // New credit form
  const [creditReason, setCreditReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditPaid, setCreditPaid] = useState("");
  const [savingCredit, setSavingCredit] = useState(false);

  // Credit preview box
  const [detailId, setDetailId] = useState(null);
  const [creditDetailPay, setCreditDetailPay] = useState("");
  const [creditDetailSaving, setCreditDetailSaving] = useState(false);
  const [creditEdit, setCreditEdit] = useState(null);
  const [creditPayEdit, setCreditPayEdit] = useState(null);

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState("");

  // Credits found in the old cash register records
  const [legacy, setLegacy] = useState([]);
  const [importing, setImporting] = useState(false);
  const [hideImport, setHideImport] = useState(false);

  const importFlagKey = `credit-legacy-imported-${user?.uid || ""}`;

  const editorName =
    profile?.name ||
    user?.displayName ||
    user?.email ||
    "Attendant";

  // ----------------------------------------------------------
  // FIRESTORE LISTENER  (attendant: own credits, admin: all)
  // ----------------------------------------------------------

  useEffect(() => {
    if (!user?.uid || !role) {
      setCredits([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const creditsRef = collection(db, "credits");

    const creditQuery =
      role === "admin"
        ? query(creditsRef)
        : query(creditsRef, where("attendantId", "==", user.uid));

    const unsubscribe = onSnapshot(
      creditQuery,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        data.sort(
          (a, b) =>
            Number(b?.createdAtMs || 0) - Number(a?.createdAtMs || 0)
        );

        setCredits(data);
        setLoading(false);
      },
      (firebaseError) => {
        console.error("Credit Firestore error:", firebaseError);

        setError(firebaseError.message || "Unable to load credits.");
        setCredits([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, role]);

  // ----------------------------------------------------------
  // OLD CREDITS  (read once from the cash register records)
  // ----------------------------------------------------------

  useEffect(() => {
    if (!user?.uid || !role) return undefined;

    try {
      if (window.localStorage.getItem(importFlagKey) === "1") {
        return undefined;
      }
    } catch {
      /* storage not available */
    }

    let cancelled = false;

    (async () => {
      try {
        const registersRef = collection(db, "cashRegisters");

        const registerQuery =
          role === "admin"
            ? query(registersRef)
            : query(registersRef, where("attendantId", "==", user.uid));

        const snapshot = await getDocs(registerQuery);

        if (cancelled) return;

        setLegacy(
          collectLegacyCredits(
            snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
          )
        );
      } catch (firebaseError) {
        console.warn("Old credit lookup failed:", firebaseError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, role, importFlagKey]);

  const missingLegacy = useMemo(() => {
    const ids = new Set(credits.map((item) => item.id));
    return legacy.filter((item) => !ids.has(item.id));
  }, [legacy, credits]);

  const handleImportLegacy = async () => {
    if (missingLegacy.length === 0 || importing) return;

    setImporting(true);

    try {
      for (let start = 0; start < missingLegacy.length; start += 400) {
        const batch = writeBatch(db);

        missingLegacy.slice(start, start + 400).forEach((item) => {
          batch.set(doc(db, "credits", item.id), {
            reason: item.reason || "",
            amount: Number(item.amount) || 0,
            paid: getCreditPaid(item),
            payments: Array.isArray(item.payments) ? item.payments : [],
            createdAtMs: Number(item.createdAtMs) || Date.now(),
            attendantId: item.attendantId || user.uid,
            attendantName: item.attendantName || editorName,
            addedBy: item.addedBy || editorName,
            importedFromRegister: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

        await batch.commit();
      }

      try {
        window.localStorage.setItem(importFlagKey, "1");
      } catch {
        /* storage not available */
      }

      setLegacy([]);
    } catch (firebaseError) {
      console.error("Import credit error:", firebaseError);

      alert(firebaseError.message || "Unable to import the old credits.");
    } finally {
      setImporting(false);
    }
  };

  // ----------------------------------------------------------
  // TOTALS + FILTER
  // ----------------------------------------------------------

  const totals = useMemo(() => {
    const given = credits.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
    const paid = credits.reduce(
      (sum, item) => sum + getCreditPaid(item),
      0
    );
    const pending = credits.filter(
      (item) => getCreditBalance(item) > 0
    );

    return {
      given,
      paid,
      due: calculateCreditTotal(credits),
      pendingCount: pending.length,
    };
  }, [credits]);

  const filteredCredits = useMemo(() => {
    const term = search.trim().toLowerCase();

    return credits.filter((item) => {
      const settled = getCreditBalance(item) <= 0;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending" && !settled) ||
        (statusFilter === "paid" && settled);

      const matchesSearch =
        !term ||
        String(item.reason || "").toLowerCase().includes(term) ||
        String(item.attendantName || "").toLowerCase().includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [credits, search, statusFilter]);

  // ----------------------------------------------------------
  // ADD CREDIT
  // ----------------------------------------------------------

  const handleAddCredit = async () => {
    if (!user?.uid) {
      alert("User session not found.");
      return;
    }

    const reason = creditReason.trim();
    const amount = Number(creditAmount);
    const paid = Number(creditPaid) || 0;

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

    setSavingCredit(true);

    try {
      const now = Date.now();

      const creditRef = doc(collection(db, "credits"));

      const payments =
        paid > 0
          ? [{ amount: paid, atMs: now, note: "Paid at entry" }]
          : [];

      await setDoc(creditRef, {
        reason,
        amount,
        paid,
        payments,
        createdAtMs: now,
        attendantId: user.uid,
        attendantName: editorName,
        addedBy: editorName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Also add it to today's open cash register (same id), so it
      // shows on the Cash Register page too. Never blocks the save.
      try {
        const regQuery =
          role === "admin"
            ? query(
              collection(db, "cashRegisters"),
              where("dateKey", "==", getDateKey()),
              where("status", "==", "open")
            )
            : query(
              collection(db, "cashRegisters"),
              where("attendantId", "==", user.uid),
              where("dateKey", "==", getDateKey()),
              where("status", "==", "open")
            );

        const regSnap = await getDocs(regQuery);

        if (!regSnap.empty) {
          await updateDoc(regSnap.docs[0].ref, {
            credits: arrayUnion({
              id: creditRef.id,
              reason,
              amount,
              paid,
              payments,
              createdAtMs: now,
              addedBy: editorName,
            }),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (syncError) {
        console.warn("Cash register sync failed:", syncError);
      }

      setCreditReason("");
      setCreditAmount("");
      setCreditPaid("");
    } catch (firebaseError) {
      console.error("Add credit error:", firebaseError);

      alert(firebaseError.message || "Unable to add credit.");
    } finally {
      setSavingCredit(false);
    }
  };

  // ----------------------------------------------------------
  // CREDIT PREVIEW BOX  (pay / edit / delete)
  // ----------------------------------------------------------

  const creditDetailItem = detailId
    ? credits.find((item) => item.id === detailId) || null
    : null;

  const openCreditDetail = (item) => {
    setCreditDetailPay("");
    setCreditEdit(null);
    setCreditPayEdit(null);
    setDetailId(item.id);
  };

  const closeCreditDetail = () => {
    setDetailId(null);
    setCreditEdit(null);
    setCreditPayEdit(null);
  };

  // Saves changed fields of the credit shown in the box.
  const saveCreditFields = async (fields) => {
    if (!creditDetailItem) return false;

    setCreditDetailSaving(true);

    try {
      await updateDoc(doc(db, "credits", creditDetailItem.id), {
        ...fields,
        updatedAt: serverTimestamp(),
      });

      return true;
    } catch (firebaseError) {
      console.error("Update credit error:", firebaseError);

      alert(firebaseError.message || "Unable to update credit.");

      return false;
    } finally {
      setCreditDetailSaving(false);
    }
  };

  const handleCreditDetailPay = async () => {
    if (!creditDetailItem) return;

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

    const next = addPaymentToCredit(creditDetailItem, payment);

    const ok = await saveCreditFields({
      paid: next.paid,
      payments: next.payments,
    });

    if (ok) setCreditDetailPay("");
  };

  // Opens the box straight in edit mode (from the table).
  const startCreditEditFromTable = (item) => {
    openCreditDetail(item);
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

    const ok = await saveCreditFields({ reason, amount });

    if (ok) setCreditEdit(null);
  };

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

    const ok = await saveCreditFields({
      paid: newPaid,
      payments: payments.map((entry, index) =>
        index === creditPayEdit.idx ? { ...entry, amount: value } : entry
      ),
    });

    if (ok) setCreditPayEdit(null);
  };

  // Removes one payment (the amount goes back to "Not paid").
  const handleDeleteCreditPayment = async (entry) => {
    if (!creditDetailItem) return;

    if (
      !window.confirm(
        `Remove this payment of ${formatCurrency(entry.amount)}? It will be added back to "Not paid".`
      )
    ) {
      return;
    }

    const payments = Array.isArray(creditDetailItem.payments)
      ? creditDetailItem.payments
      : [];

    // Payment made before history tracking existed ("Earlier payment")
    if (entry.idx < 0) {
      const logged = payments.reduce(
        (sum, row) => sum + (Number(row?.amount) || 0),
        0
      );

      await saveCreditFields({ paid: logged });
      return;
    }

    await saveCreditFields({
      paid: Math.max(0, getCreditPaid(creditDetailItem) - entry.amount),
      payments: payments.filter((_, index) => index !== entry.idx),
    });
  };

  const handleDeleteCredit = async (target = creditDetailItem) => {
    if (!target) return;

    if (
      !window.confirm(
        `Delete the credit "${target.reason}" (${formatCurrency(
          Number(target.amount) || 0
        )}) and all its payments? This cannot be undone.`
      )
    ) {
      return;
    }

    setCreditDetailSaving(true);

    try {
      await deleteDoc(doc(db, "credits", target.id));

      if (detailId === target.id) closeCreditDetail();
    } catch (firebaseError) {
      console.error("Delete credit error:", firebaseError);

      alert(firebaseError.message || "Unable to delete credit.");
    } finally {
      setCreditDetailSaving(false);
    }
  };

  // ----------------------------------------------------------
  // EXPORT  (PDF / EXCEL)  -  the rows currently shown
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // CREDIT / LOAN HISTORY EXPORT (all days)
  //
  // Columns: Date | Name / Reason | Status | Amount Credit
  //          | Amount Paid | Amount Not Paid | Progress
  //          (+ a Total row)
  // ----------------------------------------------------------

  const buildCreditExportRows = () =>
    [...filteredCredits]
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
          status: getCreditStatusLabel(credit, paid),
          credit,
          paid,
          notPaid: getCreditBalance(item),
          percent: credit > 0 ? Math.min(1, paid / credit) : 1,
        };
      });

  const sumCreditRows = (rows) => {
    const totals = rows.reduce(
      (sum, row) => ({
        credit: sum.credit + row.credit,
        paid: sum.paid + row.paid,
        notPaid: sum.notPaid + row.notPaid,
      }),
      { credit: 0, paid: 0, notPaid: 0 }
    );

    return {
      ...totals,
      percent: totals.credit > 0 ? Math.min(1, totals.paid / totals.credit) : 1,
    };
  };

  const exportCreditExcel = async (rows) => {
    const excelModule = await import("xlsx-js-style");
    const XLSX = excelModule.default || excelModule;
    const C = EXPORT_COLORS;

    const COLS = 7;
    const LAST = COLS - 1;
    const HEAD_ROW = 3;
    const FIRST = HEAD_ROW + 1;

    const totals = sumCreditRows(rows);
    const blank = (count) => Array(count).fill("");

    const settled = rows.filter((row) => row.status === "Paid").length;

    const aoa = [
      ["Credit / Loan History", ...blank(LAST)],
      [
        `Amounts in ₹   |   ${rows.length} record(s)   |   ${settled} settled   |   Generated ${formatDateTime(new Date())}`,
        ...blank(LAST),
      ],
      blank(COLS),
      [
        "Date",
        "Name / Reason",
        "Status",
        "Amount Credit",
        "Amount Paid",
        "Amount Not Paid",
        "% Paid",
      ],
      ...rows.map((row) => [
        row.date,
        row.name,
        row.status,
        row.credit,
        row.paid,
        row.notPaid,
        row.percent,
      ]),
      [
        "Total",
        "",
        "",
        totals.credit,
        totals.paid,
        totals.notPaid,
        totals.percent,
      ],
    ];

    const sheet = XLSX.utils.aoa_to_sheet(aoa);

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

      put(HEAD_ROW, c, {
        fill: solid(C.violet),
        font: font(C.white, { bold: true }),
        alignment: {
          horizontal: c <= 1 ? "left" : "center",
          vertical: "center",
          indent: c <= 1 ? 1 : 0,
        },
        border: box(C.white),
      });
    }

    rows.forEach((row, index) => {
      const r = FIRST + index;
      const band = index % 2 === 1 ? C.zebra : C.white;

      for (let c = 0; c < COLS; c += 1) {
        let style = {
          fill: solid(band),
          font: font(C.ink),
          border: box(C.line),
          alignment: { vertical: "center", horizontal: "right", indent: 1 },
        };
        let numFmt = "#,##0.00";

        if (c === 0) {
          style.font = font(C.ink, { bold: true });
          style.alignment = { vertical: "center", horizontal: "left", indent: 1 };
        } else if (c === 1) {
          style.alignment = { vertical: "center", horizontal: "left", indent: 1 };
        } else if (c === 2) {
          const pill = getStatusPill(row.status);

          style = {
            fill: solid(pill.bg),
            font: font(pill.fg, { bold: true }),
            border: box(C.white),
            alignment: { vertical: "center", horizontal: "center" },
          };
        } else if (c === 4) {
          style.font = font(C.green, { bold: true });
        } else if (c === 5) {
          style.font = font(row.notPaid > 0 ? C.red : C.green, { bold: true });
        } else if (c === 6) {
          style.alignment = { vertical: "center", horizontal: "center" };
          style.font = font(
            row.percent >= 1 ? C.green : row.percent > 0 ? C.amber : C.red,
            { bold: true }
          );
          numFmt = "0%";
        }

        const cell = put(r, c, style);

        if (typeof cell.v === "number") {
          cell.t = "n";
          cell.z = numFmt;
        }
      }
    });

    const totalRow = FIRST + rows.length;

    for (let c = 0; c < COLS; c += 1) {
      const cell = put(totalRow, c, {
        fill: solid(C.deep),
        font: font(C.white, { bold: true, sz: 12 }),
        border: box(C.deep),
        alignment: {
          vertical: "center",
          horizontal: c === 0 ? "left" : c === 6 ? "center" : "right",
          indent: c === 6 ? 0 : 1,
        },
      });

      if (typeof cell.v === "number") {
        cell.t = "n";
        cell.z = c === 6 ? "0%" : "#,##0.00";
      }
    }

    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: LAST } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: LAST } },
    ];

    sheet["!cols"] = [
      { wch: 15 },
      { wch: 32 },
      { wch: 13 },
      { wch: 17 },
      { wch: 17 },
      { wch: 19 },
      { wch: 11 },
    ];

    sheet["!rows"] = [
      { hpt: 36 },
      { hpt: 22 },
      { hpt: 8 },
      { hpt: 26 },
      ...rows.map(() => ({ hpt: 24 })),
      { hpt: 28 },
    ];

    const book = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(book, sheet, "Credit History");

    XLSX.writeFile(book, `credit-loan-history-${todayKey}.xlsx`);
  };

  const exportCreditPdf = async (rows) => {
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

    const money = (value) =>
      Number(value).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const totals = sumCreditRows(rows);

    const tableTop = drawExportHeader(pdf, {
      title: "Credit / Loan History",
      subtitle: "All days  |  All amounts in Rs.",
      generated: formatDateTime(new Date()),
      cards: [
        { label: "Total credit (Rs.)", value: money(totals.credit), accent: C.violet },
        { label: "Amount paid (Rs.)", value: money(totals.paid), accent: C.green },
        { label: "Not paid (Rs.)", value: money(totals.notPaid), accent: C.red },
        {
          label: "Recovered",
          value: `${Math.round(totals.percent * 100)}%`,
          accent: C.violetSoft,
        },
      ],
      legend: `Not Paid = Credit - Paid   |   ${rows.length} record(s)`,
    });

    const progressColor = (percent) =>
      percent >= 1 ? C.green : percent > 0 ? [217, 119, 6] : C.red;

    autoTable(pdf, {
      startY: tableTop + 6,
      theme: "plain",
      margin: { top: 40, left: 40, right: 40, bottom: 46 },
      head: [
        [
          "Date",
          "Name / Reason",
          "Status",
          "Amount Credit",
          "Amount Paid",
          "Amount Not Paid",
          "Progress",
        ],
      ],
      body: [
        ...rows.map((row) => [
          row.date,
          row.name,
          "",
          money(row.credit),
          money(row.paid),
          money(row.notPaid),
          "",
        ]),
        [
          "Total",
          "",
          "",
          money(totals.credit),
          money(totals.paid),
          money(totals.notPaid),
          `${Math.round(totals.percent * 100)}%`,
        ],
      ],
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: { top: 8, bottom: 8, left: 8, right: 10 },
        halign: "right",
        valign: "middle",
        lineWidth: 0,
        textColor: C.ink,
      },
      headStyles: {
        fillColor: C.violet,
        textColor: C.white,
        halign: "center",
        valign: "middle",
        fontStyle: "bold",
        lineWidth: 0.6,
        lineColor: C.white,
      },
      alternateRowStyles: { fillColor: C.zebra },
      columnStyles: {
        0: { halign: "left", fontStyle: "bold", cellWidth: 80 },
        1: { halign: "left" },
        2: { halign: "center", cellWidth: 84 },
        5: { fontStyle: "bold" },
        6: { halign: "center", cellWidth: 130 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;

        const col = data.column.index;
        const row = rows[data.row.index];

        if (!row) {
          // Total row
          data.cell.styles.fillColor = C.deep;
          data.cell.styles.textColor = C.white;
          data.cell.styles.fontStyle = "bold";
          return;
        }

        if (col === 4) {
          data.cell.styles.textColor = C.green;
        } else if (col === 5) {
          data.cell.styles.textColor = row.notPaid > 0 ? C.red : C.green;
        }
      },
      didDrawCell: (data) => {
        if (data.section !== "body") return;

        const row = rows[data.row.index];
        const col = data.column.index;

        if (row) drawCellRule(pdf, data.cell);

        if (!row) return;

        if (col === 2) {
          drawStatusPill(pdf, data.cell, getStatusPill(row.status));
        }

        if (col === 6) {
          const cell = data.cell;
          const pad = 10;
          const pctWidth = 28;
          const barH = 5;
          const barW = cell.width - pad * 2 - pctWidth;
          const barX = cell.x + pad;
          const barY = cell.y + (cell.height - barH) / 2;

          pdf.setFillColor(226, 232, 240);
          pdf.roundedRect(barX, barY, barW, barH, 2.5, 2.5, "F");

          if (row.percent > 0) {
            pdf.setFillColor(...progressColor(row.percent));
            pdf.roundedRect(
              barX,
              barY,
              Math.max(5, barW * row.percent),
              barH,
              2.5,
              2.5,
              "F"
            );
          }

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(7.5);
          pdf.setTextColor(...C.ink);
          pdf.text(
            `${Math.round(row.percent * 100)}%`,
            cell.x + cell.width - pad,
            cell.y + cell.height / 2,
            { align: "right", baseline: "middle" }
          );
        }
      },
    });

    drawExportFooter(pdf, "Credit / Loan History");

    pdf.save(`credit-loan-history-${todayKey}.pdf`);
  };

  const handleExport = async (format) => {
    if (filteredCredits.length === 0) {
      alert("No records available to export.");
      return;
    }

    setExporting(format);

    try {
      const creditRows = buildCreditExportRows();

      if (format === "pdf") {
        await exportCreditPdf(creditRows);
      } else {
        await exportCreditExcel(creditRows);
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
  // RENDER
  // ----------------------------------------------------------

  return (
    <div className="credit-page" data-theme={theme}>

      {/* ====================================================
          HEADER
      ==================================================== */}

      <header className="cm-page-header">
        <div className="cm-title-wrap">
          <div className="cm-title-icon">
            <WalletCards size={20} />
          </div>

          <div>
            <div className="cm-eyebrow">MANAGEMENT</div>

            <h1>Credit / Loan</h1>

            <p>
              Track credit given, payments received and what is
              still not paid.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="cm-error">
          <AlertCircle size={16} />

          <span>{error}</span>

          <button onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      {/* ====================================================
          OLD DATA BANNER
      ==================================================== */}

      {missingLegacy.length > 0 && !hideImport && (
        <div className="cm-import-banner">
          <div>
            <strong>
              {missingLegacy.length} credit
              {missingLegacy.length === 1 ? "" : "s"} found in your old
              cash register records
            </strong>
            <span>
              Import them here so they show in this page. Your cash
              register records are not changed.
            </span>
          </div>

          <div className="cm-import-actions">
            <button
              type="button"
              className="cm-expense-add"
              onClick={handleImportLegacy}
              disabled={importing}
            >
              {importing ? (
                <RefreshCw size={14} className="spin" />
              ) : (
                <Download size={14} />
              )}
              Import
            </button>

            <button
              type="button"
              className="cm-credit-action-btn"
              onClick={() => setHideImport(true)}
              disabled={importing}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {/* ====================================================
          STATS
      ==================================================== */}

      <section className="cm-stats-grid">
        <div className="cm-stat-card">
          <div className="cm-stat-top">
            <span>Total Credit Given</span>

            <div className="cm-stat-icon purple">
              <Banknote size={15} />
            </div>
          </div>

          <strong>{formatCurrency(totals.given)}</strong>

          <small>{credits.length} record(s)</small>
        </div>

        <div className="cm-stat-card">
          <div className="cm-stat-top">
            <span>Amount Received</span>

            <div className="cm-stat-icon green">
              <ArrowUpRight size={15} />
            </div>
          </div>

          <strong>{formatCurrency(totals.paid)}</strong>

          <small>Paid back so far</small>
        </div>

        <div className="cm-stat-card">
          <div className="cm-stat-top">
            <span>Not Paid</span>

            <div className="cm-stat-icon orange">
              <CircleDollarSign size={15} />
            </div>
          </div>

          <strong>{formatCurrency(totals.due)}</strong>

          <small>Still to collect</small>
        </div>

        <div className="cm-stat-card">
          <div className="cm-stat-top">
            <span>Pending People</span>

            <div className="cm-stat-icon blue">
              <Users size={15} />
            </div>
          </div>

          <strong>{totals.pendingCount}</strong>

          <small>With a balance to pay</small>
        </div>
      </section>

      {/* ====================================================
          ADD CREDIT
      ==================================================== */}

      <section className="cm-money-section">
        <div className="cm-panel">
          <div className="cm-panel-head">
            <div className="cm-panel-icon green">
              <Plus size={16} />
            </div>

            <div>
              <div className="cm-section-label">NEW CREDIT</div>
              <h3>Give credit / loan</h3>
            </div>

            <div className="cm-panel-total green">
              {formatCurrency(totals.due)}
            </div>
          </div>

          <div className="cm-expense-form cm-credit-form">
            <input
              type="text"
              className="cm-expense-reason"
              placeholder="Reason / Person"
              value={creditReason}
              onChange={(event) => setCreditReason(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleAddCredit();
              }}
              maxLength={80}
            />

            <div className="cm-expense-money">
              <b>₹</b>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="Amount"
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAddCredit();
                }}
              />
            </div>

            <div className="cm-expense-money">
              <b>₹</b>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="Paid"
                title="Amount already paid - reduces the credit amount"
                value={creditPaid}
                onChange={(event) => setCreditPaid(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleAddCredit();
                }}
              />
            </div>

            <button
              type="button"
              className="cm-expense-add"
              onClick={handleAddCredit}
              disabled={savingCredit}
            >
              {savingCredit ? (
                <RefreshCw size={14} className="spin" />
              ) : (
                <Plus size={14} />
              )}
              Add
            </button>
          </div>
        </div>
      </section>

      {/* ====================================================
          CREDIT / LOAN HISTORY
      ==================================================== */}

      <section className="cm-history-card cm-credit-history-card">
        <div className="cm-history-head">
          <div>
            <div className="cm-section-label">CREDIT</div>

            <h2>Credit / Loan history</h2>

            <p>
              Every credit given. Tap one to see its payment
              history.
            </p>
          </div>

          <div className="cm-history-head-actions">
            <button
              type="button"
              className="cm-export-btn"
              onClick={() => setShowExportModal(true)}
            >
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        <div className="cm-toolbar">
          <div className="cm-search">
            <Search size={15} />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name / reason..."
            />

            {search && (
              <button onClick={() => setSearch("")}>
                <X size={13} />
              </button>
            )}
          </div>

          <div className="cm-filter">
            {[
              ["all", "All"],
              ["pending", "Pending"],
              ["paid", "Paid"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={statusFilter === value ? "active" : ""}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="cm-loading">
            <RefreshCw size={18} className="spin" />
            Loading credits...
          </div>
        ) : filteredCredits.length === 0 ? (
          <div className="cm-empty">
            <div>
              <WalletCards size={20} />
            </div>

            <strong>No credit found</strong>

            <span>
              {credits.length === 0
                ? "Add your first credit above."
                : "Try a different search or filter."}
            </span>
          </div>
        ) : (
          <div className="cm-table-wrap">
            <table className="cm-table cm-credit-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name / Reason</th>
                  <th>Amount Credit</th>
                  <th>Amount Paid</th>
                  <th>Amount Not Paid</th>
                  <th className="cm-credit-actions-th">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredCredits.map((item) => {
                  const total = Number(item.amount) || 0;
                  const paid = getCreditPaid(item);
                  const balance = getCreditBalance(item);
                  const percent =
                    total > 0 ? Math.min(1, paid / total) : 1;

                  // 0 = red (nothing paid) ... 135 = green (fully paid)
                  const hue = Math.round(percent * 135);

                  return (
                    <tr
                      key={item.id}
                      className={`cm-row-clickable cm-credit-row${balance <= 0 ? " settled" : ""}`}
                      style={{ "--credit-hue": hue }}
                      tabIndex={0}
                      title="View payment details"
                      onClick={() => openCreditDetail(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          openCreditDetail(item);
                        }
                      }}
                    >
                      <td data-label="Date">
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

                      <td data-label="Name / Reason">
                        <strong>{item.reason}</strong>
                        {role === "admin" && item.attendantName && (
                          <small>{item.attendantName}</small>
                        )}
                      </td>

                      <td data-label="Credit">
                        <strong>{formatCurrency(total)}</strong>
                      </td>

                      <td className="cm-credit-paid-cell" data-label="Paid">
                        <strong>{formatCurrency(paid)}</strong>
                      </td>

                      <td className="cm-credit-due-cell" data-label="Not paid">
                        <strong>{formatCurrency(balance)}</strong>
                      </td>

                      <td className="cm-credit-actions-cell" data-label="">
                        <div className="cm-credit-row-tools">
                          <button
                            type="button"
                            className="cm-credit-icon-btn"
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
                            className="cm-credit-icon-btn danger"
                            title="Delete credit"
                            disabled={creditDetailSaving}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteCredit(item);
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
          EXPORT
      ==================================================== */}

      {showExportModal && (
        <div
          className="cm-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !exporting) {
              setShowExportModal(false);
            }
          }}
        >
          <div className="cm-modal cm-export-modal">
            <div className="cm-modal-head">
              <div className="cm-modal-title">
                <div className="cm-modal-icon">
                  <Download size={17} />
                </div>

                <div>
                  <strong>Export credit / loan history</strong>
                  <span>
                    Choose a file type. Date, name, status, credit,
                    paid and not paid.
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="cm-modal-close"
                onClick={() => setShowExportModal(false)}
                disabled={Boolean(exporting)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="cm-export-options">
              <button
                type="button"
                className="cm-export-option pdf"
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
                className="cm-export-option xlsx"
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

            <p className="cm-export-note">
              {`Exports the ${filteredCredits.length} record(s) shown in the list, using the current search and filter.`}
            </p>
          </div>
        </div>
      )}

      {/* ====================================================
          CREDIT PREVIEW BOX
      ==================================================== */}

      {creditDetailItem && (() => {
        const total = Number(creditDetailItem.amount) || 0;
        const paid = getCreditPaid(creditDetailItem);
        const balance = getCreditBalance(creditDetailItem);
        const percent = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
        const payments = getCreditPayments(creditDetailItem);

        return (
          <div
            className="cm-modal-overlay cm-credit-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeCreditDetail();
              }
            }}
          >
            <div className="cm-modal cm-credit-modal">
              <div className="cm-modal-head">
                <div className="cm-modal-title">
                  <div className="cm-modal-icon">
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
                  className="cm-modal-close"
                  onClick={closeCreditDetail}
                >
                  <X size={17} />
                </button>
              </div>

              <div className={`cm-credit-summary${balance <= 0 ? " settled" : ""}`}>
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

              <div className="cm-credit-progress">
                <i style={{ width: `${percent}%` }} />
              </div>

              {!creditEdit && (
                <div className="cm-credit-actions">
                  <button
                    type="button"
                    className="cm-credit-action-btn"
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
                    className="cm-credit-action-btn danger"
                    disabled={creditDetailSaving}
                    onClick={() => handleDeleteCredit()}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              )}

              {creditEdit && (
                <div className="cm-credit-update cm-credit-edit">
                  <span className="cm-section-label">EDIT CREDIT</span>

                  <div className="cm-credit-edit-form">
                    <div className="cm-expense-money">
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

                    <div className="cm-expense-money">
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

                    <div className="cm-credit-edit-buttons">
                      <button
                        type="button"
                        className="cm-expense-add"
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
                        className="cm-credit-action-btn"
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

              {balance > 0 ? (
                <div className="cm-credit-update">
                  <span className="cm-section-label">UPDATE PAYMENT</span>

                  <div className="cm-credit-update-row">
                    <div className="cm-expense-money">
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
                      className="cm-expense-add"
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
              ) : (
                <div className="cm-credit-settled">
                  <CheckCircle2 size={16} />
                  Fully paid
                </div>
              )}

              <div className="cm-credit-history">
                <span className="cm-section-label">PAYMENT HISTORY</span>

                {payments.length === 0 ? (
                  <div className="cm-expense-empty">
                    <Receipt size={16} />
                    No payments yet
                  </div>
                ) : (
                  payments.map((entry, index) => (
                    <div
                      className="cm-credit-history-row"
                      key={`${entry.atMs}-${index}`}
                    >
                      <div>
                        <strong>{entry.note || "Payment received"}</strong>
                        <span>
                          {entry.atMs ? formatDateTime(entry.atMs) : "—"}
                        </span>
                      </div>

                      {creditPayEdit &&
                        creditPayEdit.idx === entry.idx &&
                        entry.idx >= 0 ? (
                        <div className="cm-credit-pay-tools">
                          <div className="cm-expense-money">
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
                            className="cm-credit-icon-btn ok"
                            title="Save"
                            disabled={creditDetailSaving}
                            onClick={handleSavePaymentEdit}
                          >
                            <CheckCircle2 size={14} />
                          </button>

                          <button
                            type="button"
                            className="cm-credit-icon-btn"
                            title="Cancel"
                            onClick={() => setCreditPayEdit(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="cm-credit-pay-tools">
                          <b>{formatCurrency(entry.amount)}</b>

                          {entry.idx >= 0 && (
                            <button
                              type="button"
                              className="cm-credit-icon-btn"
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
                            className="cm-credit-icon-btn danger"
                            title="Delete payment"
                            disabled={creditDetailSaving}
                            onClick={() => handleDeleteCreditPayment(entry)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}

                <div className="cm-credit-history-row start">
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

      <FloatingCalculator theme={theme} />

    </div>
  );
}