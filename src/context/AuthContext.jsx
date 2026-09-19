import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
} from "firebase/firestore";

import { auth, db } from "../services/firebase";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  /*
   * =========================================================
   * RESTORE AUTHENTICATION
   * =========================================================
   *
   * Firebase Authentication
   *          ↓
   * Firebase UID
   *          ↓
   * Firestore users/{uid}
   *          ↓
   * profile.role
   *
   */

  useEffect(() => {
    console.log("AUTH CONTEXT → Starting auth listener...");

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        console.log(
          "AUTH STATE CHANGED:",
          firebaseUser?.email || "No user"
        );

        try {
          // -------------------------------------------------
          // No Firebase user
          // -------------------------------------------------

          if (!firebaseUser) {
            console.log(
              "AUTH → No authenticated Firebase user"
            );

            setUser(null);
            setProfile(null);
            setRole(null);
            setLoading(false);

            return;
          }

          // -------------------------------------------------
          // Firebase user exists
          // -------------------------------------------------

          setUser(firebaseUser);

          console.log(
            "AUTH → Firebase user:",
            firebaseUser.email
          );

          console.log(
            "AUTH → UID:",
            firebaseUser.uid
          );

          // -------------------------------------------------
          // Get Firestore profile
          // -------------------------------------------------

          const userRef = doc(
            db,
            "users",
            firebaseUser.uid
          );

          console.log(
            "AUTH → Reading:",
            `users/${firebaseUser.uid}`
          );

          const snapshot = await getDoc(userRef);

          // -------------------------------------------------
          // Profile not found
          // -------------------------------------------------

          if (!snapshot.exists()) {
            console.warn(
              "AUTH → Firestore profile NOT FOUND"
            );

            setProfile(null);
            setRole(null);
            setLoading(false);

            return;
          }

          // -------------------------------------------------
          // Profile found
          // -------------------------------------------------

          const data = snapshot.data();

          console.log(
            "AUTH → Firestore profile:",
            data
          );

          console.log(
            "AUTH → Firestore role:",
            data.role
          );

          setProfile(data);
          setRole(data.role || null);

        } catch (error) {
          console.error(
            "AUTH → Failed to restore authentication"
          );

          console.error(
            "Error code:",
            error?.code
          );

          console.error(
            "Error message:",
            error?.message
          );

          setProfile(null);
          setRole(null);

        } finally {
          setLoading(false);
        }
      }
    );

    return () => {
      console.log(
        "AUTH CONTEXT → Removing auth listener"
      );

      unsubscribe();
    };
  }, []);

  /*
   * =========================================================
   * LOGIN
   * =========================================================
   */

  const login = async (email, password) => {
    const cleanEmail = email.trim();

    console.log("");
    console.log("=================================");
    console.log("LOGIN START");
    console.log("=================================");

    console.log(
      "Email:",
      cleanEmail
    );

    console.log(
      "Firebase project:",
      auth.app.options.projectId
    );

    console.log(
      "Auth domain:",
      auth.app.options.authDomain
    );

    try {
      // -----------------------------------------------------
      // 1. Firebase Authentication
      // -----------------------------------------------------

      const credential =
        await signInWithEmailAndPassword(
          auth,
          cleanEmail,
          password
        );

      const firebaseUser = credential.user;

      console.log(
        "LOGIN → Firebase authentication SUCCESS"
      );

      console.log(
        "LOGIN → UID:",
        firebaseUser.uid
      );

      console.log(
        "LOGIN → Email:",
        firebaseUser.email
      );

      // -----------------------------------------------------
      // 2. Firestore profile
      // -----------------------------------------------------

      const userRef = doc(
        db,
        "users",
        firebaseUser.uid
      );

      console.log(
        "LOGIN → Reading Firestore:",
        `users/${firebaseUser.uid}`
      );

      const snapshot = await getDoc(userRef);

      // -----------------------------------------------------
      // Profile doesn't exist
      // -----------------------------------------------------

      if (!snapshot.exists()) {
        console.error(
          "LOGIN → Firestore profile NOT FOUND"
        );

        await signOut(auth);

        throw new Error(
          "LOGIN_NO_PROFILE"
        );
      }

      // -----------------------------------------------------
      // Profile exists
      // -----------------------------------------------------

      const data = snapshot.data();

      console.log(
        "LOGIN → Firestore profile:",
        data
      );

      console.log(
        "LOGIN → Firestore role:",
        data.role
      );

      // -----------------------------------------------------
      // 3. Validate role
      // -----------------------------------------------------

      if (
        data.role !== "admin" &&
        data.role !== "attendant"
      ) {
        console.error(
          "LOGIN → Invalid role:",
          data.role
        );

        await signOut(auth);

        throw new Error(
          "LOGIN_INVALID_ROLE"
        );
      }

      // -----------------------------------------------------
      // 4. Check active account
      // -----------------------------------------------------

      if (data.active === false) {
        console.error(
          "LOGIN → Account disabled"
        );

        await signOut(auth);

        throw new Error(
          "LOGIN_ACCOUNT_DISABLED"
        );
      }

      // -----------------------------------------------------
      // 5. Update context immediately
      // -----------------------------------------------------

      setUser(firebaseUser);
      setProfile(data);
      setRole(data.role);

      console.log(
        "LOGIN → Context updated"
      );

      console.log(
        "LOGIN → ROLE:",
        data.role
      );

      console.log("");
      console.log("=================================");
      console.log("LOGIN SUCCESS");
      console.log("=================================");

      // -----------------------------------------------------
      // Return login result
      // -----------------------------------------------------

      return {
        user: firebaseUser,
        profile: data,
        role: data.role,
      };

    } catch (error) {
      console.error("");
      console.error(
        "================================="
      );
      console.error(
        "LOGIN FAILED"
      );
      console.error(
        "================================="
      );

      console.error(
        "Error code:",
        error?.code
      );

      console.error(
        "Error message:",
        error?.message
      );

      throw error;
    }
  };

  /*
   * =========================================================
   * LOGOUT
   * =========================================================
   */

  const logout = async () => {
    try {
      console.log(
        "AUTH → Logging out..."
      );

      await signOut(auth);

      setUser(null);
      setProfile(null);
      setRole(null);

      console.log(
        "AUTH → Logout successful"
      );

    } catch (error) {
      console.error(
        "AUTH → Logout failed:",
        error
      );

      throw error;
    }
  };

  /*
   * =========================================================
   * CONTEXT VALUE
   * =========================================================
   */

  const value = {
    // Firebase user
    user,

    // Firestore profile
    profile,

    // Firestore role
    role,

    // Loading state
    loading,

    // Functions
    login,
    logout,

    // Status helpers
    isAuthenticated: Boolean(user),

    isAdmin:
      role === "admin",

    isAttendant:
      role === "attendant",
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/*
 * =========================================================
 * useAuth HOOK
 * =========================================================
 */

export function useAuth() {
  const context = useContext(
    AuthContext
  );

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}