import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Pencil,
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  IndianRupee,
  CalendarDays,
  ReceiptText,
  Search,
  RefreshCw,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";

import "./Customer.css";

export default function CustomerDetails({
  customerId,
  onBack,
  onEdit,
}) {
  const [customer, setCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  /* -------------------------------- */
  /* CUSTOMER */
  /* -------------------------------- */

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "customers"),
      (snapshot) => {
        const found = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .find((item) => item.id === customerId);

        setCustomer(found || null);
        setLoading(false);
      },
      (error) => {
        console.error("Customer details error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [customerId]);

  /* -------------------------------- */
  /* TRANSACTIONS */
  /* -------------------------------- */

  useEffect(() => {
    if (!customerId) return;

    const q = query(
      collection(db, "transactions"),
      where("customerId", "==", customerId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        data.sort((a, b) => {
          const aTime =
            a.createdAt?.seconds ||
            a.date?.seconds ||
            0;

          const bTime =
            b.createdAt?.seconds ||
            b.date?.seconds ||
            0;

          return bTime - aTime;
        });

        setTransactions(data);
      },
      (error) => {
        console.error("Customer transaction error:", error);

        // Older transaction structures may not have customerId.
        setTransactions([]);
      }
    );

    return () => unsubscribe();
  }, [customerId]);

  /* -------------------------------- */
  /* SEARCH */
  /* -------------------------------- */

  const filteredTransactions = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return transactions;

    return transactions.filter((transaction) =>
      [
        transaction.serviceName,
        transaction.service,
        transaction.type,
        transaction.description,
        transaction.reference,
      ]
        .filter(Boolean)
        .some((field) =>
          String(field)
            .toLowerCase()
            .includes(value)
        )
    );
  }, [transactions, search]);

  /* -------------------------------- */
  /* CALCULATIONS */
  /* -------------------------------- */

  const transactionTotal = transactions.reduce(
    (sum, transaction) =>
      sum + Number(transaction.amount || 0),
    0
  );

  const averageTransaction =
    transactions.length > 0
      ? transactionTotal / transactions.length
      : 0;

  /* -------------------------------- */
  /* LOADING */
  /* -------------------------------- */

  if (loading) {
    return (
      <div className="customer-details-page">
        <div className="customer-loading">
          <div className="loading-spinner" />
          <span>Loading customer...</span>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="customer-details-page">
        <div className="customer-empty">
          <div className="customer-empty-icon">
            <ShoppingBag size={28} />
          </div>

          <h2>Customer not found</h2>

          <p>
            The selected customer could not be found.
          </p>

          <button
            className="secondary-btn"
            onClick={onBack}
          >
            <ArrowLeft size={16} />
            Back to Customers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-details-page">
      {/* HEADER */}

      <div className="details-page-header">
        <button
          className="back-btn"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
          Customers
        </button>

        <div className="details-header-actions">
          <button
            className="secondary-btn"
            onClick={onEdit}
          >
            <Pencil size={15} />
            Edit
          </button>
        </div>
      </div>

      {/* PROFILE */}

      <section className="customer-profile-card">
        <div className="profile-main">
          <div className="large-customer-avatar">
            {customer.name
              ?.charAt(0)
              ?.toUpperCase() || "C"}
          </div>

          <div className="profile-main-info">
            <span className="eyebrow">
              CUSTOMER PROFILE
            </span>

            <h1>{customer.name}</h1>

            <p>
              Customer since{" "}
              {formatDate(customer.createdAt)}
            </p>
          </div>
        </div>

        <div className="profile-contact">
          <div>
            <Phone size={16} />
            <span>
              {customer.phone || "No phone"}
            </span>
          </div>

          <div>
            <Mail size={16} />
            <span>
              {customer.email || "No email"}
            </span>
          </div>

          <div>
            <MapPin size={16} />
            <span>
              {customer.address || "No address"}
            </span>
          </div>
        </div>
      </section>

      {/* STATS */}

      <div className="details-stat-grid">
        <div className="details-stat">
          <div className="details-stat-icon">
            <ReceiptText size={18} />
          </div>

          <div>
            <span>Total Transactions</span>
            <strong>
              {transactions.length}
            </strong>
          </div>
        </div>

        <div className="details-stat">
          <div className="details-stat-icon">
            <IndianRupee size={18} />
          </div>

          <div>
            <span>Total Spending</span>
            <strong>
              {formatCurrency(transactionTotal)}
            </strong>
          </div>
        </div>

        <div className="details-stat">
          <div className="details-stat-icon">
            <ShoppingBag size={18} />
          </div>

          <div>
            <span>Average Visit</span>
            <strong>
              {formatCurrency(averageTransaction)}
            </strong>
          </div>
        </div>

        <div className="details-stat">
          <div className="details-stat-icon">
            <CalendarDays size={18} />
          </div>

          <div>
            <span>Last Visit</span>
            <strong>
              {formatDate(customer.lastVisit)}
            </strong>
          </div>
        </div>
      </div>

      {/* HISTORY */}

      <section className="panel customer-history-panel">
        <div className="history-head">
          <div>
            <span className="eyebrow">
              ACTIVITY
            </span>

            <h2>Transaction History</h2>

            <p>
              Services and transactions associated with
              this customer.
            </p>
          </div>

          <div className="history-actions">
            <div className="search-bar">
              <Search size={16} />

              <input
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
                placeholder="Search history..."
              />
            </div>

            <button
              className="secondary-btn refresh-btn"
              onClick={() => window.location.reload()}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="history-empty">
            <ReceiptText size={27} />

            <h3>No transactions found</h3>

            <p>
              There are no transactions associated
              with this customer yet.
            </p>
          </div>
        ) : (
          <div className="customer-table-wrap">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Amount</th>
                </tr>
              </thead>

              <tbody>
                {filteredTransactions.map(
                  (transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        {formatDate(
                          transaction.createdAt ||
                          transaction.date
                        )}
                      </td>

                      <td>
                        <strong>
                          {transaction.serviceName ||
                            transaction.service ||
                            "Transaction"}
                        </strong>
                      </td>

                      <td>
                        <span className="type-pill">
                          {transaction.type ||
                            transaction.transactionType ||
                            "Sale"}
                        </span>
                      </td>

                      <td>
                        {transaction.reference ||
                          transaction.id.slice(0, 8)}
                      </td>

                      <td>
                        <strong className="amount-text">
                          {formatCurrency(
                            Number(
                              transaction.amount || 0
                            )
                          )}
                        </strong>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* NOTES */}

      {customer.notes && (
        <section className="customer-notes-card">
          <span>Customer Notes</span>
          <p>{customer.notes}</p>
        </section>
      )}
    </div>
  );
}

/* -------------------------------- */
/* DATE */
/* -------------------------------- */

function formatDate(value) {
  if (!value) return "—";

  try {
    let date;

    if (value?.seconds) {
      date = new Date(value.seconds * 1000);
    } else {
      date = new Date(value);
    }

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