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
  AlertTriangle,
  XCircle,
  IndianRupee,
  Layers3,
  Boxes,
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

import "./Inventory.css";

const categories = [
  "Paper",
  "Toner",
  "Ink",
  "Stationery",
  "Printing Materials",
  "Binding Materials",
  "Lamination Materials",
  "Photo Materials",
  "Office Supplies",
  "Cleaning",
  "Other",
];

const getNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export default function Inventory() {
  const { profile } = useAuth();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");

  const [selectedItem, setSelectedItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    setLoading(true);
    setError("");

    const inventoryRef = collection(db, "inventory");

    const inventoryQuery = query(
      inventoryRef,
      orderBy("name", "asc")
    );

    const unsubscribe = onSnapshot(
      inventoryQuery,
      (snapshot) => {
        const data = snapshot.docs.map((itemDoc) => {
          const data = itemDoc.data();

          const quantity = getNumber(
            data.quantity ??
            data.currentStock ??
            data.stock ??
            0
          );

          const unitCost = getNumber(
            data.unitCost ??
            data.costPrice ??
            data.purchasePrice ??
            0
          );

          const reorderLevel = getNumber(
            data.reorderLevel ??
            data.lowStockLevel ??
            5
          );

          return {
            id: itemDoc.id,
            ...data,

            name:
              data.name ||
              data.itemName ||
              "Unnamed Item",

            category:
              data.category ||
              "Other",

            unit:
              data.unit ||
              "piece",

            quantity,
            unitCost,
            reorderLevel,

            stockValue:
              quantity * unitCost,

            active:
              data.active !== false &&
              data.status !== "inactive",
          };
        });

        setItems(data);
        setLoading(false);
      },
      (firebaseError) => {
        console.error(
          "Inventory Firestore error:",
          firebaseError
        );

        setError(
          firebaseError?.message ||
          "Unable to load inventory."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const getStockStatus = (item) => {
    if (item.quantity <= 0) {
      return "out";
    }

    if (
      item.quantity <= item.reorderLevel
    ) {
      return "low";
    }

    return "good";
  };

  const filteredItems = useMemo(() => {
    const searchText =
      search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !searchText ||
        item.name
          .toLowerCase()
          .includes(searchText) ||
        item.category
          .toLowerCase()
          .includes(searchText) ||
        String(item.supplier || "")
          .toLowerCase()
          .includes(searchText);

      const matchesCategory =
        category === "all" ||
        item.category === category;

      const itemStatus = getStockStatus(item);

      const matchesStock =
        stockFilter === "all" ||
        itemStatus === stockFilter;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStock
      );
    });
  }, [
    items,
    search,
    category,
    stockFilter,
  ]);

  const stats = useMemo(() => {
    const totalQuantity = items.reduce(
      (sum, item) =>
        sum + item.quantity,
      0
    );

    const stockValue = items.reduce(
      (sum, item) =>
        sum + item.stockValue,
      0
    );

    const lowStock = items.filter(
      (item) =>
        getStockStatus(item) === "low"
    );

    const outOfStock = items.filter(
      (item) =>
        getStockStatus(item) === "out"
    );

    return {
      totalItems: items.length,
      totalQuantity,
      stockValue,
      lowStock: lowStock.length,
      outOfStock: outOfStock.length,
    };
  }, [items]);

  const handleDelete = async () => {
    if (!deleteTarget || !isAdmin) {
      return;
    }

    try {
      await deleteDoc(
        doc(
          db,
          "inventory",
          deleteTarget.id
        )
      );

      setDeleteTarget(null);

      if (
        selectedItem?.id ===
        deleteTarget.id
      ) {
        setSelectedItem(null);
      }
    } catch (deleteError) {
      console.error(
        "Delete inventory error:",
        deleteError
      );

      setError(
        deleteError?.message ||
        "Unable to delete inventory item."
      );
    }
  };

  const exportCSV = () => {
    if (!filteredItems.length) {
      return;
    }

    const headers = [
      "Item",
      "Category",
      "Unit",
      "Quantity",
      "Reorder Level",
      "Unit Cost",
      "Stock Value",
      "Supplier",
      "Status",
    ];

    const rows = filteredItems.map(
      (item) => [
        item.name,
        item.category,
        item.unit,
        item.quantity,
        item.reorderLevel,
        item.unitCost,
        item.stockValue,
        item.supplier || "",
        getStockStatus(item),
      ]
    );

    const escapeCSV = (value) => {
      const text = String(value ?? "");

      return `"${text.replace(
        /"/g,
        '""'
      )}"`;
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

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;

    link.download = `inventory-${new Date()
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
    setStockFilter("all");
  };

  return (
    <div className="inventory-page">
      {/* HEADER */}

      <div className="inventory-page-head">
        <div>
          <div className="inventory-eyebrow">
            MANAGEMENT
          </div>

          <h1>Inventory</h1>

          <p>
            Track stationery, consumables and
            shop stock.
          </p>
        </div>

        <div className="inventory-head-actions">
          <button
            className="inventory-secondary-btn"
            onClick={exportCSV}
            disabled={!filteredItems.length}
          >
            <Download size={16} />
            Export
          </button>

          {isAdmin && (
            <a
              href="#/admin/add-stock"
              className="inventory-primary-btn"
            >
              <Plus size={17} />
              Add Stock
            </a>
          )}
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div className="inventory-error">
          <XCircle size={18} />

          <span>{error}</span>

          <button
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* STATS */}

      <section className="inventory-stats">
        <div className="inventory-stat-card">
          <div className="inventory-stat-icon blue">
            <Boxes size={20} />
          </div>

          <div>
            <span>Total Items</span>

            <strong>
              {stats.totalItems}
            </strong>
          </div>
        </div>

        <div className="inventory-stat-card">
          <div className="inventory-stat-icon purple">
            <Layers3 size={20} />
          </div>

          <div>
            <span>Total Quantity</span>

            <strong>
              {stats.totalQuantity}
            </strong>
          </div>
        </div>

        <div className="inventory-stat-card">
          <div className="inventory-stat-icon green">
            <IndianRupee size={20} />
          </div>

          <div>
            <span>Stock Value</span>

            <strong>
              {formatCurrency(
                stats.stockValue
              )}
            </strong>
          </div>
        </div>

        <div className="inventory-stat-card">
          <div className="inventory-stat-icon orange">
            <AlertTriangle size={20} />
          </div>

          <div>
            <span>Low / Out</span>

            <strong>
              {stats.lowStock} /{" "}
              {stats.outOfStock}
            </strong>
          </div>
        </div>
      </section>

      {/* PANEL */}

      <section className="inventory-panel">
        <div className="inventory-toolbar">
          <div className="inventory-search">
            <Search size={17} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search inventory..."
            />

            {search && (
              <button
                onClick={() =>
                  setSearch("")
                }
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="inventory-filters">
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value)
              }
            >
              <option value="all">
                All Categories
              </option>

              {categories.map(
                (item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                )
              )}
            </select>

            <select
              value={stockFilter}
              onChange={(e) =>
                setStockFilter(
                  e.target.value
                )
              }
            >
              <option value="all">
                All Stock
              </option>

              <option value="good">
                In Stock
              </option>

              <option value="low">
                Low Stock
              </option>

              <option value="out">
                Out of Stock
              </option>
            </select>

            {(search ||
              category !== "all" ||
              stockFilter !== "all") && (
                <button
                  className="inventory-clear-btn"
                  onClick={clearFilters}
                >
                  Clear
                </button>
              )}

            <button
              className="inventory-refresh-btn"
              onClick={() =>
                setSearch(search)
              }
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="inventory-result-bar">
          <span>
            Showing{" "}
            <strong>
              {filteredItems.length}
            </strong>{" "}
            of{" "}
            <strong>
              {items.length}
            </strong>{" "}
            items
          </span>

          {isAdmin && (
            <span className="inventory-admin-label">
              Admin management enabled
            </span>
          )}
        </div>

        {loading ? (
          <div className="inventory-loading">
            <div className="inventory-spinner" />

            <span>
              Loading inventory...
            </span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="inventory-empty">
            <div className="inventory-empty-icon">
              <Package size={28} />
            </div>

            <h2>
              {items.length === 0
                ? "No inventory yet"
                : "No inventory found"}
            </h2>

            <p>
              {items.length === 0
                ? "Add your first stock item to start tracking inventory."
                : "Try changing your search or filters."}
            </p>

            {items.length === 0 &&
              isAdmin && (
                <a
                  href="#/admin/add-stock"
                  className="inventory-primary-btn"
                >
                  <Plus size={16} />
                  Add First Stock
                </a>
              )}
          </div>
        ) : (
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Stock Value</th>
                  <th>Reorder At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map(
                  (item) => {
                    const stockStatus =
                      getStockStatus(item);

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="inventory-item-cell">
                            <div className="inventory-item-icon">
                              <Package
                                size={17}
                              />
                            </div>

                            <div>
                              <strong>
                                {item.name}
                              </strong>

                              {item.supplier && (
                                <small>
                                  {
                                    item.supplier
                                  }
                                </small>
                              )}
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="inventory-category">
                            {item.category}
                          </span>
                        </td>

                        <td>
                          <strong className={
                            stockStatus === "out"
                              ? "quantity-out"
                              : stockStatus === "low"
                                ? "quantity-low"
                                : "quantity-good"
                          }>
                            {item.quantity}
                          </strong>

                          <span className="quantity-unit">
                            {" "}
                            {item.unit}
                          </span>
                        </td>

                        <td>
                          <span className="inventory-cost">
                            {formatCurrency(
                              item.unitCost
                            )}
                          </span>
                        </td>

                        <td>
                          <strong>
                            {formatCurrency(
                              item.stockValue
                            )}
                          </strong>
                        </td>

                        <td>
                          <span className="reorder-level">
                            {item.reorderLevel}
                          </span>
                        </td>

                        <td>
                          {stockStatus ===
                            "good" ? (
                            <span className="inventory-status good">
                              <CheckCircle2
                                size={13}
                              />
                              In Stock
                            </span>
                          ) : stockStatus ===
                            "low" ? (
                            <span className="inventory-status low">
                              <AlertTriangle
                                size={13}
                              />
                              Low Stock
                            </span>
                          ) : (
                            <span className="inventory-status out">
                              <XCircle
                                size={13}
                              />
                              Out of Stock
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="inventory-actions">
                            <button
                              className="inventory-icon-action view"
                              onClick={() =>
                                setSelectedItem(
                                  item
                                )
                              }
                              title="View"
                            >
                              <Eye size={16} />
                            </button>

                            {isAdmin && (
                              <>
                                <a
                                  href={`#/admin/add-stock?id=${item.id}&mode=edit`}
                                  className="inventory-icon-action edit"
                                  title="Edit"
                                >
                                  <Pencil
                                    size={16}
                                  />
                                </a>

                                <button
                                  className="inventory-icon-action delete"
                                  onClick={() =>
                                    setDeleteTarget(
                                      item
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
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* VIEW MODAL */}

      {selectedItem && (
        <div
          className="inventory-modal-overlay"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              setSelectedItem(null);
            }
          }}
        >
          <div className="inventory-modal">
            <div className="inventory-modal-head">
              <div>
                <span>
                  Inventory Details
                </span>

                <h2>
                  {selectedItem.name}
                </h2>
              </div>

              <button
                onClick={() =>
                  setSelectedItem(null)
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="inventory-detail-grid">
              <div>
                <span>Category</span>
                <strong>
                  {selectedItem.category}
                </strong>
              </div>

              <div>
                <span>Unit</span>
                <strong>
                  {selectedItem.unit}
                </strong>
              </div>

              <div>
                <span>Current Stock</span>
                <strong>
                  {selectedItem.quantity}{" "}
                  {selectedItem.unit}
                </strong>
              </div>

              <div>
                <span>Unit Cost</span>
                <strong>
                  {formatCurrency(
                    selectedItem.unitCost
                  )}
                </strong>
              </div>

              <div>
                <span>Stock Value</span>
                <strong>
                  {formatCurrency(
                    selectedItem.stockValue
                  )}
                </strong>
              </div>

              <div>
                <span>Reorder Level</span>
                <strong>
                  {selectedItem.reorderLevel}
                </strong>
              </div>

              <div>
                <span>Supplier</span>
                <strong>
                  {selectedItem.supplier ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>Status</span>
                <strong>
                  {getStockStatus(
                    selectedItem
                  ) === "good"
                    ? "In Stock"
                    : getStockStatus(
                      selectedItem
                    ) === "low"
                      ? "Low Stock"
                      : "Out of Stock"}
                </strong>
              </div>
            </div>

            {selectedItem.description && (
              <div className="inventory-description">
                <span>Description</span>

                <p>
                  {
                    selectedItem.description
                  }
                </p>
              </div>
            )}

            <div className="inventory-modal-footer">
              <button
                className="inventory-secondary-btn"
                onClick={() =>
                  setSelectedItem(null)
                }
              >
                Close
              </button>

              {isAdmin && (
                <a
                  href={`#/admin/add-stock?id=${selectedItem.id}&mode=edit`}
                  className="inventory-primary-btn"
                >
                  <Pencil size={15} />
                  Edit Item
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}

      {deleteTarget && (
        <div
          className="inventory-modal-overlay"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              setDeleteTarget(null);
            }
          }}
        >
          <div className="inventory-delete-modal">
            <div className="inventory-delete-icon">
              <Trash2 size={22} />
            </div>

            <h2>
              Delete Inventory Item?
            </h2>

            <p>
              Are you sure you want to
              delete{" "}
              <strong>
                {deleteTarget.name}
              </strong>
              ? This will remove the current
              inventory record.
            </p>

            <div className="inventory-delete-actions">
              <button
                className="inventory-secondary-btn"
                onClick={() =>
                  setDeleteTarget(null)
                }
              >
                Cancel
              </button>

              <button
                className="inventory-danger-btn"
                onClick={handleDelete}
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}