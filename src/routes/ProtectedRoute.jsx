import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/common/Loader";

import "./router.css";

export default function ProtectedRoute() {
    const { user, loading } = useAuth();
    
    if (loading) {
        return (
            <div className="route-loading">
                <div className="route-loader" />

                <div className="protected-route-loading">
                    <Loader />
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}