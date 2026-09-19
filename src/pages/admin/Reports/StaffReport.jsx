import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  Users,
  IndianRupee,
  ReceiptText,
  RefreshCw,
} from "lucide-react";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
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
    "Staff",
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
  link.download = `staff-report-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  link.click();
  URL.revokeObjectURL(url);
}

export default function StaffReport() {
  const [transactions, setTransactions] = useState([]);
  const [staff, setStaff] = useState([]);

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = (currentUser) => {
    if (!currentUser) return () => { };

    let unsubscribeTransactions;

    getDocs(collection(db, "users"))
      .then((snapshot) => {
        setStaff(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      })
      .catch((err) => {
        console.error(err);
      });

    const transactionsQuery = query(
      collection(db, "transactions"),
      where("attendantId", "==", currentUser.uid)
    );

    unsubscribeTransactions = onSnapshot(
      transactionsQuery,
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
        setError("Unable to load staff transactions.");
        setLoading(false);
      }
    );

    return unsubscribeTransactions;
  };

  useEffect(() => {
    let stopTransactions = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (stopTransactions) {
          stopTransactions();
          stopTransactions = null;
        }

        if (!currentUser) {
          setLoading(false);
          setError("Please login to view staff reports.");
          return;
        }

        try {
          const userDoc = await getDocs(
            query(
              collection(db, "users"),
              where("__name__", "==", currentUser.uid)
            )
          );

          const profile = userDoc.docs[0]?.data();

          if (profile?.role === "admin") {
            stopTransactions = onSnapshot(
              collection(db, "transactions"),
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
                setError("Unable to load staff transactions.");
                setLoading(false);
              }
            );

            getDocs(collection(db, "users"))
              .then((snapshot) => {
                setStaff(
                  snapshot.docs.map((item) => ({
                    id: item.id,
                    ...item.data(),
                  }))
                );
              })
              .catch(console.error);
          } else {
            stopTransactions = loadData(currentUser);
          }
        } catch (err) {
          console.error(err);
          stopTransactions = loadData(currentUser);
        }
      }
    );

    return () => {
      unsubscribeAuth();

      if (stopTransactions) {
        stopTransactions();
      }
    };
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((item) => {
      const date = dateObject(getDateValue(item));

      if (fromDate && date) {
        const from = new Date(`${fromDate}T00:00:00`);

        if (date < from) return false;
      }

      if (toDate && date) {
        const to = new Date(`${toDate}T23:59:59`);

        if (date > to) return false;
      }

      return true;
    });
  }, [transactions, fromDate, toDate]);

  const staffReport = useMemo(() => {
    const map = new Map();

    filteredTransactions.forEach((item) => {
      const staffId =
        item.attendantId ||
        item.staffId ||
        item.createdBy ||
        "unknown";

      const staffUser = staff.find(
        (person) => person.id === staffId
      );

      const name =
        item.attendantName ||
        item.staffName ||
        staffUser?.name ||
        staffUser?.displayName ||
        staffUser?.email ||
        "Unknown Staff";

      const amount = money(
        item.amount ??
        item.totalAmount ??
        item.saleAmount ??
        item.price
      );

      const serviceIncome = money(
        item.serviceCharge ??
        item.commission ??
        item.serviceIncome ??
        item.profit
      );

      if (!map.has(staffId)) {
        map.set(staffId, {
          id: staffId,
          name,
          transactions: 0,
          sales: 0,
          serviceIncome: 0,
        });
      }

      const current = map.get(staffId);

      current.transactions += 1;
      current.sales += amount;
      current.serviceIncome += serviceIncome;
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
  }, [filteredTransactions, staff, search]);

  const totalSales = staffReport.reduce(
    (sum, item) => sum + item.sales,
    0
  );

  const totalIncome = staffReport.reduce(
    (sum, item) => sum + item.serviceIncome,
    0
  );

  const totalTransactions = staffReport.reduce(
    (sum, item) => sum + item.transactions,
    0
  );

  return (
    <div className="report-page">
      <div className="report-page-head">
        <div>
          <div className="eyebrow">REPORTS</div>
          <h1>Staff Report</h1>
          <p>Transactions and collections by attendant.</p>
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
            <Users size={19} />
          </div>

          <div>
            <span>Staff</span>
            <strong>{staffReport.length}</strong>
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
              placeholder="Search staff..."
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
              disabled={!staffReport.length}
              onClick={() => downloadCSV(staffReport)}
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
              <h3>Loading staff report...</h3>
            </div>
          ) : staffReport.length === 0 ? (
            <div className="report-empty">
              <div className="report-empty-icon">
                <Users size={24} />
              </div>

              <h3>No staff data found</h3>
              <p>
                Staff transaction information will appear here
                once transactions are recorded.
              </p>
            </div>
          ) : (
            <table className="report-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Transactions</th>
                  <th>Total Sales</th>
                  <th>Service Income</th>
                  <th>Average</th>
                </tr>
              </thead>

              <tbody>
                {staffReport.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="report-person">
                        <div className="report-avatar">
                          {item.name.charAt(0).toUpperCase()}
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