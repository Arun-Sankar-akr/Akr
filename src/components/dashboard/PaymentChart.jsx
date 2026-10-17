import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import "./DashboardWidgets.css";

const COLORS = ["var(--accent, #5b5ce2)", "#12a06a", "#2563eb", "#e08a0b", "#e5484d"];

const DEFAULT_DATA = [
    { name: "Cash", value: 45 },
    { name: "UPI", value: 42 },
    { name: "Card", value: 13 },
];

function PieTip({ active, payload }) {
    if (!active || !payload?.length) return null;

    return (
        <div className="dw-tip">
            <span>{payload[0].name}</span>
            <strong>{payload[0].value}</strong>
        </div>
    );
}

export default function PaymentChart({ data = DEFAULT_DATA }) {
    const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

    if (!total) return <div className="dw-empty">No payments yet</div>;

    return (
        <div className="dw-pay">
            <div className="dw-pay-ring">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="68%"
                            outerRadius="94%"
                            paddingAngle={4}
                            cornerRadius={8}
                            stroke="none"
                        >
                            {data.map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<PieTip />} />
                    </PieChart>
                </ResponsiveContainer>

                <div className="dw-pay-center">
                    <strong>{total}</strong>
                    <span>Total</span>
                </div>
            </div>

            <ul className="dw-legend">
                {data.map((item, i) => {
                    const percent = Math.round(((Number(item.value) || 0) / total) * 100);

                    return (
                        <li key={item.name}>
                            <i style={{ background: COLORS[i % COLORS.length] }} />
                            <span>{item.name}</span>
                            <b>{percent}%</b>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}