import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Save,
  Package,
  IndianRupee,
  Layers3,
  Truck,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
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

const units = [
  "piece",
  "pack",
  "box",
  "ream",
  "sheet",
  "page",
  "kg",
  "liter",
  "meter",
  "set",
];

const initialForm = {
  name: "",
  category: "Paper",
  unit: "piece",
  quantity: "",
  unitCost: "",
  reorderLevel: "5",
  supplier: "",
  description: "",
  active: true,
};

function getParams() {
  const params = new URLSearchParams(
    window.location.search
  );

  return {
    id: params.get("id"),
    mode: params.get("mode"),
  };
}

export default function AddStock() {
  const { user, profile } = useAuth();

  const { id, mode } = getParams();

  const isEdit =
    Boolean(id) && mode === "edit";

  const isAdmin = profile?.role === "admin";

  const [form, setForm] = useState(
    initialForm
  );

  const [loading, setLoading] =
    useState(isEdit);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isEdit || !isAdmin) {
      setLoading(false);
      return;
    }

    const loadItem = async () => {
      try {
        const itemRef = doc(
          db,
          "inventory",
          id
        );

        const snapshot =
          await getDoc(itemRef);

        if (!snapshot.exists()) {
          setError(
            "Inventory item was not found."
          );

          setLoading(false);
          return;
        }

        const data = snapshot.data();

        setForm({
          name:
            data.name ||
            data.itemName ||
            "",
          category:
            data.category ||
            "Other",
          unit:
            data.unit ||
            "piece",
          quantity:
            data.quantity ??
            data.currentStock ??
            data.stock ??
            "",
          unitCost:
            data.unitCost ??
            data.costPrice ??
            data.purchasePrice ??
            "",
          reorderLevel:
            data.reorderLevel ??
            data.lowStockLevel ??
            5,
          supplier:
            data.supplier || "",
          description:
            data.description || "",
          active:
            data.active !== false &&
            data.status !== "inactive",
        });

        setLoading(false);
      } catch (loadError) {
        console.error(
          "Load inventory error:",
          loadError
        );

        setError(
          loadError?.message ||
          "Unable to load inventory item."
        );

        setLoading(false);
      }
    };

    loadItem();
  }, [id, isEdit, isAdmin]);

  const quantity =
    Number(form.quantity) || 0;

  const unitCost =
    Number(form.unitCost) || 0;

  const stockValue =
    quantity * unitCost;

  const handleChange = (e) => {
    const { name, value, type, checked } =
      e.target;

    setForm((previous) => ({
      ...previous,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));

    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isAdmin) {
      setError(
        "Only administrators can manage inventory."
      );
      return;
    }

    const name = form.name.trim();

    if (!name) {
      setError(
        "Please enter an item name."
      );
      return;
    }

    if (
      form.quantity === "" ||
      quantity < 0
    ) {
      setError(
        "Quantity cannot be negative."
      );
      return;
    }

    if (
      form.unitCost === "" ||
      unitCost < 0
    ) {
      setError(
        "Unit cost cannot be negative."
      );
      return;
    }

    const reorderLevel =
      Number(form.reorderLevel) || 0;

    if (reorderLevel < 0) {
      setError(
        "Reorder level cannot be negative."
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (isEdit) {
        const itemRef = doc(
          db,
          "inventory",
          id
        );

        await updateDoc(itemRef, {
          name,
          itemName: name,

          category: form.category,
          unit: form.unit,

          quantity,
          currentStock: quantity,

          unitCost,

          reorderLevel,

          supplier:
            form.supplier.trim(),

          description:
            form.description.trim(),

          active: Boolean(form.active),

          status: form.active
            ? "active"
            : "inactive",

          updatedAt:
            serverTimestamp(),

          updatedBy:
            user?.uid || null,

          updatedByName:
            profile?.name ||
            profile?.displayName ||
            user?.displayName ||
            user?.email ||
            "Admin",
        });

        setSuccess(
          "Inventory updated successfully."
        );
      } else {
        const inventoryRef =
          await addDoc(
            collection(
              db,
              "inventory"
            ),
            {
              name,
              itemName: name,

              category: form.category,
              unit: form.unit,

              quantity,
              currentStock: quantity,

              unitCost,

              reorderLevel,

              supplier:
                form.supplier.trim(),

              description:
                form.description.trim(),

              active: Boolean(
                form.active
              ),

              status: form.active
                ? "active"
                : "inactive",

              createdAt:
                serverTimestamp(),

              createdBy:
                user?.uid || null,

              createdByName:
                profile?.name ||
                profile?.displayName ||
                user?.displayName ||
                user?.email ||
                "Admin",
            }
          );

        /*
         * Record the initial stock
         * movement separately.
         */
        if (quantity > 0) {
          await addDoc(
            collection(
              db,
              "stockHistory"
            ),
            {
              inventoryId:
                inventoryRef.id,

              itemName: name,

              movementType:
                "purchase",

              quantity,

              unitCost,

              totalCost:
                quantity * unitCost,

              supplier:
                form.supplier.trim(),

              date:
                new Date()
                  .toISOString()
                  .slice(0, 10),

              createdAt:
                serverTimestamp(),

              createdBy:
                user?.uid || null,

              createdByName:
                profile?.name ||
                profile?.displayName ||
                user?.displayName ||
                user?.email ||
                "Admin",

              note:
                "Initial stock",
            }
          );
        }

        setSuccess(
          "Stock added successfully."
        );

        setForm(initialForm);
      }

      setTimeout(() => {
        window.location.hash =
          "#/admin/inventory";
      }, 700);
    } catch (saveError) {
      console.error(
        "Save inventory error:",
        saveError
      );

      setError(
        saveError?.message ||
        "Unable to save inventory."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="inventory-form-page">
        <div className="inventory-access-denied">
          <div>
            <AlertCircle size={28} />
          </div>

          <h2>Access Restricted</h2>

          <p>
            Only administrators can manage
            inventory.
          </p>

          <a
            href="#/admin/inventory"
            className="inventory-primary-btn"
          >
            <ArrowLeft size={16} />
            Back to Inventory
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="inventory-form-page">
        <div className="inventory-loading-page">
          <div className="inventory-spinner" />

          <span>
            Loading inventory...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-form-page">
      <div className="inventory-form-head">
        <div>
          <a
            href="#/admin/inventory"
            className="inventory-back-link"
          >
            <ArrowLeft size={16} />
            Back to Inventory
          </a>

          <div className="inventory-eyebrow">
            MANAGEMENT
          </div>

          <h1>
            {isEdit
              ? "Edit Inventory"
              : "Add Stock"}
          </h1>

          <p>
            {isEdit
              ? "Update inventory item information and current stock."
              : "Add purchased stock and update your inventory."}
          </p>
        </div>
      </div>

      {error && (
        <div className="inventory-form-alert error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="inventory-form-alert success">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      <form
        className="inventory-form-layout"
        onSubmit={handleSubmit}
      >
        <div className="inventory-form-card">
          <div className="inventory-form-card-head">
            <div className="inventory-form-icon blue">
              <Package size={19} />
            </div>

            <div>
              <h2>Item Information</h2>

              <p>
                Enter the stock item details.
              </p>
            </div>
          </div>

          <div className="inventory-form-grid">
            <div className="inventory-form-field full">
              <label>
                Item Name
                <span>*</span>
              </label>

              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Example: A4 Paper"
                autoFocus
              />
            </div>

            <div className="inventory-form-field">
              <label>
                Category
                <span>*</span>
              </label>

              <select
                name="category"
                value={form.category}
                onChange={handleChange}
              >
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
            </div>

            <div className="inventory-form-field">
              <label>
                Unit
                <span>*</span>
              </label>

              <select
                name="unit"
                value={form.unit}
                onChange={handleChange}
              >
                {units.map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="inventory-form-card">
          <div className="inventory-form-card-head">
            <div className="inventory-form-icon green">
              <Layers3 size={19} />
            </div>

            <div>
              <h2>Stock & Pricing</h2>

              <p>
                Set the quantity and purchase
                cost.
              </p>
            </div>
          </div>

          <div className="inventory-form-grid">
            <div className="inventory-form-field">
              <label>
                Quantity
                <span>*</span>
              </label>

              <input
                type="number"
                name="quantity"
                value={form.quantity}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="0"
              />
            </div>

            <div className="inventory-form-field">
              <label>
                Unit Cost
                <span>*</span>
              </label>

              <div className="inventory-input-money">
                <IndianRupee size={16} />

                <input
                  type="number"
                  name="unitCost"
                  value={form.unitCost}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="inventory-form-field">
              <label>
                Reorder Level
              </label>

              <input
                type="number"
                name="reorderLevel"
                value={
                  form.reorderLevel
                }
                onChange={handleChange}
                min="0"
                step="1"
                placeholder="5"
              />
            </div>

            <div className="inventory-form-field">
              <label>
                Current Stock Value
              </label>

              <div className="inventory-value-preview">
                {formatCurrency(
                  stockValue
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="inventory-form-card">
          <div className="inventory-form-card-head">
            <div className="inventory-form-icon orange">
              <Truck size={19} />
            </div>

            <div>
              <h2>Supplier</h2>

              <p>
                Optional supplier information.
              </p>
            </div>
          </div>

          <div className="inventory-form-field">
            <label>Supplier Name</label>

            <input
              name="supplier"
              value={form.supplier}
              onChange={handleChange}
              placeholder="Example: ABC Stationery"
            />
          </div>
        </div>

        <div className="inventory-form-card">
          <div className="inventory-form-card-head">
            <div className="inventory-form-icon purple">
              <FileText size={19} />
            </div>

            <div>
              <h2>Additional Information</h2>

              <p>
                Add notes and availability.
              </p>
            </div>
          </div>

          <div className="inventory-form-field">
            <label>Description</label>

            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={5}
              placeholder="Add notes about this stock item..."
            />
          </div>

          <label className="inventory-status-toggle">
            <input
              type="checkbox"
              name="active"
              checked={form.active}
              onChange={handleChange}
            />

            <span className="inventory-toggle-ui" />

            <span>
              <strong>
                Active inventory item
              </strong>

              <small>
                Keep this item available
                for inventory management.
              </small>
            </span>
          </label>
        </div>

        <div className="inventory-form-actions">
          <a
            href="#/admin/inventory"
            className="inventory-secondary-btn"
          >
            Cancel
          </a>

          <button
            type="submit"
            className="inventory-primary-btn"
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="inventory-button-spinner" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />

                {isEdit
                  ? "Save Changes"
                  : "Add Stock"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}