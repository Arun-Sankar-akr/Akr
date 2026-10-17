import { formatCurrency } from "../../utils/currency";
import { formatDate } from "../../utils/dateUtils";
import "./DashboardWidgets.css";

const methodTone = (method = "") => {
    const m = String(method).toLowerCase();
    if (m.includes("cash")) return "green";
    if (m.includes("upi")) return "violet";
    if (m.includes("card")) return "blue";
    return "orange";
};

export default function RecentTransactions({ items = [] }) {
    if (!items.length) return <div className="dw-empty">No transactions yet</div>;

    return (
        <div className="dw-table-wrap">
            <table className="dw-table">
                <thead>
                    <tr>
                        <th>Invoice</th>
                        <th>Service</th>
                        <th>Payment</th>
                        <th>Total</th>
                        <th>Time</th>
                    </tr>
                </thead>

                <tbody>
                    {items.map((t) => (
                        <tr key={t.id}>
                            <td data-label="Invoice">
                                <b>{t.invoiceNo}</b>
                            </td>
                            <td data-label="Service">
                                {t.items?.[0]?.serviceName || "Shop service"}
                            </td>
                            <td data-label="Payment">
                                <span className={`dw-pill ${methodTone(t.paymentMethod)}`}>
                                    {t.paymentMethod}
                                </span>
                            </td>
                            <td data-label="Total">
                                <b className="dw-amount">{formatCurrency(t.total)}</b>
                            </td>
                            <td data-label="Time" className="dw-muted">
                                {formatDate(t.createdAt)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}