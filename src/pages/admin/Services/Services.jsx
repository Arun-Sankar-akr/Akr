import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Download,
  Pencil,
  Trash2,
  Eye,
  Package,
  RefreshCw,
  X,
  CheckCircle2,
  XCircle,
  Tag,
  IndianRupee,
  Layers3,
} from "lucide-react";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";
import { useAuth } from "../../../context/AuthContext";

import "./Service.css";

const categories = [
  "Xerox",
  "Printing",
  "Lamination",
  "Photo",
  "Scanning",
  "Binding",
  "Stationery",
  "Online Services",
  "Design",
  "Other",
];

const getPrice = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export default function Services() {
  const { profile } = useAuth();

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");

  const [selectedService, setSelectedService] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    setLoading(true);
    setError("");

    const servicesRef = collection(db, "services");

    const servicesQuery = query(
      servicesRef,
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      servicesQuery,
      (snapshot) => {
        const data = snapshot.docs.map((serviceDoc) => {
          const data = serviceDoc.data();

          const sellingPrice = getPrice(
            data.sellingPrice ??
            data.price ??
            data.sellPrice ??
            0
          );

          const costPrice = getPrice(
            data.costPrice ??
            data.cost ??
            data.purchasePrice ??
            0
          );

          return {
            id: serviceDoc.id,
            ...data,

            name:
              data.name ||
              data.serviceName ||
              "Unnamed Service",

            category:
              data.category ||
              "Other",

            unit:
              data.unit ||
              "piece",

            sellingPrice,
            costPrice,

            profit:
              sellingPrice - costPrice,

            active:
              data.active !== false &&
              data.status !== "inactive",
          };
        });

        setServices(data);
        setLoading(false);
      },
      (firebaseError) => {
        console.error(
          "Services Firestore error:",
          firebaseError
        );

        setError(
          firebaseError?.message ||
          "Unable to load services."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredServices = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return services.filter((service) => {
      const matchesSearch =
        !searchText ||
        service.name
          .toLowerCase()
          .includes(searchText) ||
        service.category
          .toLowerCase()
          .includes(searchText) ||
        String(service.description || "")
          .toLowerCase()
          .includes(searchText);

      const matchesCategory =
        category === "all" ||
        service.category === category;

      const matchesStatus =
        status === "all" ||
        (status === "active" && service.active) ||
        (status === "inactive" && !service.active);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus
      );
    });
  }, [services, search, category, status]);

  const stats = useMemo(() => {
    const active = services.filter(
      (service) => service.active
    );

    const inactive = services.filter(
      (service) => !service.active
    );

    const averageSellingPrice =
      services.length > 0
        ? services.reduce(
          (sum, service) =>
            sum + service.sellingPrice,
          0
        ) / services.length
        : 0;

    const averageProfit =
      services.length > 0
        ? services.reduce(
          (sum, service) =>
            sum + service.profit,
          0
        ) / services.length
        : 0;

    return {
      total: services.length,
      active: active.length,
      inactive: inactive.length,
      averageSellingPrice,
      averageProfit,
    };
  }, [services]);

  const handleDelete = async () => {
    if (!deleteTarget || !isAdmin) return;

    try {
      await deleteDoc(
        doc(db, "services", deleteTarget.id)
      );

      setDeleteTarget(null);

      if (
        selectedService?.id === deleteTarget.id
      ) {
        setSelectedService(null);
      }
    } catch (deleteError) {
      console.error(
        "Delete service error:",
        deleteError
      );

      setError(
        deleteError?.message ||
        "Unable to delete service."
      );
    }
  };

  const exportCSV = () => {
    if (!filteredServices.length) return;

    const headers = [
      "Service",
      "Category",
      "Unit",
      "Selling Price",
      "Cost Price",
      "Profit",
      "Status",
      "Description",
    ];

    const rows = filteredServices.map(
      (service) => [
        service.name,
        service.category,
        service.unit,
        service.sellingPrice,
        service.costPrice,
        service.profit,
        service.active
          ? "Active"
          : "Inactive",
        service.description || "",
      ]
    );

    const escapeCSV = (value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) =>
        row.map(escapeCSV).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `services-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setStatus("all");
  };

  return (
    <div className="services-page">
      {/* HEADER */}
      <div className="services-page-head">
        <div>
          <div className="services-eyebrow">
            MANAGEMENT
          </div>

          <h1>Services</h1>

          <p>
            Manage Xerox, printing, lamination,
            photo, stationery and other pricing.
          </p>
        </div>

        <div className="services-head-actions">
          <button
            className="services-secondary-btn"
            onClick={exportCSV}
            disabled={!filteredServices.length}
          >
            <Download size={16} />
            Export
          </button>

          {isAdmin && (
            <a
              href="/admin/services/add"
              className="services-primary-btn"
            >
              <Plus size={17} />
              Add Service
            </a>
          )}
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="services-error">
          <XCircle size={18} />

          <span>{error}</span>

          <button
            onClick={() => setError("")}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* STATS */}
      <section className="services-stats">
        <div className="service-stat-card">
          <div className="service-stat-icon blue">
            <Layers3 size={20} />
          </div>

          <div>
            <span>Total Services</span>
            <strong>{stats.total}</strong>
          </div>
        </div>

        <div className="service-stat-card">
          <div className="service-stat-icon green">
            <CheckCircle2 size={20} />
          </div>

          <div>
            <span>Active</span>
            <strong>{stats.active}</strong>
          </div>
        </div>

        <div className="service-stat-card">
          <div className="service-stat-icon orange">
            <XCircle size={20} />
          </div>

          <div>
            <span>Inactive</span>
            <strong>{stats.inactive}</strong>
          </div>
        </div>

        <div className="service-stat-card">
          <div className="service-stat-icon purple">
            <IndianRupee size={20} />
          </div>

          <div>
            <span>Avg. Selling Price</span>
            <strong>
              {formatCurrency(
                stats.averageSellingPrice
              )}
            </strong>
          </div>
        </div>
      </section>

      {/* MAIN PANEL */}
      <section className="services-panel">
        <div className="services-toolbar">
          <div className="services-search">
            <Search size={17} />

            <input
              type="text"
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search services..."
            />

            {search && (
              <button
                className="search-clear"
                onClick={() => setSearch("")}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="services-filters">
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value)
              }
            >
              <option value="all">
                All Categories
              </option>

              {categories.map((item) => (
                <option
                  value={item}
                  key={item}
                >
                  {item}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value)
              }
            >
              <option value="all">
                All Status
              </option>

              <option value="active">
                Active
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>

            {(search ||
              category !== "all" ||
              status !== "all") && (
                <button
                  className="clear-filter-btn"
                  onClick={clearFilters}
                >
                  Clear
                </button>
              )}

            <button
              className="refresh-btn"
              onClick={() => {
                setSearch(search);
              }}
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="services-result-bar">
          <span>
            Showing{" "}
            <strong>
              {filteredServices.length}
            </strong>{" "}
            of{" "}
            <strong>{services.length}</strong>{" "}
            services
          </span>

          {isAdmin && (
            <span className="admin-access-label">
              Admin management enabled
            </span>
          )}
        </div>

        {/* LOADING */}
        {loading ? (
          <div className="services-loading">
            <div className="services-spinner" />
            <span>Loading services...</span>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="services-empty">
            <div className="services-empty-icon">
              <Package size={28} />
            </div>

            <h2>
              {services.length === 0
                ? "No services yet"
                : "No services found"}
            </h2>

            <p>
              {services.length === 0
                ? "Create your first shop service to start managing prices."
                : "Try changing your search or filter options."}
            </p>

            {services.length === 0 &&
              isAdmin && (
                <a
                  href="#/admin/add-service"
                  className="services-primary-btn"
                >
                  <Plus size={16} />
                  Add First Service
                </a>
              )}
          </div>
        ) : (
          <div className="services-table-wrap">
            <table className="services-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Selling Price</th>
                  <th>Cost Price</th>
                  <th>Profit</th>
                  <th>Status</th>
                  <th className="action-column">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredServices.map(
                  (service) => (
                    <tr key={service.id}>
                      <td>
                        <div className="service-name-cell">
                          <div className="service-row-icon">
                            <Tag size={17} />
                          </div>

                          <div>
                            <strong>
                              {service.name}
                            </strong>

                            {service.description && (
                              <small>
                                {service.description}
                              </small>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="category-badge">
                          {service.category}
                        </span>
                      </td>

                      <td>
                        <span className="unit-text">
                          {service.unit}
                        </span>
                      </td>

                      <td>
                        <strong className="selling-price">
                          {formatCurrency(
                            service.sellingPrice
                          )}
                        </strong>
                      </td>

                      <td>
                        <span className="cost-price">
                          {formatCurrency(
                            service.costPrice
                          )}
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            service.profit >= 0
                              ? "profit-positive"
                              : "profit-negative"
                          }
                        >
                          {formatCurrency(
                            service.profit
                          )}
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            service.active
                              ? "status-badge active"
                              : "status-badge inactive"
                          }
                        >
                          {service.active ? (
                            <CheckCircle2
                              size={13}
                            />
                          ) : (
                            <XCircle size={13} />
                          )}

                          {service.active
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </td>

                      <td>
                        <div className="service-actions">
                          <button
                            className="icon-action view"
                            onClick={() =>
                              setSelectedService(
                                service
                              )
                            }
                            title="View"
                          >
                            <Eye size={16} />
                          </button>

                          {isAdmin && (
                            <>
                              <a
                                href={`#/admin/edit-service?id=${service.id}`}
                                className="icon-action edit"
                                title="Edit"
                              >
                                <Pencil
                                  size={16}
                                />
                              </a>

                              <button
                                className="icon-action delete"
                                onClick={() =>
                                  setDeleteTarget(
                                    service
                                  )
                                }
                                title="Delete"
                              >
                                <Trash2
                                  size={16}
                                />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* VIEW MODAL */}
      {selectedService && (
        <div
          className="services-modal-overlay"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget
            ) {
              setSelectedService(null);
            }
          }}
        >
          <div className="services-modal">
            <div className="services-modal-head">
              <div>
                <span>Service Details</span>
                <h2>
                  {selectedService.name}
                </h2>
              </div>

              <button
                onClick={() =>
                  setSelectedService(null)
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="service-detail-grid">
              <div>
                <span>Category</span>
                <strong>
                  {selectedService.category}
                </strong>
              </div>

              <div>
                <span>Unit</span>
                <strong>
                  {selectedService.unit}
                </strong>
              </div>

              <div>
                <span>Selling Price</span>
                <strong>
                  {formatCurrency(
                    selectedService.sellingPrice
                  )}
                </strong>
              </div>

              <div>
                <span>Cost Price</span>
                <strong>
                  {formatCurrency(
                    selectedService.costPrice
                  )}
                </strong>
              </div>

              <div>
                <span>Profit</span>
                <strong
                  className={
                    selectedService.profit >= 0
                      ? "detail-profit-positive"
                      : "detail-profit-negative"
                  }
                >
                  {formatCurrency(
                    selectedService.profit
                  )}
                </strong>
              </div>

              <div>
                <span>Status</span>
                <strong>
                  {selectedService.active
                    ? "Active"
                    : "Inactive"}
                </strong>
              </div>
            </div>

            {selectedService.description && (
              <div className="service-description-box">
                <span>Description</span>
                <p>
                  {selectedService.description}
                </p>
              </div>
            )}

            <div className="services-modal-footer">
              {isAdmin && (
                <a
                  href={`#/admin/edit-service?id=${selectedService.id}`}
                  className="services-primary-btn"
                >
                  <Pencil size={15} />
                  Edit Service
                </a>
              )}

              <button
                className="services-secondary-btn"
                onClick={() =>
                  setSelectedService(null)
                }
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteTarget && (
        <div
          className="services-modal-overlay"
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget
            ) {
              setDeleteTarget(null);
            }
          }}
        >
          <div className="delete-modal">
            <div className="delete-icon">
              <Trash2 size={22} />
            </div>

            <h2>Delete Service?</h2>

            <p>
              Are you sure you want to delete{" "}
              <strong>
                {deleteTarget.name}
              </strong>
              ? This action cannot be undone.
            </p>

            <div className="delete-actions">
              <button
                className="services-secondary-btn"
                onClick={() =>
                  setDeleteTarget(null)
                }
              >
                Cancel
              </button>

              <button
                className="danger-btn"
                onClick={handleDelete}
              >
                <Trash2 size={15} />
                Delete Service
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}