import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  Eye,
  PackagePlus,
  X,
  RefreshCw,
  ShoppingCart,
  Truck,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

import { db } from "../../../services/firebase";
import { formatCurrency } from "../../../utils/currency";

import "./Inventory.css";

const getNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
};

const getDate = (value) => {
  if (!value) {
    return null;
  }

  if (
    typeof value.toDate ===
    "function"
  ) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed;
};

const formatDate = (value) => {
  const date = getDate(value);

  if (!date) {
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
};

export default function StockHistory() {
  const [history, setHistory] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [movementFilter, setMovementFilter] =
    useState("all");

  const [selectedRecord, setSelectedRecord] =
    useState(null);

  useEffect(() => {
    setLoading(true);
    setError("");

    const historyRef = collection(
      db,
      "stockHistory"
    );

    const historyQuery = query(
      historyRef,
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        const data =
          snapshot.docs.map(
            (historyDoc) => {
              const item =
                historyDoc.data();

              const quantity =
                getNumber(
                  item.quantity
                );

              const unitCost =
                getNumber(
                  item.unitCost
                );

              return {
                id: historyDoc.id,
                ...item,

                itemName:
                  item.itemName ||
                  item.name ||
                  "Unknown Item",

                movementType:
                  item.movementType ||
                  "purchase",

                quantity,

                unitCost,

                totalCost:
                  getNumber(
                    item.totalCost
                  ) ||
                  quantity *
                  unitCost,
              };
            }
          );

        setHistory(data);
        setLoading(false);
      },
      (firebaseError) => {
        console.error(
          "Stock history error:",
          firebaseError
        );

        setError(
          firebaseError?.message ||
          "Unable to load stock history."
        );

        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredHistory =
    useMemo(() => {
      const searchText =
        search.trim().toLowerCase();

      return history.filter(
        (item) => {
          const matchesSearch =
            !searchText ||
            item.itemName
              .toLowerCase()
              .includes(searchText) ||
            String(
              item.supplier || ""
            )
              .toLowerCase()
              .includes(
                searchText
              ) ||
            String(
              item.note || ""
            )
              .toLowerCase()
              .includes(
                searchText
              );

          const matchesMovement =
            movementFilter ===
            "all" ||
            item.movementType ===
            movementFilter;

          return (
            matchesSearch &&
            matchesMovement
          );
        }
      );
    }, [
      history,
      search,
      movementFilter,
    ]);

  const stats = useMemo(() => {
    const purchases =
      history.filter(
        (item) =>
          item.movementType ===
          "purchase"
      );

    const totalQuantity =
      purchases.reduce(
        (sum, item) =>
          sum + item.quantity,
        0
      );

    const totalCost =
      purchases.reduce(
        (sum, item) =>
          sum + item.totalCost,
        0
      );

    return {
      records: history.length,
      purchases: purchases.length,
      totalQuantity,
      totalCost,
    };
  }, [history]);

  const exportCSV = () => {
    if (!filteredHistory.length) {
      return;
    }

    const headers = [
      "Item",
      "Movement",
      "Quantity",
      "Unit Cost",
      "Total Cost",
      "Supplier",
      "Date",
      "Note",
    ];

    const rows =
      filteredHistory.map(
        (item) => [
          item.itemName,
          item.movementType,
          item.quantity,
          item.unitCost,
          item.totalCost,
          item.supplier || "",
          formatDate(
            item.date ||
            item.createdAt
          ),
          item.note || "",
        ]
      );

    const escapeCSV = (value) => {
      const text = String(
        value ?? ""
      );

      return `"${text.replace(
        /"/g,
        '""'
      )}"`;
    };

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) =>
        row
          .map(escapeCSV)
          .join(",")
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

    link.download = `stock-history-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="stock-history-page">
      <div className="inventory-page-head">
        <div>
          <div className="inventory-eyebrow">
            MANAGEMENT
          </div>

          <h1>Stock History</h1>

          <p>
            Review stock purchases and
            inventory movements.
          </p>
        </div>

        <button
          className="inventory-secondary-btn"
          onClick={exportCSV}
          disabled={
            !filteredHistory.length
          }
        >
          <Download size={16} />
          Export
        </button>
      </div>

      {error && (
        <div className="inventory-error">
          <X size={18} />
          <span>{error}</span>

          <button
            onClick={() =>
              setError("")
            }
          >
            <X size={16} />
          </button>
        </div>
      )}

      <section className="inventory-stats">
        <div className="inventory-stat-card">
          <div className="inventory-stat-icon blue">
            <PackagePlus size={20} />
          </div>

          <div>
            <span>Total Records</span>

            <strong>
              {stats.records}
            </strong>
          </div>
        </div>

        <div className="inventory-stat-card">
          <div className="inventory-stat-icon green">
            <ShoppingCart size={20} />
          </div>

          <div>
            <span>Purchases</span>

            <strong>
              {stats.purchases}
            </strong>
          </div>
        </div>

        <div className="inventory-stat-card">
          <div className="inventory-stat-icon purple">
            <PackagePlus size={20} />
          </div>

          <div>
            <span>Quantity Added</span>

            <strong>
              {stats.totalQuantity}
            </strong>
          </div>
        </div>

        <div className="inventory-stat-card">
          <div className="inventory-stat-icon orange">
            <Truck size={20} />
          </div>

          <div>
            <span>Purchase Cost</span>

            <strong>
              {formatCurrency(
                stats.totalCost
              )}
            </strong>
          </div>
        </div>
      </section>

      <section className="inventory-panel">
        <div className="inventory-toolbar">
          <div className="inventory-search">
            <Search size={17} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search stock history..."
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
              value={movementFilter}
              onChange={(e) =>
                setMovementFilter(
                  e.target.value
                )
              }
            >
              <option value="all">
                All Movements
              </option>

              <option value="purchase">
                Purchases
              </option>

              <option value="adjustment">
                Adjustments
              </option>

              <option value="sale">
                Sales
              </option>

              <option value="damage">
                Damaged
              </option>

              <option value="return">
                Returns
              </option>
            </select>

            <button
              className="inventory-refresh-btn"
              onClick={() =>
                setSearch(search)
              }
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="inventory-result-bar">
          <span>
            Showing{" "}
            <strong>
              {filteredHistory.length}
            </strong>{" "}
            records
          </span>
        </div>

        {loading ? (
          <div className="inventory-loading">
            <div className="inventory-spinner" />

            <span>
              Loading history...
            </span>
          </div>
        ) : filteredHistory.length ===
          0 ? (
          <div className="inventory-empty">
            <div className="inventory-empty-icon">
              <PackagePlus
                size={28}
              />
            </div>

            <h2>
              No stock history
            </h2>

            <p>
              Stock purchase and movement
              records will appear here.
            </p>
          </div>
        ) : (
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Total Cost</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>View</th>
                </tr>
              </thead>

              <tbody>
                {filteredHistory.map(
                  (item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="inventory-item-cell">
                          <div className="inventory-item-icon">
                            <PackagePlus
                              size={17}
                            />
                          </div>

                          <strong>
                            {item.itemName}
                          </strong>
                        </div>
                      </td>

                      <td>
                        <span className="movement-badge">
                          {item.movementType}
                        </span>
                      </td>

                      <td>
                        <strong>
                          {item.quantity}
                        </strong>
                      </td>

                      <td>
                        {formatCurrency(
                          item.unitCost
                        )}
                      </td>

                      <td>
                        <strong>
                          {formatCurrency(
                            item.totalCost
                          )}
                        </strong>
                      </td>

                      <td>
                        {item.supplier ||
                          "—"}
                      </td>

                      <td>
                        {formatDate(
                          item.date ||
                          item.createdAt
                        )}
                      </td>

                      <td>
                        <button
                          className="inventory-icon-action view"
                          onClick={() =>
                            setSelectedRecord(
                              item
                            )
                          }
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRecord && (
        <div
          className="inventory-modal-overlay"
          onMouseDown={(e) => {
            if (
              e.target ===
              e.currentTarget
            ) {
              setSelectedRecord(
                null
              );
            }
          }}
        >
          <div className="inventory-modal">
            <div className="inventory-modal-head">
              <div>
                <span>
                  Stock Movement
                </span>

                <h2>
                  {
                    selectedRecord.itemName
                  }
                </h2>
              </div>

              <button
                onClick={() =>
                  setSelectedRecord(
                    null
                  )
                }
              >
                <X size={19} />
              </button>
            </div>

            <div className="inventory-detail-grid">
              <div>
                <span>Movement</span>

                <strong>
                  {
                    selectedRecord.movementType
                  }
                </strong>
              </div>

              <div>
                <span>Quantity</span>

                <strong>
                  {
                    selectedRecord.quantity
                  }
                </strong>
              </div>

              <div>
                <span>Unit Cost</span>

                <strong>
                  {formatCurrency(
                    selectedRecord.unitCost
                  )}
                </strong>
              </div>

              <div>
                <span>Total Cost</span>

                <strong>
                  {formatCurrency(
                    selectedRecord.totalCost
                  )}
                </strong>
              </div>

              <div>
                <span>Supplier</span>

                <strong>
                  {
                    selectedRecord.supplier ||
                    "—"
                  }
                </strong>
              </div>

              <div>
                <span>Date</span>

                <strong>
                  {formatDate(
                    selectedRecord.date ||
                    selectedRecord.createdAt
                  )}
                </strong>
              </div>
            </div>

            {selectedRecord.note && (
              <div className="inventory-description">
                <span>Note</span>

                <p>
                  {selectedRecord.note}
                </p>
              </div>
            )}

            <div className="inventory-modal-footer">
              <button
                className="inventory-secondary-btn"
                onClick={() =>
                  setSelectedRecord(
                    null
                  )
                }
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}