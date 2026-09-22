import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/common/Loader";

import "./router.css"


export default function AttendantRoute() {
  const {
    user,
    profile,
    role,
    loading,
  } = useAuth();

  // console.log("========== ATTENDANT ROUTE ==========");
  // console.log("Firebase user:", user);
  // console.log("Firebase UID:", user?.uid);
  // console.log("Firebase email:", user?.email);
  // console.log("Firestore profile:", profile);
  // console.log("Role:", role);
  // console.log("Loading:", loading);

  // Wait until Firebase + Firestore profile is restored
  if (loading) {
    return (
      <div className="route-loading">
        <div className="route-loader" />
        <div className="protected-route-loading"><p><Loader /></p></div>
      </div>
    );
  }

  // No Firebase authentication
  if (!user) {
    console.log("ATTENDANT → No authenticated user → /login");

    return <Navigate to="/login" replace />;
  }

  // Firestore profile was not found
  if (!profile) {
    console.log(
      "ATTENDANT → No Firestore profile → /login"
    );

    return <Navigate to="/login" replace />;
  }

  // Only attendant can access this route
  if (role !== "attendant") {
    console.log(
      "ATTENDANT → Wrong role:",
      role,
      "→ /login"
    );

    return <Navigate to="/login" replace />;
  }
  

  // Optional account status check
  if (profile.active === false) {
    console.log(
      "ATTENDANT → Account disabled → /login"
    );

    return <Navigate to="/login" replace />;
  }

  console.log("ATTENDANT → ACCESS GRANTED");

  return <Outlet />;
}