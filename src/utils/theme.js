// ============================================================
// GLOBAL THEME (light / dark) - one source of truth for the
// whole website.
//
//  - The choice is saved in localStorage ("app-theme").
//  - It is applied to <html data-theme="..."> and class "dark",
//    so ANY page / CSS file can react to it.
//  - Every component using useAppTheme() re-renders together,
//    and other open browser tabs follow too.
// ============================================================

import { useEffect, useState } from "react";

const STORAGE_KEY = "app-theme";
// older keys used by individual pages - read once so nobody loses
// the mode they already picked
const LEGACY_KEYS = ["cash-register-theme", "theme"];

const isTheme = (value) => value === "dark" || value === "light";

function readInitialTheme() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(saved)) return saved;

    for (const key of LEGACY_KEYS) {
      const legacy = window.localStorage.getItem(key);
      if (isTheme(legacy)) return legacy;
    }
  } catch {
    /* storage not available */
  }

  const attr = document.documentElement.getAttribute("data-theme");
  if (isTheme(attr)) return attr;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyToDocument(theme) {
  const root = document.documentElement;

  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

let currentTheme = readInitialTheme();
const listeners = new Set();

applyToDocument(currentTheme);

function notify() {
  listeners.forEach((listener) => listener(currentTheme));
}

export function getTheme() {
  return currentTheme;
}

export function setTheme(next) {
  if (!isTheme(next)) return;

  currentTheme = next;
  applyToDocument(next);

  try {
    window.localStorage.setItem(STORAGE_KEY, next);
    // keep the older keys in step, so any older page / script that still
    // reads them on load does not bring back the previous mode
    LEGACY_KEYS.forEach((key) => window.localStorage.setItem(key, next));
  } catch {
    /* storage not available */
  }

  notify();
}

export function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

// another browser tab changed the theme -> follow it
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY && isTheme(event.newValue)) {
    currentTheme = event.newValue;
    applyToDocument(currentTheme);
    notify();
  }
});

// Some other script / page may write its own theme to <html> while the
// site is loading (that is what turns the page dark again after a
// refresh). During start-up we keep the saved choice; after start-up a
// real change made by something else is followed, so all stays in sync.
let startingUp = true;

const startupDone = () => {
  window.setTimeout(() => {
    startingUp = false;
  }, 2000);
};

if (document.readyState === "complete") startupDone();
else window.addEventListener("load", startupDone, { once: true });

new MutationObserver(() => {
  const root = document.documentElement;
  const attr = root.getAttribute("data-theme");
  const hasDarkClass = root.classList.contains("dark");

  const inSync =
    attr === currentTheme && hasDarkClass === (currentTheme === "dark");

  if (inSync) return;

  if (startingUp || !isTheme(attr)) {
    applyToDocument(currentTheme);
  } else {
    setTheme(attr);
  }
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme", "class"],
});

export function useAppTheme() {
  const [theme, setLocal] = useState(currentTheme);

  useEffect(() => {
    setLocal(currentTheme);
    listeners.add(setLocal);
    return () => listeners.delete(setLocal);
  }, []);

  return { theme, setTheme, toggleTheme };
}