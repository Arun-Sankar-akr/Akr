import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Banknote,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  IndianRupee,
  Plus,
  ReceiptText,
  Search,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  X,
  CheckCircle2,
  Pencil,
  Trash2,
  Tags,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { formatCurrency } from "../../utils/currency";
import { useTransactions } from "../../hooks/useTransactions";
import "./AdminDashboard.css";



function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTransactionDate(transaction) {
  return (
    toDate(transaction.createdAt) ||
    toDate(transaction.date) ||
    toDate(transaction.timestamp)
  );
}

function getPaymentMethod(transaction) {
  return String(
    transaction.paymentMethod ||
    transaction.paymentMode ||
    transaction.payment ||
    "Other"
  )
    .trim()
    .toLowerCase();
}

function paymentLabel(method) {
  if (method.includes("upi")) return "UPI";
  if (method.includes("cash")) return "Cash";
  if (method.includes("card")) return "Card";
  if (method.includes("bank")) return "Bank";
  return "Other";
}

function getItems(transaction) {
  return Array.isArray(transaction.items) ? transaction.items : [];
}

function getItemName(item) {
  return item?.serviceName || item?.service || item?.name || item?.title || "Service";
}

function getItemAmount(item) {
  const quantity = Number(item?.quantity ?? item?.qty ?? 1) || 1;
  const explicit =
    item?.total ??
    item?.lineTotal ??
    item?.amount ??
    item?.subtotal;

  if (explicit !== undefined && explicit !== null) {
    return Number(explicit) || 0;
  }

  return (Number(item?.price ?? item?.unitPrice ?? 0) || 0) * quantity;
}

function formatDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatTime(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function MiniLineChart({ points }) {
  const width = 720;
  const height = 250;
  const padX = 18;
  const padY = 22;
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);

  const coordinates = points.map((point, index) => {
    const x =
      points.length === 1
        ? width / 2
        : padX + (index / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((point.value - min) / range) * (height - padY * 2);
    return { ...point, x, y };
  });

  const line = coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${coordinates.at(-1).x} ${height - padY} L ${coordinates[0].x} ${height - padY} Z`;

  return (
    <div className="sales-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sales trend">
        <defs>
          <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(124, 58, 237, .22)" />
            <stop offset="100%" stopColor="rgba(124, 58, 237, 0)" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((row) => {
          const y = padY + (row / 3) * (height - padY * 2);
          return <line key={row} x1={padX} x2={width - padX} y1={y} y2={y} className="chart-grid-line" />;
        })}

        <path d={area} className="chart-area" />
        <path d={line} className="chart-line" />

        {coordinates.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="4" className="chart-dot" />
        ))}
      </svg>

      <div className="chart-labels">
        {points.map((point) => <span key={point.label}>{point.label}</span>)}
      </div>
    </div>
  );
}

function PaymentRing({ payments, total }) {
  const segments = [];
  let start = 0;

  payments.forEach((payment) => {
    const percentage = total ? (payment.value / total) * 100 : 0;
    segments.push(`${payment.color} ${start}% ${start + percentage}%`);
    start += percentage;
  });

  const background = segments.length
    ? `conic-gradient(${segments.join(", ")})`
    : "conic-gradient(#e9edf5 0 100%)";

  return (
    <div className="payment-visual">
      <div className="payment-ring" style={{ "--ring": background }}>
        <div className="payment-ring-center">
          <strong>{formatCurrency(total)}</strong>
          <span>collection</span>
        </div>
      </div>

      <div className="payment-list">
        {payments.map((payment) => (
          <div className="payment-row" key={payment.label}>
            <span className="payment-name">
              <i style={{ background: payment.color }} />
              {payment.label}
            </span>
            <strong>{formatCurrency(payment.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { transactions: rawTransactions, loading, error } = useTransactions(1000);
  const transactions = Array.isArray(rawTransactions) ? rawTransactions : [];

  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceMessage, setServiceMessage] = useState("");
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [serviceForm, setServiceForm] = useState({
    name: "",
    category: "",
    price: "",
    profit: "",
    unit: "",
  });

  // Firebase is the single source of truth for service names, rates and profit.
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "services"),
      (snapshot) => {
        setServices(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) =>
              String(a.name || a.serviceName || "").localeCompare(
                String(b.name || b.serviceName || "")
              )
            )
        );
        setServicesLoading(false);
      },
      (err) => {
        console.error("Services listener error:", err);
        setServicesLoading(false);
        setServiceMessage(
          err?.code === "permission-denied"
            ? "Permission denied while loading services."
            : "Could not load services."
        );
      }
    );
    return unsubscribe;
  }, []);

  const emptyServiceForm = () => ({
    name: "",
    category: "",
    price: "",
    profit: "",
    unit: "",
  });

  const openAddService = () => {
    setEditingServiceId(null);
    setServiceForm(emptyServiceForm());
    setServiceMessage("");
    setShowServiceModal(true);
  };

  const openEditService = (service) => {
    const price = Number(service.price ?? service.sellingPrice ?? 0);
    const profit = Number(service.profit ?? service.profitPerUnit ?? 0);

    setEditingServiceId(service.id);
    setServiceForm({
      name: service.name ?? service.serviceName ?? "",
      category: service.category ?? "",
      price: Number.isFinite(price) ? String(price) : "",
      profit: Number.isFinite(profit) ? String(profit) : "",
      unit: service.unit ?? "",
    });
    setServiceMessage("");
    setShowServiceModal(true);
  };

  const closeServiceModal = () => {
    if (serviceSaving) return;
    setShowServiceModal(false);
    setEditingServiceId(null);
    setServiceMessage("");
  };

  const updateServiceField = (field, value) => {
    setServiceForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveService = async (event) => {
    event.preventDefault();
    setServiceMessage("");

    const name = serviceForm.name.trim();
    const category = serviceForm.category.trim();
    const unit = serviceForm.unit.trim();
    const price = Number(serviceForm.price);
    const profit = Number(serviceForm.profit);

    if (!name) return setServiceMessage("Please enter a service name.");
    if (!category) return setServiceMessage("Please enter a category.");
    if (!unit) return setServiceMessage("Please enter a pricing unit.");
    if (!Number.isFinite(price) || price < 0) {
      return setServiceMessage("Please enter a valid selling price.");
    }
    if (!Number.isFinite(profit) || profit < 0) {
      return setServiceMessage("Please enter a valid profit.");
    }
    if (profit > price) {
      return setServiceMessage("Profit cannot be greater than the selling price.");
    }

    const payload = {
      name,
      serviceName: name,
      category,
      price,
      sellingPrice: price,
      profit,
      profitPerUnit: profit,
      costPrice: Math.max(0, price - profit),
      unit,
      active: true,
      updatedAt: serverTimestamp(),
    };

    try {
      setServiceSaving(true);

      if (editingServiceId) {
        await updateDoc(doc(db, "services", editingServiceId), payload);
        setServiceMessage("Service updated successfully.");
      } else {
        await addDoc(collection(db, "services"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setServiceMessage("Service added successfully.");
      }

      setServiceForm(emptyServiceForm());
      setTimeout(() => {
        setShowServiceModal(false);
        setEditingServiceId(null);
        setServiceMessage("");
      }, 700);
    } catch (err) {
      console.error("Save service error:", err);
      setServiceMessage(
        err?.code === "permission-denied"
          ? "Permission denied. Only an admin can manage services."
          : "Could not save the service. Please try again."
      );
    } finally {
      setServiceSaving(false);
    }
  };

  const handleDeleteService = async (service) => {
    if (!service?.id) return;
    const name = service.name || service.serviceName || "this service";

    if (!window.confirm(`Delete "${name}"? This will remove it from New Transaction.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "services", service.id));
      setServiceMessage("Service deleted successfully.");
      setTimeout(() => setServiceMessage(""), 1200);
    } catch (err) {
      console.error("Delete service error:", err);
      setServiceMessage(
        err?.code === "permission-denied"
          ? "Permission denied. Only an admin can delete services."
          : "Could not delete the service."
      );
    }
  };

  const todayKey = new Date().toDateString();

  const todayTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const date = getTransactionDate(transaction);
        return date?.toDateString() === todayKey;
      }),
    [transactions, todayKey]
  );

  const totals = useMemo(() => {
    return todayTransactions.reduce(
      (acc, transaction) => {
        acc.sales += Number(transaction.total ?? transaction.amount ?? 0) || 0;
        acc.profit += Number(
          transaction.grossProfit ?? transaction.profit ?? 0
        ) || 0;

        const method = paymentLabel(getPaymentMethod(transaction));
        acc.payments[method] = (acc.payments[method] || 0) +
          (Number(transaction.total ?? transaction.amount ?? 0) || 0);

        if (method === "Cash") {
          acc.cashSales += Number(transaction.total ?? transaction.amount ?? 0) || 0;
        }

        return acc;
      },
      { sales: 0, profit: 0, cashSales: 0, payments: {} }
    );
  }, [todayTransactions]);

  const weeklySales = useMemo(() => {
    const now = new Date();
    const values = [];

    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(now.getDate() - i);

      const value = transactions.reduce((sum, transaction) => {
        const transactionDate = getTransactionDate(transaction);
        if (!transactionDate) return sum;

        const sameDay = transactionDate.toDateString() === date.toDateString();
        return sameDay
          ? sum + (Number(transaction.total ?? transaction.amount ?? 0) || 0)
          : sum;
      }, 0);

      values.push({
        label: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(date),
        value,
      });
    }

    return values;
  }, [transactions]);

  const payments = useMemo(() => {
    const colors = {
      Cash: "#10b981",
      UPI: "#7c3aed",
      Card: "#2563eb",
      Bank: "#f59e0b",
      Other: "#94a3b8",
    };

    return Object.entries(totals.payments)
      .filter(([, value]) => value > 0)
      .map(([label, value]) => ({
        label,
        value,
        color: colors[label] || colors.Other,
      }));
  }, [totals.payments]);

  const servicePerformance = useMemo(() => {
    const map = new Map();

    todayTransactions.forEach((transaction) => {
      getItems(transaction).forEach((item) => {
        const name = getItemName(item);
        const amount = getItemAmount(item);
        const quantity = Number(item?.quantity ?? item?.qty ?? 1) || 1;

        if (!map.has(name)) map.set(name, { name, amount: 0, quantity: 0 });
        const current = map.get(name);
        current.amount += amount;
        current.quantity += quantity;
      });
    });

    return [...map.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [todayTransactions]);

  const recentTransactions = todayTransactions
    .slice()
    .sort((a, b) => {
      const da = getTransactionDate(a)?.getTime() || 0;
      const db = getTransactionDate(b)?.getTime() || 0;
      return db - da;
    })
    .slice(0, 7);

  const dateText = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const userName = "Admin";

  return (
    <div className="admin-dashboard">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><Sparkles size={14} /> SHOP OVERVIEW</div>
          <h1>Good morning, {userName}</h1>
          <p>Everything important about today's Xerox shop activity, in one place.</p>
          <div className="hero-meta">
            <span><CalendarDays size={15} /> {dateText}</span>
            <span className="live-pill"><i /> Live data</span>
          </div>
        </div>

        <Link to="/admin/new-transaction" className="hero-action">
          <span><Plus size={19} /></span>
          <div>
            <strong>New transaction</strong>
            <small>Create a customer bill</small>
          </div>
          <ArrowUpRight size={18} />
        </Link>
      </section>

      {error && (
        <div className="dashboard-alert">
          <Bell size={17} />
          <span>Transactions could not be loaded. Check your Firebase connection or Firestore permissions.</span>
        </div>
      )}

      <section className="metric-grid">
        <article className="metric-card metric-primary">
          <div className="metric-icon"><IndianRupee size={19} /></div>
          <div className="metric-content">
            <span>Today's sales</span>
            <strong>{formatCurrency(totals.sales)}</strong>
            <small><TrendingUp size={13} /> From today's transactions</small>
          </div>
          <div className="metric-decoration" />
        </article>

        <article className="metric-card">
          <div className="metric-icon green"><TrendingUp size={19} /></div>
          <div className="metric-content">
            <span>Net profit</span>
            <strong>{formatCurrency(totals.profit)}</strong>
            <small>Based on stored transaction profit</small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-icon blue"><ReceiptText size={19} /></div>
          <div className="metric-content">
            <span>Today's bills</span>
            <strong>{todayTransactions.length}</strong>
            <small>Completed transaction records</small>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-icon amber"><Banknote size={19} /></div>
          <div className="metric-content">
            <span>Cash sales</span>
            <strong>{formatCurrency(totals.cashSales)}</strong>
            <small>Cash payment transactions</small>
          </div>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-card sales-card">
          <div className="card-heading">
            <div>
              <span className="section-label">REVENUE</span>
              <h2>Sales performance</h2>
              <p>Actual transaction totals from the last 7 days.</p>
            </div>
            <Link to="/admin/reports/sales" className="card-link">Full report <ArrowUpRight size={14} /></Link>
          </div>

          <div className="sales-summary">
            <div>
              <strong>{formatCurrency(totals.sales)}</strong>
              <span>Today's collection</span>
            </div>
            <div className="summary-chip"><TrendingUp size={14} /> Live</div>
          </div>

          {loading ? (
            <div className="chart-loading">Loading sales activity…</div>
          ) : (
            <MiniLineChart points={weeklySales} />
          )}
        </article>

        <article className="dashboard-card payment-card">
          <div className="card-heading">
            <div>
              <span className="section-label">COLLECTION</span>
              <h2>Payment methods</h2>
              <p>Today's payment mix.</p>
            </div>
          </div>
          <PaymentRing payments={payments} total={totals.sales} />
        </article>
      </section>

      <section className="add-service-section">
        <div className="add-service-content">
          <div className="add-service-copy">
            <div className="add-service-icon"><Tags size={21} /></div>
            <div>
              <span className="section-label">SERVICE MANAGEMENT</span>
              <h2>Services & rates</h2>
              <p>Create, view, edit and delete services. Rates here are synced live with New Transaction.</p>
            </div>
          </div>
          <button type="button" className="dashboard-add-service-btn" onClick={openAddService}>
            <Plus size={15} /> Add Service
          </button>
        </div>
      </section>

      <section className="dashboard-card service-manager-card">
        <div className="card-heading">
          <div>
            <span className="section-label">CRUD MANAGEMENT</span>
            <h2>Service catalogue</h2>
            <p>Firebase services collection • live billing rates</p>
          </div>
          <span className="service-live-count">
            {servicesLoading ? "Loading…" : `${services.length} service${services.length === 1 ? "" : "s"}`}
          </span>
        </div>

        {serviceMessage && !showServiceModal && (
          <div className="service-form-message success service-manager-message">
            <CheckCircle2 size={15} /> {serviceMessage}
          </div>
        )}

        {servicesLoading ? (
          <div className="empty-dashboard"><Boxes size={25} /><strong>Loading services…</strong><span>Syncing the service catalogue from Firebase.</span></div>
        ) : services.length === 0 ? (
          <div className="empty-dashboard"><Tags size={25} /><strong>No services yet</strong><span>Add your first service and it will appear in New Transaction.</span></div>
        ) : (
          <div className="service-manager-list">
            {services.map((service) => {
              const price = Number(service.price ?? service.sellingPrice ?? 0) || 0;
              const profit = Number(service.profit ?? service.profitPerUnit ?? 0) || 0;
              const cost = Math.max(0, price - profit);
              return (
                <div className="service-manager-row" key={service.id}>
                  <div className="service-manager-main">
                    <div className="service-manager-icon"><Tags size={16} /></div>
                    <div>
                      <strong>{service.name || service.serviceName || "Unnamed service"}</strong>
                      <span>{service.category || "General"} • {service.unit || "unit"}</span>
                    </div>
                  </div>
                  <div className="service-manager-rate"><span>Rate</span><strong>{formatCurrency(price)}</strong></div>
                  <div className="service-manager-profit"><span>Profit</span><strong>{formatCurrency(profit)}</strong></div>
                  <div className="service-manager-cost"><span>Cost</span><strong>{formatCurrency(cost)}</strong></div>
                  <div className="service-manager-actions">
                    <button type="button" className="service-edit-btn" onClick={() => openEditService(service)}><Pencil size={15} /> Edit</button>
                    <button type="button" className="service-delete-btn" onClick={() => handleDeleteService(service)}><Trash2 size={15} /> Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="lower-grid">
        <article className="dashboard-card service-card">
          <div className="card-heading">
            <div>
              <span className="section-label">SERVICES</span>
              <h2>Today's service performance</h2>
              <p>Calculated from transaction line items.</p>
            </div>
            <Link to="/admin/services" className="card-link">
              Manage services <ArrowUpRight size={14} />
            </Link>
          </div>

          {servicePerformance.length === 0 ? (
            <div className="empty-dashboard">
              <Boxes size={25} />
              <strong>No service-level data yet</strong>
              <span>Once today's bills contain service items, they will appear here.</span>
            </div>
          ) : (
            <div className="service-list">
              {servicePerformance.map((service, index) => {
                const max = servicePerformance[0]?.amount || 1;
                const percent = Math.max(8, (service.amount / max) * 100);
                return (
                  <div className="service-row" key={service.name}>
                    <div className="service-rank">{String(index + 1).padStart(2, "0")}</div>
                    <div className="service-info">
                      <div>
                        <strong>{service.name}</strong>
                        <span>{service.quantity} unit{service.quantity === 1 ? "" : "s"}</span>
                      </div>
                      <div className="service-bar"><i style={{ width: `${percent}%` }} /></div>
                    </div>
                    <strong className="service-value">{formatCurrency(service.amount)}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="dashboard-card activity-card">
          <div className="card-heading">
            <div>
              <span className="section-label">ACTIVITY</span>
              <h2>Latest transactions</h2>
              <p>Most recent bills created today.</p>
            </div>
            <Link to="/admin/transactions" className="card-link">View all <ArrowUpRight size={14} /></Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="empty-dashboard">
              <ReceiptText size={25} />
              <strong>No transactions today</strong>
              <span>New bills will appear here automatically.</span>
            </div>
          ) : (
            <div className="activity-list">
              {recentTransactions.map((transaction) => {
                const amount = Number(transaction.total ?? transaction.amount ?? 0) || 0;
                const date = getTransactionDate(transaction);
                const invoice = transaction.invoiceNo || transaction.invoiceNumber || transaction.id?.slice(0, 8) || "—";
                const customer = transaction.customerName || transaction.customer?.name || "Walk-in customer";
                return (
                  <div className="activity-row" key={transaction.id || invoice}>
                    <div className="activity-icon"><ReceiptText size={15} /></div>
                    <div className="activity-info">
                      <strong>{invoice}</strong>
                      <span>{customer} · {formatTime(date)}</span>
                    </div>
                    <strong>{formatCurrency(amount)}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <section className="dashboard-card transactions-card">
        <div className="card-heading">
          <div>
            <span className="section-label">TRANSACTIONS</span>
            <h2>Today's transaction register</h2>
            <p>A compact view of today's billing activity.</p>
          </div>
          <Link to="/admin/transactions" className="card-link">Open transactions <ArrowUpRight size={14} /></Link>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="empty-dashboard table-empty">
            <ReceiptText size={25} />
            <strong>No transactions available</strong>
            <span>There is no transaction record for today.</span>
          </div>
        ) : (
          <div className="transaction-table-wrap">
            <table className="transaction-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Payment</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th className="align-right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((transaction) => {
                  const date = getTransactionDate(transaction);
                  const amount = Number(transaction.total ?? transaction.amount ?? 0) || 0;
                  const invoice = transaction.invoiceNo || transaction.invoiceNumber || transaction.id?.slice(0, 8) || "—";
                  const customer = transaction.customerName || transaction.customer?.name || "Walk-in customer";
                  const method = paymentLabel(getPaymentMethod(transaction));

                  return (
                    <tr key={transaction.id || invoice}>
                      <td><span className="invoice-badge">{invoice}</span></td>
                      <td>
                        <div className="customer-cell">
                          <span className="customer-avatar"><UserRound size={14} /></span>
                          <span>{customer}</span>
                        </div>
                      </td>
                      <td><span className={`payment-badge ${method.toLowerCase()}`}>{method}</span></td>
                      <td>{formatDate(date)}</td>
                      <td><span className="time-cell"><Clock3 size={13} /> {formatTime(date)}</span></td>
                      <td className="align-right amount-cell">{formatCurrency(amount)}</td>
                      <td><ChevronRight size={16} className="table-arrow" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showServiceModal && (
        <div
          className="service-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeServiceModal();
          }}
        >
          <div className="service-modal">
            <div className="service-modal-head">
              <div className="service-modal-title">
                <div className="service-modal-icon">
                  <Tags size={18} />
                </div>
                <div>
                  <span>TRANSACTION SERVICES</span>
                  <h2>{editingServiceId ? "Edit Service" : "Add New Service"}</h2>
                  <p>This service will become available when creating a new transaction.</p>
                </div>
              </div>

              <button
                type="button"
                className="service-modal-close"
                onClick={closeServiceModal}
                disabled={serviceSaving}
              >
                <X size={18} />
              </button>
            </div>

            <form className="service-form" onSubmit={handleSaveService}>
              <div className="service-form-grid">
                <label className="service-field service-field-wide">
                  <span>Service name</span>
                  <input
                    value={serviceForm.name}
                    onChange={(event) =>
                      updateServiceField("name", event.target.value)
                    }
                    placeholder="e.g. Colour Xerox"
                    autoFocus
                  />
                </label>

                <label className="service-field">
                  <span>Category</span>
                  <input
                    type="text"
                    value={serviceForm.category}
                    onChange={(event) =>
                      updateServiceField("category", event.target.value)
                    }
                    placeholder="e.g. Xerox, Printing, Online"
                  />
                </label>

                <label className="service-field">
                  <span>Selling price (₹)</span>
                  <div className="service-price-input">
                    <IndianRupee size={15} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={serviceForm.price}
                      onChange={(event) =>
                        updateServiceField("price", event.target.value)
                      }
                      placeholder="0.00"
                    />
                  </div>
                </label>

                <label className="service-field">
                  <span>Profit per unit (₹)</span>
                  <div className="service-profit-input">
                    <IndianRupee size={15} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={serviceForm.profit}
                      onChange={(event) =>
                        updateServiceField("profit", event.target.value)
                      }
                      placeholder="0.00"
                    />
                  </div>
                </label>

                <label className="service-field">
                  <span>Unit / pricing</span>
                  <input
                    type="text"
                    value={serviceForm.unit}
                    onChange={(event) =>
                      updateServiceField("unit", event.target.value)
                    }
                    placeholder="e.g. per page"
                  />
                </label>
              </div>

              <div className="service-form-note">
                Profit is saved for this service and can be used when calculating transaction profit.
              </div>

              {serviceMessage && (
                <div
                  className={`service-form-message ${serviceMessage.includes("successfully") ? "success" : "error"
                    }`}
                >
                  <CheckCircle2 size={15} />
                  {serviceMessage}
                </div>
              )}

              <div className="service-modal-footer">
                <button
                  type="button"
                  className="service-cancel-btn"
                  onClick={closeServiceModal}
                  disabled={serviceSaving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="service-save-btn"
                  disabled={serviceSaving}
                >
                  {serviceSaving ? (
                    <>
                      <span className="service-mini-spinner" />
                      {editingServiceId ? "Saving..." : "Adding..."}
                    </>
                  ) : (
                    <>
                      {editingServiceId ? <CheckCircle2 size={16} /> : <Plus size={16} />}
                      {editingServiceId ? "Save changes" : "Add service"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="dashboard-footer">
        <span><CircleDollarSign size={14} /> Business workspace</span>
        <span>Data shown from Firebase transaction records</span>
      </footer>
    </div>
  );
}