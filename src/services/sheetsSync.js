import React, { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { db } from "./firebase";
import { useAuth } from "../context/AuthContext";

const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxvzHYXITUbcYrhP4VptK9D5A8sll-aHURxfJBKYd8JdS0Q96a87AXqKIyx2YnNPhtyuA/exec"
const SECRET = "akr@2025";

export const SYNCED_COLLECTIONS = [
  "transactions",
  "moneyTransfers",
  "withdrawals",
  "ebBillPayments",
  "customers",
  "credits",
  "cashRegisters",
];

const LABELS = {
  transactions: "Transactions",
  moneyTransfers: "MoneyTransfers",
  withdrawals: "Withdrawals",
  ebBillPayments: "EBBills",
  customers: "Customers",
  credits: "Credits",
  cashRegisters: "CashRegisters",
};

const CHUNK = 100;
const CACHE_KEY = "sheetsSync:hashes:v2";

/* ---------------- value helpers ---------------- */

const pad = (n) => String(n).padStart(2, "0");
const num = (v) => Number(v) || 0;

const isTimestamp = (v) =>
  v &&
  typeof v === "object" &&
  (typeof v.toDate === "function" ||
    (typeof v.seconds === "number" && typeof v.nanoseconds === "number"));

function toJsDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmtDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (d) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function jsonReplacer(_key, val) {
  if (isTimestamp(val)) {
    const d = toJsDate(val);
    return d ? `${fmtDate(d)} ${fmtTime(d)}` : "";
  }
  return val;
}

// one spreadsheet cell
function cell(v) {
  if (v === null || v === undefined) return "";
  if (isTimestamp(v)) {
    const d = toJsDate(v);
    return d ? `${fmtDate(d)} ${fmtTime(d)}` : "";
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v, jsonReplacer).slice(0, 45000);
    } catch {
      return String(v);
    }
  }
  if (typeof v === "string") return v.slice(0, 45000);
  return v;
}

function flatten(data) {
  const out = {};
  Object.keys(data || {}).forEach((k) => {
    out[k] = cell(data[k]);
  });
  return out;
}

function dateParts(d) {
  const dt =
    toJsDate(d.createdAt) ||
    toJsDate(d.createdAtMs) ||
    toJsDate(d.openedAt) ||
    toJsDate(d.date);
  if (dt) return [fmtDate(dt), fmtTime(dt)];
  return [d.dateKey || "", ""];
}

/* ---------------- Sheet1 row (all types, common columns) ---------------- */

function toCombined(col, id, d) {
  const [date, time] = dateParts(d);

  const row = {
    Source: LABELS[col],
    "Doc ID": id,
    Date: date,
    Time: time,
    Type: "",
    "Customer / Name": "",
    "Mobile / Ref": "",
    Details: "",
    Amount: 0,
    "Service Charge": 0,
    Total: 0,
    "Payment Method": d.paymentMethod || d.paymentMode || d.mode || "",
    Status: d.status || "",
    Attendant: d.attendantName || d.addedBy || "",
  };

  switch (col) {
    case "transactions": {
      const items = Array.isArray(d.items)
        ? d.items
        : Array.isArray(d.cart)
        ? d.cart
        : [];
      row.Type = "Sale";
      row["Customer / Name"] = d.customerName || d.customer || "";
      row["Mobile / Ref"] = d.customerMobile || d.mobile || "";
      row.Details =
        d.serviceName ||
        items
          .map((i) => `${i.name || i.serviceName} x${i.quantity ?? i.qty ?? 1}`)
          .join(", ");
      row.Amount = num(d.amount ?? d.total ?? d.customerPays);
      row["Service Charge"] = num(d.serviceCharge ?? d.charge);
      row.Total = num(d.customerPays ?? d.total ?? d.amount);
      break;
    }
    case "moneyTransfers": {
      row.Type = "Money Transfer";
      row["Customer / Name"] = d.customerName || "";
      row["Mobile / Ref"] = d.mobile || "";
      row.Amount = num(d.transferAmount ?? d.amount);
      row["Service Charge"] = num(d.serviceCharge);
      row.Total = num(d.customerPays) || row.Amount + row["Service Charge"];
      break;
    }
    case "withdrawals": {
      row.Type = "Withdrawal";
      row["Customer / Name"] = d.customerName || "";
      row["Mobile / Ref"] = d.mobile || "";
      row.Amount = num(d.withdrawalAmount ?? d.amount);
      row["Service Charge"] = num(d.serviceCharge);
      row.Total = num(d.customerReceives) || row.Amount + row["Service Charge"];
      break;
    }
    case "ebBillPayments": {
      row.Type = "EB Bill";
      row["Customer / Name"] = d.consumerName || "";
      row["Mobile / Ref"] = d.consumerNumber || "";
      row.Amount = num(d.billAmount ?? d.amount);
      row["Service Charge"] = num(d.serviceCharge);
      row.Total = num(d.customerPays) || row.Amount + row["Service Charge"];
      break;
    }
    case "customers": {
      row.Type = "Customer";
      row["Customer / Name"] = d.name || "";
      row["Mobile / Ref"] = d.mobile || "";
      row.Details = [d.email, d.address].filter(Boolean).join(" | ");
      row.Amount = num(d.totalTransactionAmount);
      row.Total = row.Amount;
      break;
    }
    case "credits": {
      const amount = num(d.amount);
      const paid = num(d.paid);
      row.Type = "Credit";
      row["Customer / Name"] = d.reason || "";
      row.Details = `Paid ${paid}, balance ${Math.max(0, amount - paid)}`;
      row.Amount = amount;
      row.Total = Math.max(0, amount - paid);
      row.Status = amount > 0 && paid >= amount ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
      break;
    }
    case "cashRegisters": {
      row.Type = "Cash Register";
      row["Customer / Name"] = d.attendantName || "";
      row["Mobile / Ref"] = d.dateKey || "";
      row.Details = `Opening ${num(d.openingCash)} | Closing ${num(d.closingCash)} | Expenses ${
        Array.isArray(d.expenses)
          ? d.expenses.reduce((s, e) => s + num(e?.amount), 0)
          : 0
      }`;
      row.Amount = num(d.closingCash ?? d.expectedCash);
      row.Total = row.Amount;
      break;
    }
    default:
      break;
  }

  return row;
}

/* ---------------- hash cache (skip records already synced) ---------------- */

let hashes = null;

function loadHashes() {
  if (hashes) return hashes;
  try {
    hashes = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    hashes = {};
  }
  return hashes;
}

function saveHashes() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(hashes || {}));
  } catch {
    /* storage unavailable */
  }
}

function hashOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return String(h);
}

// Call this to push EVERYTHING again on the next page load.
export function resetSheetsSyncCache() {
  hashes = {};
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------------- visible status ---------------- */

let status = { state: "idle", text: "Sheets sync: starting..." };
const statusListeners = new Set();

function setStatus(state, text) {
  status = { state, text };
  console.log("[SheetsSync]", text);
  statusListeners.forEach((fn) => fn(status));
}

let sentCount = 0;

/* ---------------- queue + sender ---------------- */

const queue = new Map(); // "col|id" -> { change, hash }
let timer = null;
let flushing = false;

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(flush, ms);
}

function enqueueUpsert(col, id, data) {
  const key = `${col}|${id}`;
  const flat = flatten(data);
  const hash = hashOf(JSON.stringify(flat));

  if (loadHashes()[key] === hash) return; // already in the sheet

  queue.set(key, {
    hash,
    change: {
      op: "upsert",
      collection: col,
      id,
      data: flat,
      combined: toCombined(col, id, data),
    },
  });
  schedule(1500);
}

function enqueueRemove(col, id) {
  queue.set(`${col}|${id}`, {
    hash: null,
    change: { op: "remove", collection: col, id, combined: { Source: LABELS[col] } },
  });
  schedule(1500);
}

// returns "ok" (server confirmed), "blind" (sent, reply unreadable) or "fail"
async function post(changes) {
  const body = JSON.stringify({ secret: SECRET, changes });

  try {
    const res = await fetch(WEBAPP_URL, { method: "POST", body });
    const json = await res.json();
    if (!json.ok) {
      setStatus("error", `Sheets sync rejected: ${json.error}`);
      return "fail";
    }
    return "ok";
  } catch (firstErr) {
    console.warn("[SheetsSync] reply not readable, sending blind:", firstErr);
    try {
      await fetch(WEBAPP_URL, { method: "POST", mode: "no-cors", body });
      return "blind";
    } catch (err) {
      setStatus("error", `Sheets sync failed: ${err?.message || err}`);
      return "fail";
    }
  }
}

async function flush() {
  if (flushing) {
    schedule(1500);
    return;
  }
  flushing = true;
  let failed = false;

  try {
    while (queue.size) {
      const entries = [...queue.entries()].slice(0, CHUNK);
      entries.forEach(([key]) => queue.delete(key));

      const result = await post(entries.map(([, v]) => v.change));

      if (result === "fail") {
        entries.forEach(([key, v]) => {
          if (!queue.has(key)) queue.set(key, v);
        });
        failed = true;
        break;
      }

      sentCount += entries.length;

      if (result === "ok") {
        const cache = loadHashes();
        entries.forEach(([key, v]) => {
          if (v.hash === null) delete cache[key];
          else cache[key] = v.hash;
        });
        saveHashes();
        setStatus("ok", `Sheets sync: ${sentCount} records sent to the sheet`);
      } else {
        setStatus("warn", `Sheets sync: ${sentCount} records sent (no confirmation from Google - check the sheet)`);
      }
    }
  } finally {
    flushing = false;
  }

  if (failed) schedule(20000); // retry in 20 s
}

/* ---------------- hook + component ---------------- */

export function useSheetsSync() {
  const { user, role } = useAuth();

  useEffect(() => {
    if (!WEBAPP_URL || !SECRET) {
      setStatus("error", "Sheets sync OFF: WEBAPP_URL or SECRET is empty in sheetsSync.js");
      return undefined;
    }
    if (!user?.uid) {
      setStatus("idle", "Sheets sync: waiting for login...");
      return undefined;
    }
    // Only an admin can read every collection, so only admin syncs.
    if (role !== "admin") {
      setStatus("error", `Sheets sync OFF: logged in role is "${role}", must be "admin"`);
      return undefined;
    }

    setStatus("idle", "Sheets sync: connected, reading records...");

    const unsubs = SYNCED_COLLECTIONS.map((col) =>
      onSnapshot(
        collection(db, col),
        (snapshot) => {
          console.log(`[SheetsSync] ${col}: ${snapshot.size} records, ${snapshot.docChanges().length} changes`);
          snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;

            if (change.type === "removed") {
              enqueueRemove(col, id);
              return;
            }

            // wait until the server has stamped createdAt etc.
            if (change.doc.metadata.hasPendingWrites) return;

            enqueueUpsert(col, id, change.doc.data());
          });
        },
        (err) => setStatus("error", `Sheets sync: cannot read "${col}" (${err?.code || err})`)
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [user?.uid, role]);
}

// <SheetsSync />  - drop it once inside your layout / App (inside AuthProvider)
// Shows a small status pill at the bottom-left. Click it to hide.
export default function SheetsSync() {
  useSheetsSync();

  const [st, setSt] = useState(status);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    statusListeners.add(setSt);
    setSt(status);
    return () => statusListeners.delete(setSt);
  }, []);

  if (hidden) return null;

  const colors = {
    idle: "#475569",
    ok: "#15803d",
    warn: "#b45309",
    error: "#b91c1c",
  };

  return React.createElement(
    "div",
    {
      onClick: () => setHidden(true),
      title: "Click to hide",
      style: {
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 99999,
        maxWidth: "90vw",
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 12,
        color: "#fff",
        background: colors[st.state] || colors.idle,
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,.25)",
      },
    },
    st.text
  );
}