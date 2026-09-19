import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import "./AdminLayout.css"

export default function AdminLayout() {
    const [open, setOpen] = useState(false);
    return    <>
        <div className="app-shell">
            <Sidebar open={open} onClose={() => setOpen(false)} />
            <main className="main"><Navbar onMenu={() => setOpen(true)} />
                <section className="page">
                    <Outlet />
                </section>
            </main>
        </div>
    </>
}
