import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

import "./Login.css";
import logo from "../../assets/logo.png";
import { Eye, EyeOff, Loader2, AlertCircle, X } from "lucide-react";

export default function Login({ onClose }) {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [show, setShow] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    // Popup behaviour: Esc closes it, page behind does not scroll
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const onKey = (event) => {
            if (event.key === "Escape" && onClose && !busy) onClose();
        };

        window.addEventListener("keydown", onKey);

        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose, busy]);

    async function submit(e) {
        e.preventDefault();

        if (busy) return;

        setError("");
        setBusy(true);

        try {
            const cleanEmail = email.trim();

            const result = await login(cleanEmail, password);

            await new Promise((resolve) => setTimeout(resolve, 300));

            if (result?.role === "admin") {
                navigate("/admin/dashboard", { replace: true });
                return;
            }

            if (result?.role === "attendant") {
                navigate("/attendant", { replace: true });
                return;
            }

            setError("Your account does not have a valid role.");
        } catch (err) {
            console.error("Login error:", err);

            switch (err?.message || err?.code) {
                case "LOGIN_NO_PROFILE":
                    setError(
                        "Account found, but your user profile was not found in Firestore."
                    );
                    break;

                case "LOGIN_INVALID_ROLE":
                    setError("Your account does not have a valid role.");
                    break;

                case "LOGIN_ACCOUNT_DISABLED":
                    setError(
                        "Your account has been disabled. Contact the administrator."
                    );
                    break;

                case "auth/invalid-credential":
                    setError("Invalid email or password.");
                    break;

                case "auth/invalid-email":
                    setError("Please enter a valid email address.");
                    break;

                case "auth/user-disabled":
                    setError("This account has been disabled.");
                    break;

                case "auth/too-many-requests":
                    setError("Too many attempts. Please try again later.");
                    break;

                case "auth/network-request-failed":
                    setError(
                        "Network error. Please check your internet connection."
                    );
                    break;

                case "permission-denied":
                case "PERMISSION_DENIED":
                    setError(
                        "Firestore permission denied. Please check your Firebase rules."
                    );
                    break;

                default:
                    setError(
                        err?.message || "Unable to login. Please try again."
                    );
            }
        } finally {
            setBusy(false);
        }
    }

    return createPortal(
        <div
            className="lg-overlay"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && onClose && !busy) onClose();
            }}
        >
            <section
                className="lg-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="lg-title"
            >
                {onClose && (
                    <button
                        type="button"
                        className="lg-close"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close login"
                    >
                        <X size={16} />
                    </button>
                )}

                {/* LOGO */}
                <img className="lg-logo" src={logo} alt="Logo" />

                {/* HEADING */}
                <h1 id="lg-title" className="lg-title">Login</h1>
                <p className="lg-subtitle">Login to Your Account</p>

                {/* FORM */}
                <form className="lg-form" onSubmit={submit}>

                    <div className="lg-field">
                        <label htmlFor="login-email">Email</label>
                        <input
                            id="login-email"
                            type="email"
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            disabled={busy}
                            autoComplete="email"
                            required
                        />
                    </div>

                    <div className="lg-field">
                        <label htmlFor="login-password">Password</label>
                        <div className="lg-password">
                            <input
                                id="login-password"
                                type={show ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your password"
                                disabled={busy}
                                autoComplete="current-password"
                                required
                            />
                            <button
                                type="button"
                                className="lg-eye"
                                onClick={() => setShow((prev) => !prev)}
                                disabled={busy}
                                aria-label={show ? "Hide password" : "Show password"}
                            >
                                {show ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="lg-error" role="alert" aria-live="assertive">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="lg-submit"
                        disabled={busy}
                    >
                        {busy ? (
                            <>
                                <Loader2 size={16} className="lg-spinner" />
                                <span>Logging in...</span>
                            </>
                        ) : (
                            "Login"
                        )}
                    </button>
                </form>
            </section>
        </div>,
        document.body
    );
}