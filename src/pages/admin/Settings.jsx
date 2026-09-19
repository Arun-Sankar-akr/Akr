import React, { useEffect, useState } from "react";
import {
  Save,
  RefreshCw,
  Store,
  Phone,
  Mail,
  MapPin,
  ReceiptText,
  User,
  ShieldCheck,
  LockKeyhole,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";

import { db } from "../../services/firebase";

import "./Settings.css";

const DEFAULT_SETTINGS = {
  shopName: "My Shop",
  phone: "",
  email: "",
  address: "",
  currency: "INR",
  receiptFooter: "Thank you for your business!",
  lowStockThreshold: 5,
  autoRefreshInterval: 30,
};

export default function Settings() {
  const auth = getAuth();

  const [user, setUser] = useState(null);

  const [settings, setSettings] =
    useState(DEFAULT_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [currentPassword, setCurrentPassword] =
    useState("");
  const [newPassword, setNewPassword] =
    useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showCurrentPassword, setShowCurrentPassword] =
    useState(false);

  const [showNewPassword, setShowNewPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [changingPassword, setChangingPassword] =
    useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(currentUser);

        if (!currentUser) {
          setLoading(false);
          return;
        }

        await loadSettings();
      }
    );

    return unsubscribe;
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError("");

      const settingsRef = doc(
        db,
        "appSettings",
        "general"
      );

      const snapshot = await getDoc(settingsRef);

      if (snapshot.exists()) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...snapshot.data(),
        });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (err) {
      console.error("Settings load error:", err);

      setError(
        err?.message ||
        "Unable to load application settings."
      );
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setSettings((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const saveSettings = async () => {
    if (!user) {
      setError("Please sign in first.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const settingsRef = doc(
        db,
        "appSettings",
        "general"
      );

      await setDoc(
        settingsRef,
        {
          ...settings,
          lowStockThreshold: Number(
            settings.lowStockThreshold
          ),
          autoRefreshInterval: Number(
            settings.autoRefreshInterval
          ),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          updatedByEmail: user.email || "",
        },
        { merge: true }
      );

      setMessage(
        "Settings saved successfully."
      );
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to save settings."
      );
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = async () => {
    const confirmed = window.confirm(
      "Reset application settings to the default values?"
    );

    if (!confirmed) return;

    try {
      setResetting(true);
      setError("");
      setMessage("");

      setSettings(DEFAULT_SETTINGS);

      if (user) {
        await setDoc(
          doc(db, "appSettings", "general"),
          {
            ...DEFAULT_SETTINGS,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
            updatedByEmail: user.email || "",
          },
          { merge: true }
        );
      }

      setMessage(
        "Settings have been reset to default."
      );
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
        "Unable to reset settings."
      );
    } finally {
      setResetting(false);
    }
  };

  const changePassword = async () => {
    setError("");
    setMessage("");

    if (!user?.email) {
      setError(
        "Your account does not have an email address."
      );
      return;
    }

    if (!currentPassword) {
      setError(
        "Enter your current password."
      );
      return;
    }

    if (!newPassword) {
      setError(
        "Enter a new password."
      );
      return;
    }

    if (newPassword.length < 6) {
      setError(
        "New password must contain at least 6 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(
        "New passwords do not match."
      );
      return;
    }

    if (currentPassword === newPassword) {
      setError(
        "New password must be different from the current password."
      );
      return;
    }

    try {
      setChangingPassword(true);

      const credential =
        EmailAuthProvider.credential(
          user.email,
          currentPassword
        );

      await reauthenticateWithCredential(
        user,
        credential
      );

      await updatePassword(
        user,
        newPassword
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setMessage(
        "Your password has been changed successfully."
      );
    } catch (err) {
      console.error(err);

      if (
        err?.code ===
        "auth/invalid-credential"
      ) {
        setError(
          "Current password is incorrect."
        );
      } else if (
        err?.code ===
        "auth/requires-recent-login"
      ) {
        setError(
          "Please sign in again and try changing your password."
        );
      } else {
        setError(
          err?.message ||
          "Unable to change password."
        );
      }
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        <div className="settings-loader" />
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-page-head">
        <div>
          <div className="settings-eyebrow">
            MANAGEMENT
          </div>

          <h1>Settings</h1>

          <p>
            Configure your shop, receipts and account
            preferences.
          </p>
        </div>

        <div className="settings-head-actions">
          <button
            className="settings-reset-btn"
            onClick={resetSettings}
            disabled={resetting}
          >
            <RotateCcw size={16} />
            Reset
          </button>

          <button
            className="settings-save-btn"
            onClick={saveSettings}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {message && (
        <div className="settings-message">
          <CheckCircle2 size={17} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="settings-error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="settings-layout">
        <main className="settings-main">
          {/* SHOP INFORMATION */}

          <section className="settings-card">
            <div className="settings-card-head">
              <div className="settings-section-icon blue">
                <Store size={19} />
              </div>

              <div>
                <h2>Shop Information</h2>
                <p>
                  Basic information displayed throughout
                  the application.
                </p>
              </div>
            </div>

            <div className="settings-form-grid">
              <div className="settings-field full">
                <label>Shop Name</label>

                <div className="settings-input">
                  <Store size={16} />

                  <input
                    value={settings.shopName}
                    onChange={(e) =>
                      updateField(
                        "shopName",
                        e.target.value
                      )
                    }
                    placeholder="Enter shop name"
                  />
                </div>
              </div>

              <div className="settings-field">
                <label>Phone Number</label>

                <div className="settings-input">
                  <Phone size={16} />

                  <input
                    value={settings.phone}
                    onChange={(e) =>
                      updateField(
                        "phone",
                        e.target.value
                      )
                    }
                    placeholder="+91 XXXXX XXXXX"
                  />
                </div>
              </div>

              <div className="settings-field">
                <label>Email Address</label>

                <div className="settings-input">
                  <Mail size={16} />

                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) =>
                      updateField(
                        "email",
                        e.target.value
                      )
                    }
                    placeholder="shop@example.com"
                  />
                </div>
              </div>

              <div className="settings-field full">
                <label>Shop Address</label>

                <div className="settings-input textarea-input">
                  <MapPin size={16} />

                  <textarea
                    value={settings.address}
                    onChange={(e) =>
                      updateField(
                        "address",
                        e.target.value
                      )
                    }
                    rows="3"
                    placeholder="Enter shop address"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* RECEIPT */}

          <section className="settings-card">
            <div className="settings-card-head">
              <div className="settings-section-icon purple">
                <ReceiptText size={19} />
              </div>

              <div>
                <h2>Receipt & Sales</h2>
                <p>
                  Configure currency and receipt preferences.
                </p>
              </div>
            </div>

            <div className="settings-form-grid">
              <div className="settings-field">
                <label>Currency</label>

                <div className="settings-input">
                  <span className="currency-symbol">
                    ₹
                  </span>

                  <select
                    value={settings.currency}
                    onChange={(e) =>
                      updateField(
                        "currency",
                        e.target.value
                      )
                    }
                  >
                    <option value="INR">
                      INR — Indian Rupee
                    </option>

                    <option value="USD">
                      USD — US Dollar
                    </option>

                    <option value="EUR">
                      EUR — Euro
                    </option>

                    <option value="GBP">
                      GBP — Pound Sterling
                    </option>
                  </select>
                </div>
              </div>

              <div className="settings-field">
                <label>Low Stock Threshold</label>

                <div className="settings-input">
                  <input
                    type="number"
                    min="0"
                    value={
                      settings.lowStockThreshold
                    }
                    onChange={(e) =>
                      updateField(
                        "lowStockThreshold",
                        e.target.value
                      )
                    }
                  />

                  <span className="input-suffix">
                    items
                  </span>
                </div>
              </div>

              <div className="settings-field full">
                <label>Receipt Footer</label>

                <div className="settings-input">
                  <ReceiptText size={16} />

                  <input
                    value={settings.receiptFooter}
                    onChange={(e) =>
                      updateField(
                        "receiptFooter",
                        e.target.value
                      )
                    }
                    placeholder="Thank you for your business!"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SYSTEM */}

          <section className="settings-card">
            <div className="settings-card-head">
              <div className="settings-section-icon orange">
                <RefreshCw size={19} />
              </div>

              <div>
                <h2>System Preferences</h2>
                <p>
                  Control dashboard refresh behaviour.
                </p>
              </div>
            </div>

            <div className="settings-form-grid">
              <div className="settings-field">
                <label>
                  Auto Refresh Interval
                </label>

                <div className="settings-input">
                  <RefreshCw size={16} />

                  <select
                    value={
                      settings.autoRefreshInterval
                    }
                    onChange={(e) =>
                      updateField(
                        "autoRefreshInterval",
                        e.target.value
                      )
                    }
                  >
                    <option value="15">
                      Every 15 seconds
                    </option>

                    <option value="30">
                      Every 30 seconds
                    </option>

                    <option value="60">
                      Every 1 minute
                    </option>

                    <option value="300">
                      Every 5 minutes
                    </option>

                    <option value="0">
                      Disabled
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* PASSWORD */}

          <section className="settings-card">
            <div className="settings-card-head">
              <div className="settings-section-icon red">
                <LockKeyhole size={19} />
              </div>

              <div>
                <h2>Change Password</h2>
                <p>
                  Update the password for your Firebase
                  account.
                </p>
              </div>
            </div>

            <div className="settings-password-box">
              <div className="settings-field">
                <label>Current Password</label>

                <div className="settings-input password-input">
                  <LockKeyhole size={16} />

                  <input
                    type={
                      showCurrentPassword
                        ? "text"
                        : "password"
                    }
                    value={currentPassword}
                    onChange={(e) =>
                      setCurrentPassword(
                        e.target.value
                      )
                    }
                    placeholder="Current password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowCurrentPassword(
                        (value) => !value
                      )
                    }
                  >
                    {showCurrentPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="settings-field">
                <label>New Password</label>

                <div className="settings-input password-input">
                  <LockKeyhole size={16} />

                  <input
                    type={
                      showNewPassword
                        ? "text"
                        : "password"
                    }
                    value={newPassword}
                    onChange={(e) =>
                      setNewPassword(
                        e.target.value
                      )
                    }
                    placeholder="Minimum 6 characters"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowNewPassword(
                        (value) => !value
                      )
                    }
                  >
                    {showNewPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className="settings-field">
                <label>Confirm New Password</label>

                <div className="settings-input password-input">
                  <LockKeyhole size={16} />

                  <input
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(
                        e.target.value
                      )
                    }
                    placeholder="Repeat new password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        (value) => !value
                      )
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>
                </div>
              </div>

              <button
                className="password-change-btn"
                onClick={changePassword}
                disabled={changingPassword}
              >
                <LockKeyhole size={16} />

                {changingPassword
                  ? "Changing..."
                  : "Change Password"}
              </button>
            </div>
          </section>
        </main>

        {/* PROFILE SIDEBAR */}

        <aside className="settings-side">
          <section className="settings-profile-card">
            <div className="settings-profile-cover" />

            <div className="settings-profile-content">
              <div className="settings-profile-avatar">
                {user?.email
                  ?.charAt(0)
                  ?.toUpperCase() || "U"}
              </div>

              <h2>
                {user?.displayName ||
                  "Account User"}
              </h2>

              <p>{user?.email || "No email"}</p>

              <span className="settings-role">
                <ShieldCheck size={13} />
                Authenticated User
              </span>
            </div>

            <div className="settings-profile-info">
              <div>
                <User size={15} />
                <span>Account</span>
                <strong>Active</strong>
              </div>

              <div>
                <Mail size={15} />
                <span>Email</span>
                <strong>
                  {user?.emailVerified
                    ? "Verified"
                    : "Not verified"}
                </strong>
              </div>

              <div>
                <ShieldCheck size={15} />
                <span>Security</span>
                <strong>Firebase Auth</strong>
              </div>
            </div>
          </section>

          <section className="settings-tip-card">
            <div className="settings-tip-icon">
              <ShieldCheck size={19} />
            </div>

            <div>
              <h3>Security</h3>

              <p>
                Keep your account password private and
                never share your Firebase credentials with
                other users.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}