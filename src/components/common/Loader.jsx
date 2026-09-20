import { useEffect, useState } from "react";
import "./Loader.css";
import loaderGif from "../../assets/loading1.gif";

export default function Loader({ duration = 9000, onComplete }) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
            onComplete?.();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onComplete]);

    if (!visible) {
        return null;
    }

    return (
        <div className="protected-route-loading">
            <div className="loader-overlay">
                <div className="loader-content">
                    <img
                        src={loaderGif}
                        alt="Loading"
                        className="loader-gif"
                    />
                </div>
            </div>
        </div>
    );
}