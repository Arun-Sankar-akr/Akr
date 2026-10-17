import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from "recharts";
import { formatCurrency } from "../../utils/currency";
import "./DashboardWidgets.css";

function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;

    return (
        <div className="dw-tip">
            <span>{label}</span>
            <strong>{formatCurrency(payload[0].value)}</strong>
        </div>
    );
}

const compact = (v) =>
    Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : v;

export default function SalesChart({ data = [] }) {
    if (!data.length) return <div className="dw-empty">No sales data yet</div>;

    return (
        <div className="dw-chart">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                    <defs>
                        <linearGradient id="dwSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" style={{ stopColor: "var(--accent, #5b5ce2)", stopOpacity: 0.35 }} />
                            <stop offset="100%" style={{ stopColor: "var(--accent, #5b5ce2)", stopOpacity: 0 }} />
                        </linearGradient>
                    </defs>

                    <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="var(--border, #e6e9f4)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--muted, #96a0b8)" }} dy={6} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--muted, #96a0b8)" }} tickFormatter={compact} width={48} />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--accent, #5b5ce2)", strokeOpacity: 0.25, strokeWidth: 1.5 }} />

                    <Area
                        dataKey="sales"
                        type="monotone"
                        stroke="var(--accent, #5b5ce2)"
                        strokeWidth={3}
                        fill="url(#dwSales)"
                        activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--surface, #fff)" }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}