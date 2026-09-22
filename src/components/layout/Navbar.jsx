import { Bell, Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import "./Navbar.css"

export default function Navbar({ onMenu }) {
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="smc-navbar">
            <div className="smc-navbar__left">
                <button
                    className="smc-navbar__menu-btn"
                    onClick={onMenu}
                    aria-label="Open menu"
                    type="button"
                >
                    <Menu size={18} strokeWidth={1.75} />
                </button>

                <div className="smc-navbar__title">
                    <span className="smc-navbar__eyebrow">Business workspace</span>
                    <b className="smc-navbar__heading">Shop Management Console</b>
                </div>
            </div>

            <div className="smc-navbar__right">
                <a className="smc-navbar__link" href="/">Home</a>

                <div className="smc-navbar__icons">
                    <button
                        className="smc-navbar__icon-btn"
                        onClick={toggleTheme}
                        aria-label="Toggle theme"
                        type="button"
                    >
                        {theme === "light" ? (
                            <Moon size={16} strokeWidth={1.75} />
                        ) : (
                            <Sun size={16} strokeWidth={1.75} />
                        )}
                    </button>

                    <button
                        className="smc-navbar__icon-btn"
                        aria-label="Notifications"
                        type="button"
                    >
                        <Bell size={16} strokeWidth={1.75} />
                    </button>
                </div>

                <div className="smc-navbar__status">
                    <i className="smc-navbar__status-dot" />
                    <span>Live</span>
                </div>
            </div>
        </header>
    );
}