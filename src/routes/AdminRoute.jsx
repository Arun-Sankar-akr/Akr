import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/common/Loader";

import "./router.css"

export default function AdminRoute() {
    const { user, role, loading } = useAuth();

    if (loading) {
        return (
            <div className="route-loading">
                <div className="route-loader" />
                <div className="protected-route-loading">
                    <p><Loader /></p>
                </div>

            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (role !== "admin") {
        return <Navigate to="/attendant/dashboard" replace />;
    }

    return <Outlet />;
}