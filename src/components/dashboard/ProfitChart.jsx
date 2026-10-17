import {
    ResponsiveContainer,
    BarChart,
    Bar,
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

export default function ProfitChart({ data = [] }) {
    if (!data.length) return <div className="dw-empty">No profit data yet</div>;

    return (
        <div className="dw-chart">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 8, left: -14, bottom: 0 }} barCategoryGap="28%">
                    <defs>
                        <linearGradient id="dwProfit" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" />
                            <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                    </defs>

                    <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="var(--border, #e6e9f4)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--muted, #96a0b8)" }} dy={6} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--muted, #96a0b8)" }} tickFormatter={compact} width={48} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent-soft, rgba(91,92,226,.08))", radius: 8 }} />

                    <Bar dataKey="profit" fill="url(#dwProfit)" radius={[8, 8, 0, 0]} maxBarSize={38} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}