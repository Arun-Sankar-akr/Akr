import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import useTheme from "./useTheme";
import "./theme.css";
import "./AdminLayout.css";
import "./AttendantUnfold.css";

export default function AdminLayout() {
    const [open, setOpen] = useState(false);
    const { theme, toggleTheme } = useTheme();
    const { pathname } = useLocation();
    const navigate = useNavigate();

    // Cash Register has its own bottom navigation, so the sidebar
    // and the top menu are removed on that page.
    const isCash = /\/cash\/?$/.test(pathname);
    const home = pathname.startsWith("/attendant") ? "/attendant" : "/admin";

    // Attendant pages use the soft pastel "unfold" look.
    const isAttendant = pathname.startsWith("/attendant");
    // The attendant home has its own greeting header, so the top
    // navbar is hidden there (set to false to bring it back).
    const hideNavbar = /^\/attendant\/?$/.test(pathname);

    // Close the mobile drawer after every navigation
    useEffect(() => {
        setOpen(false);
    }, [pathname]);

    if (isCash) {
        return (
            <div className={`app-shell cash-mode${isAttendant ? " attendant-mode" : ""}`}>
                <main className="main">
                

                    <section className="page">
                        <Outlet />
                    </section>
                </main>
            </div>
        );
    }

    return (
        <div className={`app-shell${isAttendant ? " attendant-mode" : ""}`}>
            <Sidebar
                open={open}
                onClose={() => setOpen(false)}
                onOpen={() => setOpen(true)}
                theme={theme}
                onToggleTheme={toggleTheme}
            />

            <div
                className={`sidebar-backdrop${open ? " show" : ""}`}
                onClick={() => setOpen(false)}
                aria-hidden="true"
            />

            <main className="main">
                {!hideNavbar && <Navbar onMenu={() => setOpen(true)} />}
                <section className="page">
                    <Outlet />
                </section>
            </main>
        </div>
    );
}