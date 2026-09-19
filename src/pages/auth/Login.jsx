import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

import "./Login.css"
import logo from "../../assets/logo.png"
import {
    Eye,
    EyeOff,
    ArrowRight,
    ShieldCheck,
    Loader2,
    Mail,
    LockKeyhole,
    AlertCircle,
    BarChart3,
    ReceiptText,
    WalletCards,
} from "lucide-react";

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [show, setShow] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();

        if (busy) return;

        setError("");
        setBusy(true);

        try {
            const cleanEmail = email.trim();

            const result = await login(cleanEmail, password);

            await new Promise((resolve) =>
                setTimeout(resolve, 300)
            );

            if (result?.role === "admin") {
                navigate("/admin/dashboard", {
                    replace: true,
                });
                return;
            }

            if (result?.role === "attendant") {
                navigate("/attendant", {
                    replace: true,
                });
                return;
            }

            setError(
                "Your account does not have a valid role."
            );
        } catch (err) {
            console.error("Login error:", err);

            switch (err?.message || err?.code) {
                case "LOGIN_NO_PROFILE":
                    setError(
                        "Account found, but your user profile was not found in Firestore."
                    );
                    break;

                case "LOGIN_INVALID_ROLE":
                    setError(
                        "Your account does not have a valid role."
                    );
                    break;

                case "LOGIN_ACCOUNT_DISABLED":
                    setError(
                        "Your account has been disabled. Contact the administrator."
                    );
                    break;

                case "auth/invalid-credential":
                    setError(
                        "Invalid email or password."
                    );
                    break;

                case "auth/invalid-email":
                    setError(
                        "Please enter a valid email address."
                    );
                    break;

                case "auth/user-disabled":
                    setError(
                        "This account has been disabled."
                    );
                    break;

                case "auth/too-many-requests":
                    setError(
                        "Too many attempts. Please try again later."
                    );
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
                        err?.message ||
                        "Unable to sign in. Please try again."
                    );
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="login-page">

            {/* ==================================================
                BACKGROUND
            ================================================== */}

            <div className="login-background">
                <div className="login-orb login-orb-one" />
                <div className="login-orb login-orb-two" />
                <div className="login-grid" />
            </div>


            {/* ==================================================
                MAIN SHELL
            ================================================== */}

            <section className="login-shell">

                {/* ==================================================
                    LEFT SHOWCASE
                ================================================== */}

                <div className="login-showcase">

                    <div className="showcase-top">

                        {/* BRAND */}

                        <div className="showcase-logo">

                            <div className="showcase-logo-icons">
                                <img id='logo' src={logo} alt="" />
                            </div>

                            {/* <div>
                                <strong>
                                    AKR Communications
                                </strong>

                                <span>
                                    SHOP ERP
                                </span>
                            </div> */}

                        </div>


                        {/* STATUS */}

                        <div className="secure-pill">
                            <span />
                            Secure workspace
                        </div>

                    </div>


                    {/* SHOWCASE CONTENT */}

                    <div className="showcase-content">

                        <h1>
                            Run your shop.
                            <br />
                            <span>
                                Smarter every day.
                            </span>
                        </h1>

                        <p>
                            Manage billing, services, transactions,
                            cash, staff and business accounts from
                            one simple workspace built for your shop.
                        </p>


                        {/* STATS */}

                        <div className="showcase-stats">

                            <div>
                                <BarChart3 size={17} />

                                <strong>
                                    Sales
                                </strong>

                                <span>
                                    Track daily business
                                </span>
                            </div>


                            <div>
                                <ReceiptText size={17} />

                                <strong>
                                    Billing
                                </strong>

                                <span>
                                    Fast counter billing
                                </span>
                            </div>


                            <div>
                                <WalletCards size={17} />

                                <strong>
                                    Accounts
                                </strong>

                                <span>
                                    Monitor your cash flow
                                </span>
                            </div>

                        </div>

                    </div>


                    {/* FOOTER */}

                    <div className="showcase-footer">

                        <ShieldCheck size={15} />

                        <span>
                            Your business workspace is protected
                            with Firebase Authentication and
                            role-based access.
                        </span>

                    </div>

                </div>


                {/* ==================================================
                    RIGHT LOGIN PANEL
                ================================================== */}

                <div className="login-panel">

                    <div className="mobile-brand">

                        <div className="showcase-logo-icon">
                            <img id='logo' src={logo} alt="" />
                        </div>

                        {/* <div>
                            <strong>
                                Akr Communications
                            </strong>

                            <span>
                                SHOP ERP
                            </span>
                        </div> */}

                    </div>


                    {/* HEADING */}

                    <div className="login-heading">

                        <div className="login-kicker">
                            <span />
                            SECURE BUSINESS WORKSPACE
                        </div>

                        <h2>
                            Welcome back.
                        </h2>

                        <p>
                            Sign in to continue to your
                            shop management workspace.
                        </p>

                    </div>


                    {/* FORM */}

                    <form
                        className="login-form"
                        onSubmit={submit}
                    >

                        {/* EMAIL */}

                        <div className="field-group">

                            <label htmlFor="login-email">
                                Email address
                            </label>

                            <div className="input-wrap">

                                <Mail size={17} />

                                <input
                                    id="login-email"
                                    autoFocus
                                    value={email}
                                    onChange={(e) =>
                                        setEmail(
                                            e.target.value
                                        )
                                    }
                                    type="email"
                                    placeholder="admin@shop.com"
                                    disabled={busy}
                                    autoComplete="email"
                                    required
                                />

                            </div>

                        </div>


                        {/* PASSWORD */}

                        <div className="field-group">

                            <div className="password-label">

                                <label htmlFor="login-password">
                                    Password
                                </label>

                            </div>

                            <div className="input-wrap password-wrap">

                                <LockKeyhole size={17} />

                                <input
                                    id="login-password"
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(
                                            e.target.value
                                        )
                                    }
                                    type={
                                        show
                                            ? "text"
                                            : "password"
                                    }
                                    placeholder="Enter your password"
                                    disabled={busy}
                                    autoComplete="current-password"
                                    required
                                />

                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() =>
                                        setShow(
                                            (prev) =>
                                                !prev
                                        )
                                    }
                                    disabled={busy}
                                    aria-label={
                                        show
                                            ? "Hide password"
                                            : "Show password"
                                    }
                                >
                                    {show ? (
                                        <EyeOff size={17} />
                                    ) : (
                                        <Eye size={17} />
                                    )}
                                </button>

                            </div>

                        </div>


                        {/* ERROR */}

                        {error && (
                            <div className="login-error" role="alert" aria-live="assertive">


                                <AlertCircle size={17} />

                                <div>

                                    <strong>
                                        Sign in failed
                                    </strong>

                                    <span>
                                        {error}
                                    </span>

                                </div>

                            </div>
                        )}


                        {/* LOGIN */}

                        <button
                            type="submit"
                            className={`login-submit ${busy
                                    ? "is-loading"
                                    : ""
                                }`}
                            disabled={busy}
                        >

                            {busy ? (
                                <>
                                    <Loader2
                                        size={18}
                                        className="login-spinner"
                                    />

                                    <span>
                                        Signing in...
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span>
                                        Enter workspace
                                    </span>

                                    <ArrowRight
                                        size={18}
                                    />
                                </>
                            )}

                        </button>

                    </form>


                    {/* SECURITY */}

                   

                    <p className="login-copyright">
                        © {new Date().getFullYear()} Akr Communications

                    </p>

                </div>

            </section>

        </main>
    );
}