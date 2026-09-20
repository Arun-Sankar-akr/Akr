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

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {

        try {
          // -------------------------------------------------
          // No Firebase user
          // -------------------------------------------------

          if (!firebaseUser) {

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

          // -------------------------------------------------
          // Get Firestore profile
          // -------------------------------------------------

          const userRef = doc(
            db,
            "users",
            firebaseUser.uid
          );

          const snapshot = await getDoc(userRef);

          // -------------------------------------------------
          // Profile not found
          // -------------------------------------------------

          if (!snapshot.exists()) {

            setProfile(null);
            setRole(null);
            setLoading(false);

            return;
          }

          // -------------------------------------------------
          // Profile found
          // -------------------------------------------------

          const data = snapshot.data();

          setProfile(data);
          setRole(data.role || null);

        } catch (error) {

          setProfile(null);
          setRole(null);

        } finally {
          setLoading(false);
        }
      }
    );

    return () => {

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

      // -----------------------------------------------------
      // 2. Firestore profile
      // -----------------------------------------------------

      const userRef = doc(
        db,
        "users",
        firebaseUser.uid
      );

      const snapshot = await getDoc(userRef);

      // -----------------------------------------------------
      // Profile doesn't exist
      // -----------------------------------------------------

      if (!snapshot.exists()) {

        await signOut(auth);

        throw new Error(
          "LOGIN_NO_PROFILE"
        );
      }

      // -----------------------------------------------------
      // Profile exists
      // -----------------------------------------------------

      const data = snapshot.data();

      // -----------------------------------------------------
      // 3. Validate role
      // -----------------------------------------------------

      if (
        data.role !== "admin" &&
        data.role !== "attendant"
      ) {

        await signOut(auth);

        throw new Error(
          "LOGIN_INVALID_ROLE"
        );
      }

      // -----------------------------------------------------
      // 4. Check active account
      // -----------------------------------------------------

      if (data.active === false) {

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

      // -----------------------------------------------------
      // Return login result
      // -----------------------------------------------------

      return {
        user: firebaseUser,
        profile: data,
        role: data.role,
      };

    } catch (error) {

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

      await signOut(auth);

      setUser(null);
      setProfile(null);
      setRole(null);

    } catch (error) {

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
