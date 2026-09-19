import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  BriefcaseBusiness,
  IndianRupee,
  ReceiptText,
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

function getDateValue(item) {
  return item.createdAt || item.date || item.transactionDate;
}

function dateObject(value) {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function downloadCSV(rows) {
  const headers = [
    "Service",
    "Transactions",
    "Sales",
    "Service Income",
    "Average Transaction",
  ];

  const csvRows = rows.map((item) => [
    item.name,
    item.transactions,
    item.sales,
    item.serviceIncome,
    item.average,
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
  link.download = `service-report-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  link.click();
  URL.revokeObjectURL(url);
}

export default function ServiceReport() {
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
          setError("Please login to view service reports.");
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
              setError("Unable to load service report.");
              setLoading(false);
            }
          );
        } catch (err) {
          console.error(err);
          setError("Unable to load your profile.");
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

  const serviceReport = useMemo(() => {
    const map = new Map();

    transactions.forEach((item) => {
      const date = dateObject(getDateValue(item));

      if (fromDate && date) {
        const from = new Date(`${fromDate}T00:00:00`);

        if (date < from) return;
      }

      if (toDate && date) {
        const to = new Date(`${toDate}T23:59:59`);

        if (date > to) return;
      }

      const serviceName =
        item.serviceName ||
        item.service ||
        item.serviceTitle ||
        item.typeName ||
        item.transactionType ||
        item.type ||
        "Other Service";

      const amount = money(
        item.amount ??
        item.totalAmount ??
        item.saleAmount ??
        item.price
      );

      const income = money(
        item.serviceCharge ??
        item.commission ??
        item.serviceIncome ??
        item.profit
      );

      const key = serviceName.toLowerCase();

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: serviceName,
          transactions: 0,
          sales: 0,
          serviceIncome: 0,
        });
      }

      const current = map.get(key);

      current.transactions += 1;
      current.sales += amount;
      current.serviceIncome += income;
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        average:
          item.transactions > 0
            ? item.sales / item.transactions
            : 0,
      }))
      .filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => b.sales - a.sales);
  }, [transactions, search, fromDate, toDate]);

  const totalSales = serviceReport.reduce(
    (sum, item) => sum + item.sales,
    0
  );

  const totalIncome = serviceReport.reduce(
    (sum, item) => sum + item.serviceIncome,
    0
  );

  const totalTransactions = serviceReport.reduce(
    (sum, item) => sum + item.transactions,
    0
  );

  return (
    <div className="report-page">
      <div className="report-page-head">
        <div>
          <div className="eyebrow">REPORTS</div>
          <h1>Service Report</h1>
          <p>Analyze sales and income generated by each service.</p>
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
            <BriefcaseBusiness size={19} />
          </div>

          <div>
            <span>Services</span>
            <strong>{serviceReport.length}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon purple">
            <ReceiptText size={19} />
          </div>

          <div>
            <span>Transactions</span>
            <strong>{totalTransactions}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon green">
            <IndianRupee size={19} />
          </div>

          <div>
            <span>Total Sales</span>
            <strong>{formatCurrency(totalSales)}</strong>
          </div>
        </div>

        <div className="report-stat">
          <div className="report-stat-icon orange">
            <IndianRupee size={19} />
          </div>

          <div>
            <span>Service Income</span>
            <strong>{formatCurrency(totalIncome)}</strong>
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
              placeholder="Search service..."
            />
          </div>

          <div className="report-filters">
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
              disabled={!serviceReport.length}
              onClick={() => downloadCSV(serviceReport)}
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
              <h3>Loading service report...</h3>
            </div>
          ) : serviceReport.length === 0 ? (
            <div className="report-empty">
              <div className="report-empty-icon">
                <BriefcaseBusiness size={24} />
              </div>

              <h3>No service data found</h3>

              <p>
                Service information will appear after transactions
                are recorded.
              </p>
            </div>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Transactions</th>
                  <th>Total Sales</th>
                  <th>Service Income</th>
                  <th>Average</th>
                </tr>
              </thead>

              <tbody>
                {serviceReport.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="service-cell">
                        <div className="service-icon">
                          <BriefcaseBusiness size={16} />
                        </div>

                        <strong>{item.name}</strong>
                      </div>
                    </td>

                    <td>
                      <span className="report-count">
                        {item.transactions}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(item.sales)}
                      </strong>
                    </td>

                    <td>
                      <span className="positive-value">
                        +{formatCurrency(item.serviceIncome)}
                      </span>
                    </td>

                    <td>
                      {formatCurrency(item.average)}
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