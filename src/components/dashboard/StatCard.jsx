import "./DashboardWidgets.css";

/**
 * tone: violet | green | blue | orange | red
 * trend (optional): number, e.g. 12.5 or -3.2  -> small up/down chip
 */
export default function StatCard({ icon: Icon, label, value, note, tone = "violet", trend }) {
    const hasTrend = typeof trend === "number" && !Number.isNaN(trend);

    return (
        <div className="dw-stat">
            <div className="dw-stat-top">
                <span className="dw-stat-label">{label}</span>

                <div className={`dw-stat-icon ${tone}`}>
                    {Icon && <Icon size={18} />}
                </div>
            </div>

            <strong className="dw-stat-value">{value}</strong>

            <div className="dw-stat-foot">
                {hasTrend && (
                    <span className={`dw-trend ${trend >= 0 ? "up" : "down"}`}>
                        {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
                    </span>
                )}
                {note && <small>{note}</small>}
            </div>
        </div>
    );
}