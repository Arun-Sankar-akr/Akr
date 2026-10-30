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
    Plus,
    FilePlus2,
    History,
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

// Mobile tabs are icon-only, so give each one its own icon
const mobileIcons = {
    "/attendant/new-transaction": FilePlus2,
    "/attendant/transactions": History,
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
        Icon: mobileIcons[path] || itemByPath[path][2],
    }));

    const primaryPaths = tabs.map((tab) => tab.path);
    const moreItems = items.filter(([, path]) => !primaryPaths.includes(path));

    const isActivePath = (path) =>
        path === "/admin" || path === "/attendant"
            ? pathname === path || pathname === `${path}/`
            : pathname === path || pathname.startsWith(`${path}/`);

    const foundIndex = tabs.findIndex((tab) => isActivePath(tab.path));
    const moreActive = moreItems.some(([, path]) => isActivePath(path));

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

            {/* MOBILE DOCK (glass pill + round "+" button) */}
            <div
                className={`m-scrim${open ? " show" : ""}`}
                onClick={onClose}
                aria-hidden="true"
            />

            <div className={`m-dock${open ? " is-open" : ""}`}>
                <nav
                    className="m-nav"
                    aria-label="Main navigation"
                    style={{ "--mn": tabs.length, "--mi": Math.max(foundIndex, 0) }}
                >
                    <span
                        className={`m-glider${foundIndex === -1 ? " hidden" : ""}`}
                        aria-hidden="true"
                    />

                    {tabs.map(({ path, label, Icon }, index) => (
                        <NavLink
                            key={path}
                            to={path}
                            end={path === "/admin" || path === "/attendant"}
                            onClick={onClose}
                            title={label}
                            aria-label={label}
                            className={`m-nav-item${index === foundIndex ? " active" : ""}`}
                        >
                            <Icon size={22} strokeWidth={1.8} />
                        </NavLink>
                    ))}
                </nav>

                <button
                    type="button"
                    className={`m-fab${moreActive && !open ? " active" : ""}`}
                    onClick={open ? onClose : onOpen}
                    aria-expanded={open}
                    aria-label={open ? "Close menu" : "Open menu"}
                >
                    <Plus size={24} strokeWidth={1.8} />
                </button>

                {/* MORE PANEL - opens in place of the pill */}
                <div
                    className={`m-sheet${open ? " open" : ""}`}
                    role="dialog"
                    aria-label="More menu"
                    aria-hidden={!open}
                >
                    <div className="m-sheet-grid">
                        {moreItems.map(([label, path, Icon], index) => (
                            <NavLink
                                key={path}
                                to={path}
                                onClick={onClose}
                                style={{ "--i": index }}
                                className={({ isActive }) =>
                                    `m-tile${isActive ? " active" : ""}`
                                }
                            >
                                <span className="m-tile-icon">
                                    <Icon size={22} strokeWidth={1.8} />
                                </span>
                                <span className="m-tile-label">{label}</span>
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

                        <button
                            type="button"
                            className="m-signout"
                            onClick={logout}
                            aria-label="Sign out"
                            title="Sign out"
                        >
                            <LogOut size={17} />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}