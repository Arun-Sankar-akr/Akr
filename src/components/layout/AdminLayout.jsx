import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import useTheme from "./useTheme";
import "./theme.css";
import "./AdminLayout.css";

export default function AdminLayout() {
    const [open, setOpen] = useState(false);
    const { theme, toggleTheme } = useTheme();

    return (
        <div className="app-shell">
            <Sidebar
                open={open}
                onClose={() => setOpen(false)}
                theme={theme}
                onToggleTheme={toggleTheme}
            />
            <main className="main">
                <Navbar onMenu={() => setOpen(true)} />
                <section className="page">
                    <Outlet />
                </section>
            </main>
        </div>
    );
}
