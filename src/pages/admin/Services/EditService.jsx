import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Save,
  Package,
  IndianRupee,
  Tag,
  Layers3,
  FileText,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import {
  addDoc,
  collection,
  serverTimestamp,
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

const units = [
  "piece",
  "page",
  "copy",
  "set",
  "sheet",
  "photo",
  "service",
  "hour",
  "kg",
  "meter",
];

const initialForm = {
  name: "",
  category: "Xerox",
  unit: "piece",
  sellingPrice: "",
  costPrice: "",
  description: "",
  active: true,
};

export default function AddService() {
  const { user, profile } = useAuth();

  const [form, setForm] = useState(
    initialForm
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!isAdmin) {
      setError(
        "Only administrators can create services."
      );
    }
  }, [isAdmin]);

  const sellingPrice =
    Number(form.sellingPrice) || 0;

  const costPrice =
    Number(form.costPrice) || 0;

  const profit =
    sellingPrice - costPrice;

  const margin =
    sellingPrice > 0
      ? (profit / sellingPrice) * 100
      : 0;

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
        "Only administrators can create services."
      );
      return;
    }

    const name = form.name.trim();

    if (!name) {
      setError("Please enter a service name.");
      return;
    }

    if (
      form.sellingPrice === "" ||
      sellingPrice <= 0
    ) {
      setError(
        "Selling price must be greater than 0."
      );
      return;
    }

    if (
      form.costPrice !== "" &&
      costPrice < 0
    ) {
      setError(
        "Cost price cannot be negative."
      );
      return;
    }

    if (!form.category) {
      setError("Please select a category.");
      return;
    }

    if (!form.unit) {
      setError("Please select a unit.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await addDoc(collection(db, "services"), {
        name,
        serviceName: name,

        category: form.category,
        unit: form.unit,

        sellingPrice,
        costPrice,

        description:
          form.description.trim(),

        active: Boolean(form.active),
        status: form.active
          ? "active"
          : "inactive",

        createdAt: serverTimestamp(),
        createdBy: user?.uid || null,

        createdByName:
          profile?.name ||
          profile?.displayName ||
          user?.displayName ||
          user?.email ||
          "Admin",
      });

      setSuccess(
        "Service created successfully."
      );

      setForm(initialForm);

      setTimeout(() => {
        window.location.hash =
          "#/admin/services";
      }, 700);
    } catch (saveError) {
      console.error(
        "Add service error:",
        saveError
      );

      setError(
        saveError?.message ||
          "Unable to create service."
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="service-form-page">
        <div className="service-access-denied">
          <div>
            <AlertCircle size={28} />
          </div>

          <h2>Access Restricted</h2>

          <p>
            Only administrators can create
            services.
          </p>

          <a
            href="#/admin/services"
            className="services-primary-btn"
          >
            <ArrowLeft size={16} />
            Back to Services
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="service-form-page">
      <div className="service-form-head">
        <div>
          <a
            href="#/admin/services"
            className="back-link"
          >
            <ArrowLeft size={16} />
            Back to Services
          </a>

          <div className="services-eyebrow">
            MANAGEMENT
          </div>

          <h1>Add Service</h1>

          <p>
            Create a new shop service and set
            its selling and cost price.
          </p>
        </div>
      </div>

      {error && (
        <div className="service-form-alert error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="service-form-alert success">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      <form
        className="service-form-layout"
        onSubmit={handleSubmit}
      >
        <div className="service-form-card">
          <div className="service-form-card-head">
            <div className="form-section-icon blue">
              <Package size={19} />
            </div>

            <div>
              <h2>Service Information</h2>
              <p>
                Basic details about the service.
              </p>
            </div>
          </div>

          <div className="service-form-grid">
            <div className="form-field full">
              <label>
                Service Name
                <span>*</span>
              </label>

              <div className="input-with-icon">
                <Tag size={17} />

                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Example: B&W Xerox"
                  autoFocus
                />
              </div>
            </div>

            <div className="form-field">
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

            <div className="form-field">
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

        <div className="service-form-card">
          <div className="service-form-card-head">
            <div className="form-section-icon green">
              <IndianRupee size={19} />
            </div>

            <div>
              <h2>Pricing</h2>
              <p>
                Set your selling and cost
                prices.
              </p>
            </div>
          </div>

          <div className="service-form-grid">
            <div className="form-field">
              <label>
                Selling Price
                <span>*</span>
              </label>

              <div className="input-with-icon">
                <IndianRupee size={17} />

                <input
                  type="number"
                  name="sellingPrice"
                  value={
                    form.sellingPrice
                  }
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="form-field">
              <label>
                Cost Price
              </label>

              <div className="input-with-icon">
                <IndianRupee size={17} />

                <input
                  type="number"
                  name="costPrice"
                  value={form.costPrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          <div className="pricing-preview">
            <div>
              <span>Estimated Profit</span>

              <strong
                className={
                  profit >= 0
                    ? "profit-preview-positive"
                    : "profit-preview-negative"
                }
              >
                {formatCurrency(profit)}
              </strong>
            </div>

            <div>
              <span>Margin</span>

              <strong>
                {margin.toFixed(1)}%
              </strong>
            </div>
          </div>
        </div>

        <div className="service-form-card">
          <div className="service-form-card-head">
            <div className="form-section-icon purple">
              <FileText size={19} />
            </div>

            <div>
              <h2>Additional Information</h2>
              <p>
                Add an optional description.
              </p>
            </div>
          </div>

          <div className="form-field">
            <label>Description</label>

            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Example: Black and white document printing per page."
              rows={5}
            />
          </div>

          <label className="service-status-toggle">
            <input
              type="checkbox"
              name="active"
              checked={form.active}
              onChange={handleChange}
            />

            <span className="toggle-ui" />

            <span>
              <strong>
                Active service
              </strong>

              <small>
                Allow this service to be
                available for transactions.
              </small>
            </span>
          </label>
        </div>

        <div className="service-form-actions">
          <a
            href="#/admin/services"
            className="services-secondary-btn"
          >
            Cancel
          </a>

          <button
            type="submit"
            className="services-primary-btn"
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="button-spinner" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Create Service
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}