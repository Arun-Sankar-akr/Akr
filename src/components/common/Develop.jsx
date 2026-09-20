import React from 'react';
import './Develop.css';

const Develop = () => {
    return (
        <div className="footer">
            <div className="copy">
                <p>© 2026 AKR Communications. All rights reserved.</p>
            </div>
            <div className="develop-container">
                <span className="develop-label">Designed & Developed by</span> &nbsp;
                <a
                    href="https://arunakr.netlify.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="develop-link"
                >
                    AKR Developers
                    <span className="link-underline" />
                </a>
            </div>
        </div>
    );
};

export default Develop;