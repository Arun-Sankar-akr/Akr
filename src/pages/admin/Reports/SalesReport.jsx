import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  ReceiptText,
  IndianRupee,
  TrendingUp,
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  where,
  getDoc,
  doc,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";
import "./Reports.css";

const auth = getAuth();

const money = (value) => Number(value || 0);

function dateObject(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateObject(value);

  if (!date) return "—";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function downloadCSV(rows) {
  const headers = [
    "Date",
    "Customer",
    "Service",
    "Attendant",
    "Amount",
    "Service Charge",
    "Total",
  ];

  const csvRows = rows.map((item) => [
    formatDate(item.date),
    item.customer,
    item.service,
    item.attendant,
    item.amount,
    item.serviceCharge,
    item.total,
  ]);

  const escape = (value) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csv = [
    headers.map(escape).join(","),
    ...csvRows.map((row) => row.map(escape).join(",")),
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `sales-report-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  link.click();
  URL.revokeObjectURL(url);
}

export default function SalesReport() {
  const [transactions, setTransactions] = useState([]);

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribeSnapshot = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (unsubscribeSnapshot) {
          unsubscribeSnapshot();
        }

        if (!currentUser) {
          setLoading(false);
          setError("Please login to view sales reports.");
          return;
        }

        try {
          const profileSnap = await getDoc(
            doc(db, "users", currentUser.uid)
          );

          const profile = profileSnap.data();

          let q;

          if (profile?.role === "admin") {
            q = collection(db, "transactions");
          } else {
            q = query(
              collection(db, "transactions"),
              where("attendantId", "==", currentUser.uid)
            );
          }

          unsubscribeSnapshot = onSnapshot(
            q,
            (snapshot) => {
              setTransactions(
                snapshot.docs.map((item) => ({
                  id: item.id,
                  ...item.data(),
                }))
              );

              setLoading(false);
            },
            (err) => {
              console.error(err);
              setError("Unable to load sales report.");
              setLoading(false);
            }
          );
        } catch (err) {
          console.error(err);
          setError("Unable to load profile.");
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribeAuth();

      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  const salesRows = useMemo(() => {
    return transactions
      .map((item) => {
        const amount = money(
          item.amount ??
          item.totalAmount ??
          item.saleAmount ??
          item.price
        );

        const serviceCharge = money(
          item.serviceCharge ??
          item.commission ??
          item.serviceIncome
        );

        return {
          id: item.id,
          date:
            item.createdAt ||
            item.date ||
            item.transactionDate,

          customer:
            item.customerName ||
            item.customer ||
            "Walk-in Customer",

          service:
            item.serviceName ||
            item.service ||
            item.serviceTitle ||
            item.typeName ||
            item.transactionType ||
            item.type ||
            "General Sale",

          attendant:
            item.attendantName ||
            item.staffName ||
            "Staff",

          amount,

          serviceCharge,

          total:
            item.totalAmount != null
              ? money(item.totalAmount)
              : amount + serviceCharge,
        };
      })
      .filter((item) => {
        const date = dateObject(item.date);

        if (fromDate && date) {
          const from = new Date(`${fromDate}T00:00:00`);

          if (date < from) return false;
        }

        if (toDate && date) {
          const to = new Date(`${toDate}T23:59:59`);

          if (date > to) return false;
        }

        const term = search.trim().toLowerCase();

        if (!term) return true;

        return [
          item.customer,
          item.service,
          item.attendant,
        ].some((value) =>
          String(value).toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const aDate = dateObject(a.date)?.getTime() || 0;
        const bDate = dateObject(b.date)?.getTime() || 0;

        return bDate - aDate;
      });
  }, [transactions, search, fromDate, toDate]);

  const totalSales = salesRows.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const totalIncome = salesRows.reduce(
    (sum, item) => sum + item.serviceCharge,
    0
  );

  const totalValue = salesRows.reduce(
    (sum, item) => sum + item.total,
    0
  );

  return (
    <div className="report-page">
      <div className="report-page-head">
        <div>
          <div className="eyebrow">REPORTS</div>
          <h1>Sales Report</h1>
          <p>Review sales transactions and daily collection activity.</p>
        </div>

        <button
          className="secondary-btn"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="report-stat-grid">
        <div className="report-stat">
          <div className="report-stat-icon blue">
            <ReceiptText size={19} />
          </div>

          <div>
            <span>Transactions</span>
            <strong>{salesRows.length}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon green">
            <IndianRupee size={19} />
          </div>

          <div>
            <span>Sales</span>
            <strong>{formatCurrency(totalSales)}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon purple">
            <TrendingUp size={19} />
          </div>

          <div>
            <span>Service Income</span>
            <strong>{formatCurrency(totalIncome)}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon orange">
            <IndianRupee size={19} />
          </div>

          <div>
            <span>Total Value</span>
            <strong>{formatCurrency(totalValue)}</strong>
          </div>
        </div>
      </div>

      <section className="report-panel">
        <div className="report-toolbar">
          <div className="report-search">
            <Search size={16} />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, service, staff..."
            />
          </div>

          <div className="report-filters">
            <CalendarDays size={15} />

            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />

            <span>to</span>

            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />

            <button
              className="secondary-btn"
              disabled={!salesRows.length}
              onClick={() => downloadCSV(salesRows)}
            >
              <Download size={15} />
              Export
            </button>
          </div>
        </div>

        {error && <div className="report-error">{error}</div>}

        <div className="report-table-wrap">
          {loading ? (
            <div className="report-empty">
              <div className="report-loader" />
              <h3>Loading sales report...</h3>
            </div>
          ) : salesRows.length === 0 ? (
            <div className="report-empty">
              <div className="report-empty-icon">
                <ReceiptText size={24} />
              </div>

              <h3>No sales found</h3>

              <p>
                Sales transactions will appear here once they are
                recorded.
              </p>
            </div>
          ) : (
            <table className="report-table sales-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Staff</th>
                  <th>Amount</th>
                  <th>Service Income</th>
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {salesRows.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.date)}</td>

                    <td>
                      <strong>{item.customer}</strong>
                    </td>

                    <td>
                      <span className="service-badge">
                        {item.service}
                      </span>
                    </td>

                    <td>{item.attendant}</td>

                    <td>
                      <strong>
                        {formatCurrency(item.amount)}
                      </strong>
                    </td>

                    <td>
                      <span className="positive-value">
                        +{formatCurrency(item.serviceCharge)}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(item.total)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}