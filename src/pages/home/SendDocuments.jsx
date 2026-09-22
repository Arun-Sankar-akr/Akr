import React from "react";
import {
    MessageCircle,
    Mail,
    ArrowRight,
    Sparkles,
    Printer,
    Copy,
    FileText,
    ShieldCheck,
} from "lucide-react";
import "./SendDocuments.css";

const OWNER_WHATSAPP = "919443454635";
const OWNER_EMAIL = "ashokkumaran35@gmail.com";

export default function SendDocuments() {
    const openWhatsApp = () => {
        const message =
            "Hello AKR Communications, I would like to enquire about your Xerox and printing services.";

        const url =
            `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(message)}`;

        window.open(url, "_blank", "noopener,noreferrer");
    };

    const openEmail = () => {
        const subject = "Enquiry - AKR Communications";

        const body =
            "Hello AKR Communications,\n\n" +
            "I would like to enquire about your Xerox and printing services.\n\n" +
            "Thank you.";

        const url =
            `mailto:${OWNER_EMAIL}` +
            `?subject=${encodeURIComponent(subject)}` +
            `&body=${encodeURIComponent(body)}`;

        window.location.href = url;
    };

    return (
        <div className="contact-page">
            <div className="contact-wrapper">

                <section className="contact-hero">

                    <h1>
                        Let's get your
                        <br />
                        <span>work started.</span>
                    </h1>

                    <p>
                        Need Xerox, printing, scanning, or document
                        services? Connect with AKR Communications
                        directly.
                    </p>

                </section>


                {/* =========================================
            CONTACT ACTIONS
        ========================================= */}

                <section className="contact-actions">

                    {/* WhatsApp */}

                    <button
                        className="contact-action whatsapp"
                        onClick={openWhatsApp}
                    >

                        <div className="action-left">

                            <div className="action-icon">
                                <MessageCircle size={27} />
                            </div>

                            <div className="action-text">

                                <small>CHAT WITH US</small>

                                <h2>WhatsApp</h2>

                                <p>
                                    Start a conversation instantly
                                </p>

                            </div>

                        </div>

                        <div className="action-arrow">
                            <ArrowRight size={20} />
                        </div>

                    </button>


                    {/* Email */}

                    <button
                        className="contact-action email"
                        onClick={openEmail}
                    >

                        <div className="action-left">

                            <div className="action-icon">
                                <Mail size={27} />
                            </div>

                            <div className="action-text">

                                <small>SEND AN ENQUIRY</small>

                                <h2>Email</h2>

                                <p>
                                    Send us your requirements
                                </p>

                            </div>

                        </div>

                        <div className="action-arrow">
                            <ArrowRight size={20} />
                        </div>

                    </button>

                </section>


                {/* =========================================
            SERVICES
        ========================================= */}

                <section className="quick-services">

                    <div className="services-heading">
                        <Sparkles size={15} />
                        <span>OUR SERVICES</span>
                    </div>

                    <div className="service-list">

                        <div className="service-item">
                            <div className="service-icon">
                                <Copy size={16} />
                            </div>
                            <span>Xerox</span>
                        </div>

                        <div className="service-item">
                            <div className="service-icon">
                                <Printer size={16} />
                            </div>
                            <span>Printing</span>
                        </div>

                        <div className="service-item">
                            <div className="service-icon">
                                <FileText size={16} />
                            </div>
                            <span>Scanning</span>
                        </div>

                    </div>

                </section>


                {/* =========================================
            TRUST
        ========================================= */}

                <div className="contact-trust">

                    <ShieldCheck size={16} />

                    <span>
                        Directly connect with AKR Communications
                    </span>

                </div>


                {/* =========================================
            FOOTER
        ========================================= */}

                <footer className="contact-footer">

                    <span>AKR COMMUNICATIONS</span>

                    <i></i>

                    <span>XEROX • PRINT • SCAN</span>

                </footer>

            </div>
        </div>
    );
}