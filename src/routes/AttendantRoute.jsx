import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/common/Loader";
import SheetsSync from "../services/sheetsSync.js";

import "./router.css";

export default function AttendantRoute() {
  const { user, profile, role, loading } = useAuth();

  // Wait until Firebase + Firestore profile is restored
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

  // No Firebase authentication
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Firestore profile was not found
  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  // Only attendant can access this route
  if (role !== "attendant") {
    return <Navigate to="/login" replace />;
  }

  // Optional account status check
  if (profile.active === false) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <SheetsSync />
      <Outlet />
    </>
  );
}