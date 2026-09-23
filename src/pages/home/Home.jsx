import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/logo.png"
import "./Home.css";
import CgpaPercentageCalculator from "./CgpaPercentageCalculator";

import Aadhar from "../../assets/aadhar1.png"
import Pan from "../../assets/pan.png"
import Tn from "../../assets/tn.png"
import Tan from "../../assets/tangen.png"
import Udyam from "../../assets/udyam.png"
import Vi from "../../assets/vi.png"
import land from "../../assets/land.png"

import ssc from "../../assets/ssc.png"
import rrb from "../../assets/railway.png"
import ibps from "../../assets/ibps.png"
import tamilan from "../../assets/tn.png"
import sbi from "../../assets/sbi.png"

const Icon = ({ name, size = 24 }) => {
    const common = {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": true,
    };

    const icons = {
        arrow: (
            <svg {...common}>
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
            </svg>
        ),

        external: (
            <svg {...common}>
                <path d="M14 5h5v5" />
                <path d="M10 14 19 5" />
                <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
            </svg>
        ),

        user: (
            <svg {...common}>
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c.8-3.3 3.2-5 7-5s6.2 1.7 7 5" />
            </svg>
        ),

        menu: (
            <svg {...common}>
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
            </svg>
        ),

        close: (
            <svg {...common}>
                <path d="m6 6 12 12" />
                <path d="m18 6-12 12" />
            </svg>
        ),

        aadhaar: (
            <svg {...common}>
                <rect x="4" y="3" width="16" height="18" rx="2.5" />
                <circle cx="12" cy="9" r="2.2" />
                <path d="M8 16c.7-1.7 2-2.5 4-2.5s3.3.8 4 2.5" />
                <path d="M7 5.5h2" />
            </svg>
        ),

        card: (
            <svg {...common}>
                <rect x="3" y="5" width="18" height="14" rx="2.5" />
                <path d="M3 9h18" />
                <path d="M7 14h4" />
                <path d="M7 16.5h6" />
            </svg>
        ),

        land: (
            <svg {...common}>
                <path d="M3 20h18" />
                <path d="M5 20V9l7-5 7 5v11" />
                <path d="M9 20v-6h6v6" />
                <path d="M8 9h.01" />
                <path d="M12 9h.01" />
                <path d="M16 9h.01" />
            </svg>
        ),

        ration: (
            <svg {...common}>
                <path d="M6 4h12" />
                <path d="M7 4v3a5 5 0 0 0 10 0V4" />
                <path d="M8 12h8" />
                <path d="M7 20h10" />
                <path d="M9 12v8" />
                <path d="M15 12v8" />
            </svg>
        ),

        electricity: (
            <svg {...common}>
                <path d="M13 2 5 13h6l-1 9 8-11h-6z" />
            </svg>
        ),

        resize: (
            <svg {...common}>
                <path d="M8 3H3v5" />
                <path d="M3 3l6 6" />
                <path d="M16 3h5v5" />
                <path d="m21 3-6 6" />
                <path d="M8 21H3v-5" />
                <path d="m3 21 6-6" />
                <path d="M16 21h5v-5" />
                <path d="m21 21-6-6" />
            </svg>
        ),

        image: (
            <svg {...common}>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="8.5" cy="9" r="1.5" />
                <path d="m21 15-4.5-4.5L8 19" />
                <path d="m13 14 2-2 6 6" />
            </svg>
        ),

        pdf: (
            <svg {...common}>
                <path d="M6 3h8l4 4v14H6z" />
                <path d="M14 3v5h5" />
                <path d="M8.5 14h7" />
                <path d="M8.5 17h5" />
                <path d="M8.5 11h2" />
            </svg>
        ),

        compress: (
            <svg {...common}>
                <path d="m8 3-5 5 5 5" />
                <path d="M3 8h10" />
                <path d="m16 21 5-5-5-5" />
                <path d="M21 16H11" />
                <path d="M14 8h7" />
                <path d="M3 16h7" />
            </svg>
        ),

        sparkle: (
            <svg {...common}>
                <path d="m12 3 1.3 4.7L18 9l-4.7 1.3L12 15l-1.3-4.7L6 9l4.7-1.3z" />
                <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7z" />
                <path d="m5 14 .6 2L7.5 17l-1.9.6L5 19.5l-.6-1.9-1.9-.6 1.9-.6z" />
            </svg>
        ),

        check: (
            <svg {...common}>
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 2.5 2.5L16 9" />
            </svg>
        ),

        phone: (
            <svg {...common}>
                <path d="M6.5 3.5 9 3l2 4-2 1.5c1 2.1 2.4 3.5 4.5 4.5L15 11l4 2 .5 2.5c.3 1.5-.7 3-2.2 3.4C10 20.2 3.8 14 3.5 6.7 3.4 5.2 4.9 3.8 6.5 3.5Z" />
            </svg>
        ),

        location: (
            <svg {...common}>
                <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
            </svg>
        ),
    };

    return icons[name] || null;
};

/* =========================================================
   DATA
========================================================= */

const governmentServices = [
    {
        title: "Aadhaar Services",
        shortTitle: "Aadhaar",
        description:
            "Access official Aadhaar services, updates and identity-related facilities.",
        icon: "aadhaar",
        color: "violet",
        tag: "UIDAI",
        url: "https://myaadhaarbeta.uidai.gov.in/",
        logo: Aadhar,
        featured: true,
    },
    {
        title: "Birth Certificate",
        shortTitle: "Birth/Death",
        description:
            "Access the Birth/Death Certificate all over Tamil Nadu.",
        icon: "card",
        color: "rose",
        tag: "CRSTN",
        url: "https://www.crstn.org/birth_death_tn/BCert",
        logo: Tn,
        wide: true,
    },
    {
        title: "EB Bill Payment",
        shortTitle: "EB Bills",
        description:
            "Access the official Tamil Nadu electricity bill payment portal.",
        icon: "electricity",
        color: "cyan",
        tag: "TNPDCL",
        url: "https://www.tnebnet.org/qwp/qpay",
        logo: Tan,
        wide: true,
    },
    {
        title: "Employement Regeistration / Renewal",
        shortTitle: "EB Bills",
        description:
            "Access the official Tamil Nadu electricity bill payment portal.",
        icon: "employment",
        color: "cyan",
        tag: "Employement",
        url: "https://tnvelaivaaippu.gov.in/Empower/",
        logo: Tn,
        wide: true,
    },
    {
        title: "Land Records",
        shortTitle: "Land",
        description:
            "Access Tamil Nadu land-record services through the official portal.",
        icon: "land",
        color: "indigo",
        tag: "Land Max",
        url: " https://www.landamax.com/services/patta-chitta",
        logo: land,
    },
   
    {
        title: "PAN Services",
        shortTitle: "PAN",
        description:
            "Continue to the official Income Tax portal for PAN-related services.",
        icon: "card",
        color: "indigo",
        tag: "Income Tax",
        url: "https://www.incometax.gov.in/",
        logo: Pan,
    },
    {
        title: "Patta / Chitta / FMB",
        shortTitle: "Land Records",
        description:
            "Access Tamil Nadu land-record services through the official portal.",
        icon: "land",
        color: "orange",
        tag: "Tamil Nadu",
        url: "https://eservices.tn.gov.in/",
        logo: Tn,
    },
    {
        title: "Ration Services",
        shortTitle: "Ration",
        description:
            "Continue to the official Tamil Nadu Public Distribution System portal.",
        icon: "ration",
        color: "rose",
        tag: "TNPDS",
        url: "https://www.tnpds.gov.in/",
        logo: Tn,
    },


    {
        title: "Udayam Registration",
        shortTitle: "Udayam",
        description:
            "Udayam Registration for entrepreneurs all over Tamil Nadu.",
        icon: "card",
        color: "indigo",
        tag: "UDAYAM",
        url: "https://www.udyamregistration.gov.in/Default.aspx",
        logo: Udyam,
        wide: true,
    },

    {
        title: "Voter-ID Registration",
        shortTitle: "Udayam",
        description:
            "The Election Commission of India is  administering Union and State election processes in India.",
        icon: "card",
        color: "indigo",
        tag: "ECI",
        url: " https://voters.eci.gov.in/",
        logo: Vi,
        wide: true,
    },



];

const digitalTools = [
    {
        title: "Image Resizer / Compressor",
        description:
            "Resize photos for forms, applications and online uploads.",
        icon: "resize",
        color: "cyan",
        url: "https://image.pi7.org/compressor",
        number: "01",
    },
    {
        title: "All Exams Image Resizer / Compressor",
        description:
            "Resize photos for forms, applications and online uploads.",
        icon: "resize",
        color: "cyan",
        url: "https://resizer.exammint.in",
        number: "01",
    },
    {
        title: "Image to PDF",
        description:
            "Combine images into a clean, downloadable PDF.",
        icon: "image",
        color: "violet",
        url: "https://www.dpdf.com/images-to-pdf",
        number: "02",
    },
    {
        title: "PDF to Image",
        description:
            "Convert PDF pages into convenient image files.",
        icon: "pdf",
        color: "orange",
        url: "https://www.dpdf.com/pdf-to-images",
        number: "03",
    },
    {
        title: "PDF Compressor",
        description:
            "Reduce PDF file size while keeping documents practical to use.",
        icon: "compress",
        color: "rose",
        url: "https://bigpdf.11zon.com/en/compress-pdf/",
        number: "04",
    },

    {
        title: "Passport Photo Maker",
        description:
            "Passport size photo and photo copy.",
        icon: "compress",
        color: "violey",
        url: "https://image.pi7.org/passport-size-photo",
        number: "04",
    },



];

const govtExams = [
    {
        title: "Tamil Nadu Public Service Commision",
        shortTitle: "TNPSC",
        description:
            "GROUP-4, GROUP-1, GROUP-2/2A.",
        icon: "card",
        color: "violet",
        tag: "RRB",
        url: "https://www.tnpsc.gov.in/",
        logo: Tn,
        wide: true,
    },
    {
        title: "RRB Railways",
        shortTitle: "Railways",
        description:
            "RRB Ntpc, RRB ALP, RRB Group-D, Section Controller.",
        icon: "card",
        color: "rose",
        tag: "RRB",
        url: "https://www.rrbapply.gov.in/#/auth/landing",
        logo: rrb,
        wide: true,
    },
    {
        title: "Bank Exams",
        shortTitle: "Bank",
        description:
            "Clerck, Reginoal Rural Bank, Office Assitant, PO/SO, Multipurpose.",
        icon: "card",
        color: "orange",
        tag: "IBPS",
        url: "https://www.ibps.in/",
        logo: ibps,
        wide: true,
    },
    {
        title: "Central Exams",
        shortTitle: "SSC",
        description:
            "GST Inspector, Multitasking, Steno, Office Assistants.",
        icon: "card",
        color: "cyan",
        tag: "SSC",
        url: "https://ssc.gov.in/",
        logo: ssc,
        wide: true,
    },
    {
        title: "State Bank of India",
        shortTitle: "Bank",
        description:
            "Clerical, Office Assitant, PO/SO, LOB.",
        icon: "card",
        color: "cyan",
        tag: "Sbi",
        url: "https://sbi.bank.in/web/careers/current-openings",
        logo: sbi,
        wide: true,
    },


    {
        title: "Tamilan Guide",
        shortTitle: "Govt",
        description:
            "Explore all govt job here .",
        icon: "card",
        color: "cyan",
        tag: "Tamilan",
        url: "https://tamilanguide.in/",
        logo: tamilan,
        wide: true,
    },
];
/* =========================================================
   SERVICE CARD
========================================================= */

const GovernmentCard = ({ service, index }) => {
    const [logoFailed, setLogoFailed] = useState(false);
    const showLogo = service.logo && !logoFailed;

    return (
        <a
            className={`gov-card gov-card-${service.color} ${service.featured ? "gov-card-featured" : ""
                } ${service.wide ? "gov-card-wide" : ""}`}
            href={service.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ "--delay": `${index * 80}ms` }}
        >
            <div className="gov-card-glow" />

            <div className="gov-card-top">
                <div className={`gov-icon ${showLogo ? "gov-icon-logo" : ""}`}>
                    {showLogo ? (
                        <img
                            src={service.logo}
                            alt={`${service.shortTitle} logo`}
                            loading="lazy"
                            onError={() => setLogoFailed(true)}
                        />
                    ) : (
                        <Icon name={service.icon} size={27} />
                    )}
                </div>

                <span className="gov-tag">{service.tag}</span>
            </div>

            <div className="gov-card-content">
                <span className="gov-small-title">{service.shortTitle}</span>

                <h3>{service.title}</h3>

                <p>{service.description}</p>
            </div>

            <div className="gov-card-bottom">
                <span className="official-label">
                    <span className="official-dot" />
                    Official portal
                </span>

                <span className="gov-arrow">
                    <Icon name="external" size={18} />
                </span>
            </div>
        </a>
    );
};

/* =========================================================
   TOOL CARD
========================================================= */

const ToolCard = ({ tool, index }) => {
    return (
        <Link
            to={tool.url} target="_blank"
            className={`tool-card tool-card-${tool.color}`}
            style={{ "--delay": `${index * 90}ms` }}
        >
            <div className="tool-number">{tool.number}</div>

            <div className="tool-icon">
                <Icon name={tool.icon} size={27} />
            </div>

            <div className="tool-content">
                <h3>{tool.title}</h3>
                <p>{tool.description}</p>
            </div>

            <div className="tool-link">
                <span>Open tool</span>
                <span className="tool-arrow">
                    <Icon name="arrow" size={18} />
                </span>
            </div>
        </Link>
    );
};

/* =========================================================
   HOME
========================================================= */

const Home = () => {
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        const revealElements = document.querySelectorAll(
            ".reveal-item, .gov-card, .tool-card"
        );

        if (!("IntersectionObserver" in window)) {
            revealElements.forEach((element) => {
                element.classList.add("is-visible");
            });

            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.12,
                rootMargin: "0px 0px -40px",
            }
        );

        revealElements.forEach((element) => observer.observe(element));

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        document.body.classList.add("akr-home-page");

        return () => {
            document.body.classList.remove("akr-home-page");
        };
    }, []);

    const closeMenu = () => setMenuOpen(false);

    return (
        <div className="akr-home">
            {/* =================================================
          BACKGROUND GRAPHICS
      ================================================= */}
            <div className="page-art" aria-hidden="true">
                <span className="art-ring art-ring-one" />
                <span className="art-ring art-ring-two" />
                <span className="art-orb art-orb-one" />
                <span className="art-orb art-orb-two" />
                <span className="art-grid" />
            </div>

            <header className="akr-navbar-wrap">
                <nav className="akr-navbar">

                    <Link to="/" className="akr-brand" onClick={closeMenu}>
                        <img src={logo} id="logoakt" alt="" />
                    </Link>

                    <div className={`akr-nav-links ${menuOpen ? "nav-open" : ""}`}>
                        <a href="#services" onClick={closeMenu}>
                            Services
                        </a>

                        <a href="#tools" onClick={closeMenu}>
                            Digital Tools
                        </a>

                        <Link to="/login" className="mobile-login" onClick={closeMenu}>
                            <Icon name="user" size={17} />
                            Login
                        </Link>
                    </div>

                    <Link to="/login" className="navbar-login">
                        <span>Login</span>
                        <span className="login-icon">
                            <Icon name="user" size={17} />
                        </span>
                    </Link>

                    <button
                        type="button"
                        className="mobile-menu-button"
                        onClick={() => setMenuOpen((prev) => !prev)}
                        aria-label={menuOpen ? "Close menu" : "Open menu"}
                        aria-expanded={menuOpen}
                    >
                        <Icon name={menuOpen ? "close" : "menu"} size={23} />
                    </button>
                </nav>
            </header>

            <main>

                <section className="services-section" id="services">
                    <div className="section-container">
                        <div className="section-heading reveal-item">
                            <div className="section-heading-left">
                                <h1>
                                    Quick
                                    <span> Links.</span>
                                </h1>
                            </div>
                        </div>

                        <div className="services-grid">
                            {governmentServices.map((service, index) => (
                                <GovernmentCard
                                    key={service.title}
                                    service={service}
                                    index={index}
                                />
                            ))}
                        </div>
                    </div>
                    <section className="cgpa-home-tool-section" id="student">
                        <div className="section-container">
                            <div className="section-heading reveal-item">
                                <div className="section-heading-left">
                                    <h1>
                                        CGPA
                                        <span> Calculator</span>
                                    </h1>
                                </div>
                            </div>

                            <div className="cgpa-home-tool-grid">
                                <CgpaPercentageCalculator />
                            </div>
                        </div>
                    </section>

                    <div className="section-container" id="govt">
                        <div className="section-heading reveal-item">
                            <div className="section-heading-left">
                                <h1>
                                    Govt.
                                    <span> Exams</span>
                                </h1>
                            </div>
                        </div>

                        <div className="services-grid">
                            {govtExams.map((service, index) => (
                                <GovernmentCard
                                    key={service.title}
                                    service={service}
                                    index={index}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                {/* =================================================
            DIGITAL TOOLS
        ================================================= */}
                <section className="tools-section" id="tools">
                    <div className="section-container">
                        <div className="tools-header reveal-item">
                            <div>
                                <div className="eyebrow tools-eyebrow">
                                    <span className="eyebrow-icon">
                                        <Icon name="sparkle" size={14} />
                                    </span>
                                    Digital Tools
                                </div>

                                <h2>
                                    Prepare your files
                                    <span> in seconds.</span>
                                </h2>

                                <p>
                                    Handy tools for resizing images, converting documents and
                                    making files easier to submit online.
                                </p>
                            </div>

                            <div className="tools-badge">
                                <span className="tools-badge-dot" />
                                Free digital utilities
                            </div>
                        </div>

                        <div className="tools-grid">
                            {digitalTools.map((tool, index) => (
                                <ToolCard key={tool.title} tool={tool} index={index} />
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            <footer className="akr-footer">

                <div className="footer-inner">



                    <Link to="/" className="footer-logo-link">
                        <span className="footer-logo-text">
                            <img src={logo} id="logost" alt="" />
                        </span>
                    </Link>



                    <div className="footer-link-area">

                        {/* PLATFORM */}
                        <div className="footer-column">

                            <span className="footer-column-title">
                                PLATFORM
                            </span>

                            <a href="#services">
                                Government Services
                            </a>

                            <a href="#services">
                                Aadhaar Services
                            </a>

                            <a href="#services">
                                PAN Services
                            </a>

                            <a href="#services">
                                Land Records
                            </a>

                            <a href="#services">
                                Digital Services
                            </a>

                        </div>


                        {/* DIGITAL TOOLS */}
                        <div className="footer-column">

                            <span className="footer-column-title">
                                DIGITAL TOOLS
                            </span>

                            <a href="#tools">
                                Image Resizer
                            </a>

                            <a href="#tools">
                                Image to PDF
                            </a>

                            <a href="#tools">
                                PDF to Image
                            </a>

                            <a href="#tools">
                                PDF Compressor
                            </a>

                            <a href="#tools">
                                Free Utilities
                            </a>

                        </div>


                        {/* RESOURCES */}
                        <div className="footer-column">

                            <span className="footer-column-title">
                                RESOURCES
                            </span>

                            <Link to="/">
                                About AKR
                            </Link>

                            <a href="#services">
                                Government Portals
                            </a>

                            <a href="#tools">
                                Digital Resources
                            </a>

                            <Link to="/login">
                                User Login
                            </Link>

                            <a href="#services">
                                Help & Support
                            </a>

                        </div>


                        {/* CONTACT */}
                        <div className="footer-column">

                            <span className="footer-column-title">
                                CONTACT
                            </span>

                            <a href="mailto:contact@akrdeveloper.in">
                                Email us
                            </a>

                            <a href="tel:+919000000000">
                                Call us
                            </a>

                            <a
                                href="https://arunakr.netlify.app"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Developer Website
                            </a>

                            <a href="#services">
                                Services
                            </a>

                            <a href="#tools">
                                Digital Tools
                            </a>

                        </div>

                    </div>

                    <div className="footer-bottom">

                        <div className="footer-copyright">
                            <span>
                                © {new Date().getFullYear()} AKR Communications.
                            </span>

                            <span className="copyright-separator">
                                All rights reserved.
                            </span>
                        </div>


                        <div className="developer-credit">

                            <span>Design and Developed By</span>

                            <a
                                href="https://arunakr.netlify.app"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                AKR Developer
                                <Icon name="external" size={13} />
                            </a>

                        </div>


                        <div className="footer-legal">

                            <a href="#services">
                                Privacy Policy
                            </a>

                            <a href="#services">
                                Terms of Use
                            </a>

                            <a href="#services">
                                Legal
                            </a>

                        </div>

                    </div>

                </div>

            </footer>
        </div>
    );
};

export default Home;