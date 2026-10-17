import { NavLink, useLocation } from "react-router-dom";
import logo from "../../assets/logo.png";

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
    Menu,
} from "lucide-react";
import "./theme.css";
import "./Sidebar.css";
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
    ["Credit Manager", "/attendant/Credit", ReceiptText],
    ["New Transaction", "/attendant/new-transaction", ReceiptText],
    ["EB - Bill", "/attendant/eb", ArrowLeftRight],
    ["Money Transfer", "/attendant/money-transfer", ArrowLeftRight],
    ["Withdrawal", "/attendant/withdrawal", ArrowLeftRight],
    ["My Transactions", "/attendant/transactions", ReceiptText],
    ["Customers", "/attendant/customers", Users],
];

// Tabs shown in the mobile bottom bar (everything else goes in "More")
const mobilePrimary = {
    admin: [
        ["/admin", "Dashboard"],
        ["/admin/transactions", "Sales"],
        ["/admin/cash", "Cash"],
        ["/admin/inventory", "Stock"],
    ],
    attendant: [
        ["/attendant", "Dashboard"],
        ["/attendant/new-transaction", "New"],
        ["/attendant/cash", "Cash"],
        ["/attendant/transactions", "History"],
    ],
};

export default function Sidebar({ open, onClose, onOpen }) {
    const { profile, logout } = useAuth();
    const { pathname } = useLocation();

    const isAdmin = profile?.role === "admin";
    const items = isAdmin ? admin : attendant;

    const displayName = profile?.name || (isAdmin ? "Admin" : "Attendant");

    const roleName = profile?.role
        ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
        : isAdmin
            ? "Admin"
            : "Attendant";

    const avatarLetter = displayName.charAt(0).toUpperCase();

    // ----- mobile bottom bar -----
    const primaryDefs = isAdmin ? mobilePrimary.admin : mobilePrimary.attendant;
    const itemByPath = Object.fromEntries(items.map((row) => [row[1], row]));

    const tabs = primaryDefs.map(([path, short]) => ({
        path,
        label: short,
        Icon: itemByPath[path][2],
    }));

    const primaryPaths = tabs.map((tab) => tab.path);
    const moreItems = items.filter(([, path]) => !primaryPaths.includes(path));

    const isActivePath = (path) =>
        path === "/admin" || path === "/attendant"
            ? pathname === path || pathname === `${path}/`
            : pathname === path || pathname.startsWith(`${path}/`);

    const foundIndex = tabs.findIndex((tab) => isActivePath(tab.path));
    const moreIndex = tabs.length;
    const activeIndex = open || foundIndex === -1 ? moreIndex : foundIndex;

    return (
        <>
            {/* DESKTOP SIDEBAR */}
        <aside
            className={`sidebar${open ? " open" : ""}`}
            aria-label="Main navigation"
        >
            <div className="brand">
                <div className="brand-info">
                    <img src={logo} alt="logo" id="logo" />
                </div>

            </div>

            <div className="side-label">Workspace</div>

            <nav className="sidebar-nav">
                {items.map(([label, path, Icon]) => (
                    <NavLink
                        key={path}
                        to={path}
                        end={path === "/admin" || path === "/attendant"}
                        onClick={onClose}
                        className={({ isActive }) =>
                            `nav-item${isActive ? " active" : ""}`
                        }
                    >
                        <span className="nav-icon">
                            <Icon size={18} />
                        </span>
                        <span className="nav-label">{label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="side-bottom">
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

                <button type="button" className="logout-btn" onClick={logout}>
                    <LogOut size={16} />
                    <span>Sign out</span>
                </button>
            </div>
        </aside>

            {/* MOBILE BOTTOM BAR */}
            <nav
                className="m-nav"
                aria-label="Main navigation"
                style={{ "--mn": tabs.length + 1, "--mi": activeIndex }}
            >
                <div className="m-nav-bar" />

                {tabs.map(({ path, label, Icon }, index) => (
                    <NavLink
                        key={path}
                        to={path}
                        end={path === "/admin" || path === "/attendant"}
                        onClick={onClose}
                        className={`m-nav-item${index === activeIndex ? " active" : ""}`}
                    >
                        <span className="m-nav-icon">
                            <Icon size={20} />
                        </span>
                        <span className="m-nav-label">{label}</span>
                    </NavLink>
                ))}

                <button
                    type="button"
                    className={`m-nav-item${activeIndex === moreIndex ? " active" : ""}`}
                    onClick={open ? onClose : onOpen}
                    aria-expanded={open}
                >
                    <span className="m-nav-icon">
                        <Menu size={20} />
                    </span>
                    <span className="m-nav-label">More</span>
                </button>
            </nav>

            {/* MOBILE "MORE" SHEET */}
            <div
                className={`m-sheet${open ? " open" : ""}`}
                role="dialog"
                aria-label="More menu"
                aria-hidden={!open}
            >
                <div className="m-sheet-head">
                    <strong>Menu</strong>
                    <button
                        type="button"
                        className="mobile-close"
                        onClick={onClose}
                        aria-label="Close menu"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="m-sheet-grid">
                    {moreItems.map(([label, path, Icon]) => (
                        <NavLink
                            key={path}
                            to={path}
                            onClick={onClose}
                            className={({ isActive }) =>
                                `m-sheet-item${isActive ? " active" : ""}`
                            }
                        >
                            <span className="m-sheet-icon">
                                <Icon size={20} />
                            </span>
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </div>

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

                <button type="button" className="logout-btn" onClick={logout}>
                    <LogOut size={16} />
                    <span>Sign out</span>
                </button>
            </div>
        </>
    );
}