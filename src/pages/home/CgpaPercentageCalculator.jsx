import React, { useState } from "react";
import "./CgpaPercentageCalculator.css";

const CONVERSION_FACTOR = 9.5;

const calculateCgpa = (percentage) => {
    return percentage / CONVERSION_FACTOR;
};

const calculatePercentage = (cgpa) => {
    return cgpa * CONVERSION_FACTOR;
};

export default function CgpaPercentageCalculator() {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState("percentage-to-cgpa");
    const [value, setValue] = useState("");
    const [result, setResult] = useState(null);
    const [copied, setCopied] = useState(false);

    const handleCalculate = () => {
        const numericValue = Number(value);

        if (!value || Number.isNaN(numericValue)) {
            setResult(null);
            return;
        }

        if (mode === "percentage-to-cgpa") {
            if (numericValue < 0 || numericValue > 100) {
                setResult(null);
                return;
            }

            const cgpa = calculateCgpa(numericValue);

            setResult({
                value: cgpa.toFixed(2),
                label: "CGPA",
                formula: `${numericValue} ÷ ${CONVERSION_FACTOR} = ${cgpa.toFixed(
                    2
                )}`,
            });
        } else {
            if (numericValue < 0 || numericValue > 10) {
                setResult(null);
                return;
            }

            const percentage = calculatePercentage(numericValue);

            setResult({
                value: percentage.toFixed(2),
                label: "Percentage",
                formula: `${numericValue} × ${CONVERSION_FACTOR} = ${percentage.toFixed(
                    2
                )}%`,
            });
        }

        setCopied(false);
    };

    const handleReset = () => {
        setValue("");
        setResult(null);
        setCopied(false);
    };

    const handleCopy = async () => {
        if (!result) return;

        try {
            await navigator.clipboard.writeText(
                `${result.label}: ${result.value}${result.label === "Percentage" ? "%" : ""}`
            );

            setCopied(true);

            setTimeout(() => {
                setCopied(false);
            }, 1800);
        } catch (error) {
            console.error("Copy failed:", error);
        }
    };

    const closeModal = () => {
        setIsOpen(false);
        setCopied(false);
    };

    return (
        <>
            {/* TOOL CARD */}
            <button
                type="button"
                className="cgpa-tool-card"
                onClick={() => setIsOpen(true)}
            >
                <div className="cgpa-card-glow" />

                <div className="cgpa-card-top">
                    <div className="cgpa-card-icon">
                        <span>∑</span>
                    </div>

                    <div className="cgpa-card-badge">9.5 RULE</div>
                </div>

                <div className="cgpa-card-content">
                    <span className="cgpa-card-kicker">ACADEMIC TOOL</span>

                    <h3>CGPA ↔ Percentage</h3>

                    <p>
                        Convert CGPA to percentage or percentage to CGPA using the fixed
                        9.5 conversion factor.
                    </p>
                </div>

                <div className="cgpa-card-bottom">
                    <span>Open Calculator</span>

                    <span className="cgpa-card-arrow">→</span>
                </div>
            </button>

            {/* MODAL */}
            {isOpen && (
                <div
                    className="cgpa-modal-backdrop"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) {
                            closeModal();
                        }
                    }}
                >
                    <div
                        className="cgpa-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cgpa-title"
                    >
                        {/* MODAL HEADER */}
                        <div className="cgpa-modal-head">
                            <div className="cgpa-modal-title-wrap">
                                <div className="cgpa-modal-icon">
                                    <span>∑</span>
                                </div>

                                <div>
                                    <span className="cgpa-modal-eyebrow">
                                        ACADEMIC CALCULATOR
                                    </span>

                                    <h2 id="cgpa-title">CGPA ↔ Percentage</h2>

                                    <p>Simple conversion using the 9.5 rule.</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="cgpa-close"
                                onClick={closeModal}
                                aria-label="Close calculator"
                            >
                                ×
                            </button>
                        </div>

                        {/* MODAL BODY */}
                        <div className="cgpa-modal-body">
                            {/* MODE SWITCH */}
                            <div className="cgpa-mode-switch">
                                <button
                                    type="button"
                                    className={
                                        mode === "percentage-to-cgpa" ? "active" : ""
                                    }
                                    onClick={() => {
                                        setMode("percentage-to-cgpa");
                                        setValue("");
                                        setResult(null);
                                    }}
                                >
                                    <span className="cgpa-mode-icon">%</span>
                                    Percentage → CGPA
                                </button>

                                <button
                                    type="button"
                                    className={mode === "cgpa-to-percentage" ? "active" : ""}
                                    onClick={() => {
                                        setMode("cgpa-to-percentage");
                                        setValue("");
                                        setResult(null);
                                    }}
                                >
                                    <span className="cgpa-mode-icon">10</span>
                                    CGPA → Percentage
                                </button>
                            </div>

                            {/* INPUT */}
                            <div className="cgpa-form-grid single">
                                <label className="cgpa-field">
                                    <span className="cgpa-field-label">
                                        {mode === "percentage-to-cgpa"
                                            ? "Enter Percentage"
                                            : "Enter CGPA"}
                                    </span>

                                    <div className="cgpa-input-wrap">
                                        <input
                                            type="number"
                                            min="0"
                                            max={mode === "percentage-to-cgpa" ? "100" : "10"}
                                            step="0.01"
                                            value={value}
                                            onChange={(e) => {
                                                setValue(e.target.value);
                                                setResult(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    handleCalculate();
                                                }
                                            }}
                                            placeholder={
                                                mode === "percentage-to-cgpa"
                                                    ? "Example: 85"
                                                    : "Example: 8.5"
                                            }
                                        />

                                        <span className="cgpa-input-suffix">
                                            {mode === "percentage-to-cgpa" ? "%" : "CGPA"}
                                        </span>
                                    </div>

                                    <span className="cgpa-input-help">
                                        {mode === "percentage-to-cgpa"
                                            ? "Enter a value between 0 and 100."
                                            : "Enter a value between 0 and 10."}
                                    </span>
                                </label>
                            </div>

                            {/* FORMULA */}
                            <div className="cgpa-formula-note">
                                <div className="cgpa-note-title">
                                    <span className="cgpa-note-dot" />
                                    Conversion Formula
                                </div>

                                <div className="cgpa-formula-main">
                                    {mode === "percentage-to-cgpa" ? (
                                        <>
                                            <strong>CGPA</strong>
                                            <span>=</span>
                                            <strong>Percentage ÷ 9.5</strong>
                                        </>
                                    ) : (
                                        <>
                                            <strong>Percentage</strong>
                                            <span>=</span>
                                            <strong>CGPA × 9.5</strong>
                                        </>
                                    )}
                                </div>

                                <p>
                                    The conversion factor is fixed at{" "}
                                    <strong>{CONVERSION_FACTOR}</strong>.
                                </p>
                            </div>

                            {/* CALCULATE */}
                            <button
                                type="button"
                                className="cgpa-calculate"
                                onClick={handleCalculate}
                            >
                                <span>Calculate Result</span>
                                <span>→</span>
                            </button>

                            {/* RESULT */}
                            {result && (
                                <div className="cgpa-result">
                                    <div className="cgpa-result-top">
                                        <div>
                                            <span className="cgpa-result-label">
                                                CALCULATED {result.label.toUpperCase()}
                                            </span>

                                            <div className="cgpa-result-value">
                                                {result.value}
                                                {result.label === "Percentage" && (
                                                    <small>%</small>
                                                )}
                                            </div>
                                        </div>

                                        <div className="cgpa-result-check">✓</div>
                                    </div>

                                    <div className="cgpa-working">
                                        <span>Working</span>
                                        <strong>{result.formula}</strong>
                                    </div>

                                    <button
                                        type="button"
                                        className="cgpa-copy"
                                        onClick={handleCopy}
                                    >
                                        <span>{copied ? "✓ Copied" : "Copy Result"}</span>
                                    </button>
                                </div>
                            )}

                            {/* DISCLAIMER */}
                            <div className="cgpa-disclaimer">
                                <span className="cgpa-disclaimer-icon">ⓘ</span>

                                <p>
                                    To convert a percentage to CGPA, divide the percentage by a
                                    conversion factor — CBSE uses 9.5. Enter your percentage and
                                    the tool shows the CGPA on a 10-point scale with the
                                    working. The 9.5 rule is a convention, so use your
                                    university&apos;s factor if it differs.
                                </p>
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="cgpa-modal-footer">
                            <button
                                type="button"
                                className="cgpa-reset"
                                onClick={handleReset}
                            >
                                ↻ Reset
                            </button>

                            <button
                                type="button"
                                className="cgpa-done"
                                onClick={closeModal}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}