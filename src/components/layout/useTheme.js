import { useCallback, useEffect, useState } from "react";

const KEY = "theme";

function getInitialTheme() {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved === "light" || saved === "dark") return saved;
    } catch {
        /* storage unavailable */
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

export default function useTheme() {
    const [theme, setTheme] = useState(getInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem(KEY, theme);
        } catch {
            /* ignore */
        }
    }, [theme]);

    const toggleTheme = useCallback(
        () => setTheme((t) => (t === "dark" ? "light" : "dark")),
        []
    );

    return { theme, toggleTheme };
}
