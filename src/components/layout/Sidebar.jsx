import { NavLink } from "react-router-dom";
import logo from "../../assets/logo.png"

import {
    LayoutDashboard,
    ReceiptText,
    BarChart3,
    WalletCards,
    Package,
    Users,
    Banknote,
    ArrowLeftRight,
    FileClock,
    Settings,
    LogOut,
    X,
    ChevronRight,
    Sun,
    Moon,
} from "lucide-react";
import "./theme.css";
import "./Sidebar.css"
import { useAuth } from "../../context/AuthContext";

const admin = [
    ["Dashboard", "/admin", LayoutDashboard],
    ["Transactions", "/admin/transactions", ReceiptText],
    ["Accounts", "/admin/accounts/daily", BarChart3],
    ["Expenses", "/admin/expenses", WalletCards],
    ["Inventory", "/admin/inventory", Package],
    ["Cash Register", "/admin/cash", Banknote],
    ["Reports", "/admin/reports/sales", BarChart3],
    ["Audit Logs", "/admin/audit", FileClock],
    ["Settings", "/admin/settings", Settings],
];

const attendant = [
    ["Dashboard", "/attendant", LayoutDashboard],
    ["Cash Register", "/attendant/cash", Banknote],
    ["New Transaction", "/attendant/new-transaction", ReceiptText],
    ["EB - BIll", "/attendant/eb", ArrowLeftRight],
    ["Money Transfer", "/attendant/money-transfer", ArrowLeftRight],
    ["Withdrawal", "/attendant/withdrawal", ArrowLeftRight],
    ["My Transactions", "/attendant/transactions", ReceiptText],
    ["Customers", "/attendant/customers", Users],
];

export default function Sidebar({ open, onClose, theme = "light", onToggleTheme }) {
    const { profile, logout } = useAuth();

    const isAdmin = profile?.role === "admin";
    const items = isAdmin ? admin : attendant;

    const displayName = profile?.name || (isAdmin ? "Admin" : "Attendant");

    const roleName = profile?.role
        ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
        : isAdmin
            ? "Admin"
            : "Attendant";

    const avatarLetter = displayName.charAt(0).toUpperCase();
    const isDark = theme === "dark";

    return (
        <aside
            className={`sidebar ${open ? "open" : ""}`}
            aria-label="Main navigation"
        >
            {/* BRAND */}
            <div className="brand">
                <div className="brand-info">
                    <img src={logo} alt="logo" id="logo" />
                </div>

                <button
                    type="button"
                    className="mobile-close"
                    onClick={onClose}
                    aria-label="Close navigation"
                >
                    <X size={18} />
                </button>
            </div>

            {/* NAVIGATION */}
            <div className="side-label">
                <span>Workspace</span>
            </div>

            <nav className="sidebar-nav">
                {items.map(([label, path, Icon]) => (
                    <NavLink
                        key={path}
                        to={path}
                        onClick={onClose}
                        className={({ isActive }) =>
                            `nav-item ${isActive ? "active" : ""}`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <span className="nav-icon">
                                    <Icon size={17} />
                                </span>

                                <span className="nav-label">{label}</span>

                                <ChevronRight
                                    className="nav-arrow"
                                    size={14}
                                    strokeWidth={2}
                                />

                                {isActive && (
                                    <span className="nav-active-dot" aria-hidden="true" />
                                )}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* THEME / USER / LOGOUT */}
            <div className="side-bottom">
                <button
                    type="button"
                    className="theme-toggle"
                    onClick={onToggleTheme}
                    aria-pressed={isDark}
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                >
                    {isDark ? <Sun size={15} /> : <Moon size={15} />}
                    <span>{isDark ? "Light mode" : "Dark mode"}</span>
                </button>

                <div className="user-mini">
                    <div className="avatar" aria-hidden="true">
                        {avatarLetter}
                    </div>

                    <div className="user-details">
                        <b title={displayName}>{displayName}</b>
                        <span>{roleName}</span>
                    </div>

                    <div className="user-status" title="Online" />
                </div>

                <button
                    type="button"
                    className="logout-btn"
                    onClick={logout}
                >
                    <LogOut size={16} />
                    <span>Sign out</span>
                </button>
            </div>
        </aside>
    );
}
