import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Calculator,
  Delete,
  Maximize2,
  Minimize2,
  Droplet,
  GripHorizontal,
  History,
  Trash2,
  X,
} from "lucide-react";
import "./FloatingCalculator.css";

/* ============================================================
   FLOATING CALCULATOR
   - Round floating button, drag it anywhere; it snaps to the
     left or right side of the screen when released.
   - Tap the button to open a compact calculator. Drag the
     panel header to move it, then it snaps to a side too.
   - Mounted once: if it is rendered in more than one place at
     the same time (page + layout) only one instance shows.
   ============================================================ */

const FAB = 60;
const PANEL_W = 300;
const MIN_OPACITY = 0.35;
const MIN_W = 200;
const MAX_W = 460;
const EXPANDED_W = 340;
const EDGE = 12;
const DEFAULT_PANEL_H = 380;

const POS_KEY = "attendant-calc-layout";
const STATE_KEY = "attendant-calc-state";

const OPS = ["+", "-", "×", "÷"];

const KEYS = [
  ["C", "±", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["0", ".", "="],
];

/* ---------- math helpers (no eval) ---------- */

function fmt(n) {
  if (!Number.isFinite(n) || Math.abs(n) > 1e15) return null;

  let s = n.toFixed(10);

  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }

  return s === "-0" ? "0" : s;
}

function evaluate(expr) {
  const source = expr.replace(/[+\-×÷]+$/, "");

  if (!source) return null;

  const tokens = source.match(/\d*\.?\d+|\d+\.|[+\-×÷]/g);

  if (!tokens || tokens.join("") !== source) return NaN;

  let i = 0;

  const unary = () => {
    const token = tokens[i];

    if (token === "-") {
      i += 1;
      return -unary();
    }

    if (token === undefined || OPS.includes(token)) return NaN;

    i += 1;
    return parseFloat(token);
  };

  const term = () => {
    let value = unary();

    while (tokens[i] === "×" || tokens[i] === "÷") {
      const op = tokens[i];
      i += 1;
      const right = unary();
      value = op === "×" ? value * right : value / right;
    }

    return value;
  };

  let result = term();

  while (tokens[i] === "+" || tokens[i] === "-") {
    const op = tokens[i];
    i += 1;
    const right = term();
    result = op === "+" ? result + right : result - right;
  }

  return i === tokens.length ? result : NaN;
}

function groupNumber(text) {
  const match = /^(-?)(\d*)(\.?)(\d*)$/.exec(text);

  if (!match) return text;

  const [, sign, int, dot, dec] = match;
  if (!int && !dot && !dec) return sign || "0";

  const grouped = int
    ? Number(int).toLocaleString("en-IN", { maximumFractionDigits: 0 })
    : "0";

  return `${sign}${grouped}${dot}${dec}`;
}

function prettyExpr(expr) {
  return expr
    .replace(/\d*\.?\d+\.?|\d+\./g, (m) => groupNumber(m))
    .replace(/([+\-×÷])/g, " $1 ")
    .replace(/^ - /, "-")
    .replace(/([×÷+\-]) {2}- /g, "$1 -")
    .trim();
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be blocked - ignore */
  }
}

const clamp = (value, min, max) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/* ============================================================ */

export default function FloatingCalculator({ theme, palette }) {
  /* only one visible instance at a time */
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (window.__attendantCalcMounted) return undefined;

    window.__attendantCalcMounted = true;
    setActive(true);

    return () => {
      window.__attendantCalcMounted = false;
    };
  }, []);

  /* theme: prop wins, otherwise follow the app's dark mode
     (<html>/<body> data-theme, data-bs-theme, or a "dark" class) */
  const readDocTheme = () => {
    if (typeof document === "undefined") return null;

    const roots = [document.documentElement, document.body].filter(Boolean);

    for (const el of roots) {
      const attr =
        el.getAttribute("data-theme") || el.getAttribute("data-bs-theme");

      if (attr) return /dark/i.test(attr) ? "dark" : "light";

      if (el.classList.contains("dark") || el.classList.contains("dark-mode") || el.classList.contains("theme-dark")) {
        return "dark";
      }
    }

    return null;
  };

  const [docTheme, setDocTheme] = useState(readDocTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => setDocTheme(readDocTheme()));
    const options = {
      attributes: true,
      attributeFilter: ["data-theme", "data-bs-theme", "class"],
    };

    observer.observe(document.documentElement, options);
    if (document.body) observer.observe(document.body, options);

    return () => observer.disconnect();
  }, []);

  const resolvedTheme = theme || docTheme || "light";

  /* ---------- calculator state ---------- */
  const saved = useRef(readJson(window.sessionStorage, STATE_KEY)).current;

  const [open, setOpen] = useState(Boolean(saved?.open));
  const [expr, setExpr] = useState(saved?.expr || "");
  const [history, setHistory] = useState(saved?.history || "");
  const [done, setDone] = useState(Boolean(saved?.done));
  const [error, setError] = useState(false);
  const [showOpacity, setShowOpacity] = useState(false);
  const [log, setLog] = useState(
    Array.isArray(saved?.log) ? saved.log : []
  );
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    writeJson(window.sessionStorage, STATE_KEY, {
      open,
      expr,
      history,
      done,
      log,
    });
  }, [open, expr, history, done, log]);

  /* ---------- position + size state ---------- */
  const [vp, setVp] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  const [layout, setLayout] = useState(() => {
    const stored = readJson(window.localStorage, POS_KEY);

    return {
      fab: stored?.fab || null,
      panel: stored?.panel || null,
      w: stored?.w || PANEL_W,
      opacity: stored?.opacity || 1,
    };
  });

  const [live, setLive] = useState(null);
  const [panelH, setPanelH] = useState(DEFAULT_PANEL_H);

  const fabRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const liveRef = useRef(null);
  const suppressClick = useRef(false);

  const saveLayout = (next) => {
    setLayout(next);
    writeJson(window.localStorage, POS_KEY, next);
  };

  useEffect(() => {
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight });

    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* keep the real panel height so it can be kept inside the screen */
  useEffect(() => {
    if (!open || !panelRef.current) return undefined;

    const el = panelRef.current;
    const update = () => setPanelH(el.offsetHeight || DEFAULT_PANEL_H);

    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => observer.disconnect();
  }, [open, active]);

  const panelW = clamp(layout.w, MIN_W, Math.min(MAX_W, vp.w - 8));
  const scale = panelW / PANEL_W;

  /* where the button sits when nothing was saved yet */
  const fabSaved = layout.fab || {
    x: vp.w - FAB - EDGE,
    y: vp.h - FAB - 100,
  };

  const fabX = clamp(fabSaved.x, 4, vp.w - FAB - 4);
  const fabY = clamp(fabSaved.y, 4, vp.h - FAB - 4);

  /* panel opens next to the button until it has been moved */
  const panelSaved =
    layout.panel ||
    {
      x:
        fabX + FAB / 2 > vp.w / 2 ? fabX + FAB - panelW : fabX,
      y:
        fabY + FAB / 2 > vp.h / 2 ? fabY - panelH - 8 : fabY + FAB + 8,
    };

  const panelX = clamp(panelSaved.x, 4, vp.w - panelW - 4);
  const panelY = clamp(panelSaved.y, 4, vp.h - panelH - 4);

  const left = live ? live.x : open ? panelX : fabX;
  const top = live ? live.y : open ? panelY : fabY;

  /* ---------- dragging (stays exactly where it is dropped) ---------- */
  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (
      event.target.closest("button") &&
      event.currentTarget !== fabRef.current
    ) {
      return;
    }

    const el = open ? panelRef.current : fabRef.current;

    if (!el) return;

    const rect = el.getBoundingClientRect();

    suppressClick.current = false;

    dragRef.current = {
      sx: event.clientX,
      sy: event.clientY,
      offX: event.clientX - rect.left,
      offY: event.clientY - rect.top,
      w: rect.width,
      h: rect.height,
      moved: false,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    const d = dragRef.current;

    if (!d) return;

    if (
      !d.moved &&
      Math.hypot(event.clientX - d.sx, event.clientY - d.sy) < 6
    ) {
      return;
    }

    d.moved = true;

    const next = {
      x: clamp(event.clientX - d.offX, 4, window.innerWidth - d.w - 4),
      y: clamp(event.clientY - d.offY, 4, window.innerHeight - d.h - 4),
    };

    liveRef.current = next;
    setLive(next);
  };

  const onPointerUp = (event) => {
    const d = dragRef.current;

    dragRef.current = null;

    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!d || !d.moved || !liveRef.current) return;

    suppressClick.current = true;

    const dropped = liveRef.current;

    liveRef.current = null;
    setLive(null);

    saveLayout(
      open
        ? { ...layout, panel: dropped }
        : { ...layout, fab: dropped }
    );
  };

  const dragProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  };

  /* ---------- manual resize (corner handle) ---------- */
  const onResizeDown = (event) => {
    event.stopPropagation();

    resizeRef.current = {
      sx: event.clientX,
      sy: event.clientY,
      startW: panelW,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onResizeMove = (event) => {
    const r = resizeRef.current;

    if (!r) return;

    const dx = event.clientX - r.sx;
    const dy = (event.clientY - r.sy) * (PANEL_W / DEFAULT_PANEL_H);
    const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;

    /* never grow past the right edge of the screen */
    const maxByScreen = window.innerWidth - panelX - 4;
    const w = clamp(r.startW + delta, MIN_W, Math.min(MAX_W, maxByScreen));

    setLayout((current) => ({ ...current, w }));
  };

  const onResizeUp = (event) => {
    if (!resizeRef.current) return;

    resizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    setLayout((current) => {
      writeJson(window.localStorage, POS_KEY, current);
      return current;
    });
  };

  const toggleExpand = () => {
    const expanded = panelW >= EXPANDED_W - 4;
    const w = expanded
      ? PANEL_W
      : Math.min(EXPANDED_W, vp.w - panelX - 4, vp.w - 8);

    saveLayout({ ...layout, w: Math.max(MIN_W, w) });
  };

  /* ---------- calculator logic ---------- */
  const lastNumber = (text) => /(\d*\.?\d*)$/.exec(text)[1];

  const press = useCallback(
    (key) => {
      if (error) {
        setError(false);
        setExpr("");
        setHistory("");
        setDone(false);

        if (key === "C" || key === "back" || OPS.includes(key) || key === "=") {
          return;
        }
      }

      const base = error ? "" : expr;
      const fresh = error ? false : done;

      if (key === "C") {
        setExpr("");
        setHistory("");
        setDone(false);
        return;
      }

      if (key === "back") {
        if (fresh) {
          setExpr("");
          setHistory("");
          setDone(false);
        } else {
          setExpr(base.slice(0, -1));
        }
        return;
      }

      if (key === "=") {
        if (!/[+\-×÷]/.test(base.replace(/^-/, ""))) return;

        const value = evaluate(base);
        const text = value === null || Number.isNaN(value) ? null : fmt(value);

        if (text === null) {
          setError(true);
          setExpr("");
          setHistory(prettyExpr(base.replace(/[+\-×÷]+$/, "")));
          setDone(false);
          return;
        }

        const shown = prettyExpr(base.replace(/[+\-×÷]+$/, ""));

        setHistory(`${shown} =`);
        setExpr(text);
        setDone(true);
        setLog((entries) =>
          [{ id: Date.now(), expr: shown, result: text }, ...entries].slice(0, 50)
        );
        return;
      }

      if (key === "%") {
        const num = lastNumber(base);

        if (!num || num === ".") return;

        const pct = fmt(parseFloat(num) / 100);

        if (pct === null) return;

        setExpr(base.slice(0, base.length - num.length) + pct);
        setDone(false);
        return;
      }

      if (key === "±") {
        const num = lastNumber(base);

        if (!num) return;

        const head = base.slice(0, base.length - num.length);
        const unaryMinus = head.endsWith("-") && (head.length === 1 || OPS.includes(head[head.length - 2]));

        setExpr(
          unaryMinus ? head.slice(0, -1) + num : `${head}-${num}`
        );
        setDone(false);
        return;
      }

      if (OPS.includes(key)) {
        if (!base) {
          if (key === "-") setExpr("-");
          return;
        }

        if (base === "-") return;

        const last = base[base.length - 1];

        setDone(false);
        setExpr(
          OPS.includes(last) ? base.slice(0, -1) + key : base + key
        );
        return;
      }

      /* digits and decimal point */
      if (base.length >= 40) return;

      const startNew = fresh;
      const current = startNew ? "" : base;
      const num = lastNumber(current);

      setDone(false);

      if (startNew) setHistory("");

      if (key === ".") {
        if (num.includes(".")) return;

        setExpr(current + (num ? "." : "0."));
        return;
      }

      if (num === "0") {
        setExpr(current.slice(0, -1) + key);
        return;
      }

      setExpr(current + key);
    },
    [done, error, expr]
  );

  /* keyboard support while open */
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target;
      const typing =
        target?.closest?.("input, textarea, select, [contenteditable='true']");

      if (event.key === "Escape") {
        setOpen(false);
        return;
      }

      if (typing) return;

      if (
        (event.key === "Enter" || event.key === " ") &&
        target?.closest?.("button")
      ) {
        return;
      }

      const map = {
        "*": "×",
        x: "×",
        X: "×",
        "/": "÷",
        Enter: "=",
        "=": "=",
        Backspace: "back",
        Delete: "C",
        c: "C",
        C: "C",
      };

      const key = map[event.key] || event.key;

      if (/^[0-9.+\-%]$/.test(key) || ["×", "÷", "=", "back", "C"].includes(key)) {
        event.preventDefault();
        press(key);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, press]);

  /* ---------- display values ---------- */
  const hasOperator = /[+\-×÷]/.test(expr.replace(/^-/, ""));
  const liveValue = hasOperator ? evaluate(expr) : null;
  const liveText =
    liveValue !== null && !Number.isNaN(liveValue) ? fmt(liveValue) : null;

  // What you type is always the BIG line (the way a normal calculator works).
  // While typing a sum, the live answer is shown small above it as "= 8".
  // After pressing "=", the answer becomes the big line and the sum goes small.
  const bigText = error
    ? "Error"
    : hasOperator
      ? prettyExpr(expr)
      : expr
        ? groupNumber(expr)
        : "0";

  const smallText = error
    ? history
    : done
      ? history
      : hasOperator
        ? liveText !== null
          ? `= ${groupNumber(liveText)}`
          : ""
        : history;

  const bigSize =
    bigText.length > 24 ? " tiny" : bigText.length > 12 ? " small" : "";

  const opacity = clamp(layout.opacity ?? 1, MIN_OPACITY, 1);

  const changeOpacity = (percent) => {
    const next = clamp(Number(percent) / 100, MIN_OPACITY, 1);

    saveLayout({ ...layout, opacity: next });
  };

  const reuse = (entry) => {
    setError(false);
    setExpr(entry.result);
    setHistory(`${entry.expr} =`);
    setDone(true);
    setShowLog(false);
  };

  if (!active || typeof document === "undefined") return null;

  const style = { left, top };
  const moving = Boolean(live);

  return createPortal(
    <div
      className={`fcalc ${open ? "is-open" : ""} ${moving ? "is-moving" : ""}`}
      data-theme={resolvedTheme}
      data-palette={palette}
      style={{ "--fc-opacity": opacity }}
    >
      {!open && (
        <button
          ref={fabRef}
          type="button"
          className="fcalc-fab"
          style={style}
          aria-label="Open calculator"
          title="Calculator - drag to move"
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }

            setOpen(true);
          }}
          {...dragProps}
        >
          <Calculator size={24} />
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          className="fcalc-panel"
          style={{ ...style, width: panelW, "--s": scale }}
          role="dialog"
          aria-label="Calculator"
        >
          <div className="fcalc-head" {...dragProps}>
            <GripHorizontal size={16} className="fcalc-grip" />
            <span className="fcalc-title">Calculator</span>

            <button
              type="button"
              className={`fcalc-icon-btn${showLog ? " active" : ""}`}
              onClick={() => setShowLog((value) => !value)}
              aria-label="History"
              title="History"
              aria-pressed={showLog}
            >
              <History size={15} />
            </button>

            <button
              type="button"
              className="fcalc-icon-btn"
              onClick={toggleExpand}
              aria-label={panelW >= EXPANDED_W - 4 ? "Compact size" : "Expand"}
              title={panelW >= EXPANDED_W - 4 ? "Compact" : "Expand"}
            >
              {panelW >= EXPANDED_W - 4 ? (
                <Minimize2 size={15} />
              ) : (
                <Maximize2 size={15} />
              )}
            </button>

            <button
              type="button"
              className={`fcalc-icon-btn${showOpacity ? " active" : ""}`}
              onClick={() => setShowOpacity((value) => !value)}
              aria-label="Opacity"
              title="Opacity"
              aria-pressed={showOpacity}
            >
              <Droplet size={15} />
            </button>

            <button
              type="button"
              className="fcalc-icon-btn"
              onClick={() => setOpen(false)}
              aria-label="Close calculator"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {showOpacity && (
            <div className="fcalc-opacity">
              <span className="fcalc-opacity-label">Opacity</span>

              <input
                type="range"
                min={Math.round(MIN_OPACITY * 100)}
                max="100"
                step="5"
                value={Math.round(opacity * 100)}
                onChange={(event) => changeOpacity(event.target.value)}
                aria-label="Calculator opacity"
              />

              <span className="fcalc-opacity-value">
                {Math.round(opacity * 100)}%
              </span>
            </div>
          )}

          <div className="fcalc-display" aria-live="polite">
            <button
              type="button"
              className="fcalc-back"
              onClick={() => press("back")}
              aria-label="Backspace"
              title="Backspace"
            >
              <Delete size={15} />
            </button>
            <span className="fcalc-expr">
              <span className="fcalc-expr-text">{smallText || "\u00A0"}</span>
            </span>
            <strong
              className={`fcalc-result${bigSize}${error ? " error" : ""}`}
            >
              <span className="fcalc-result-text">{bigText}</span>
            </strong>
          </div>

          {showLog && (
            <div className="fcalc-log">
              <div className="fcalc-log-head">
                <span>History</span>

                {log.length > 0 && (
                  <button
                    type="button"
                    className="fcalc-log-clear"
                    onClick={() => setLog([])}
                  >
                    <Trash2 size={13} />
                    Clear
                  </button>
                )}
              </div>

              {log.length === 0 ? (
                <p className="fcalc-log-empty">
                  No calculations yet. Results appear here after you press =.
                </p>
              ) : (
                <ul className="fcalc-log-list">
                  {log.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className="fcalc-log-item"
                        onClick={() => reuse(entry)}
                        title="Use this result"
                      >
                        <span className="fcalc-log-expr">{entry.expr} =</span>
                        <strong className="fcalc-log-result">
                          {groupNumber(entry.result)}
                        </strong>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="fcalc-keys" hidden={showLog}>
            {KEYS.flat().map((key) => {
              const isOp = OPS.includes(key);
              const kind =
                key === "="
                  ? "equals"
                  : key === "C"
                    ? "clear"
                    : isOp
                      ? "op"
                      : key === "%" || key === "±"
                        ? "fn"
                        : key === "0"
                          ? "num zero"
                          : "num";

              return (
                <button
                  key={key}
                  type="button"
                  className={`fcalc-key ${kind}`}
                  onClick={() => press(key)}
                  aria-label={
                    key === "back"
                      ? "Backspace"
                      : key === "-"
                        ? "Minus"
                        : key
                  }
                >
                  {key === "C" ? "AC" : key === "-" ? "−" : key}
                </button>
              );
            })}
          </div>

          <div
            className="fcalc-resize"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            role="separator"
            aria-label="Drag to resize calculator"
            title="Drag to resize"
          />
        </div>
      )}
    </div>,
    document.body
  );
}