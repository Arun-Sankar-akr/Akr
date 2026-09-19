import { getTransactionsBetween } from "./transactionService";
import { getExpenses } from "./expenseService";
import { calculateNetProfit } from "../utils/calculations";

export async function getBusinessReport(start, end) {
  const [transactions, expenses] = await Promise.all([
    getTransactionsBetween(start,end),
    getExpenses()
  ]);
  const sales = transactions.reduce((s,t)=>s+Number(t.total||0),0);
  const cost = transactions.reduce((s,t)=>s+Number(t.serviceCost||0),0);
  const grossProfit = sales-cost;
  const periodExpenses = expenses.filter(e => {
    const d = e.createdAt?.toDate?.() || new Date(e.createdAt || 0);
    return d >= start && d <= end;
  }).reduce((s,e)=>s+Number(e.amount||0),0);
  return { transactions, sales, cost, grossProfit, expenses:periodExpenses, netProfit:calculateNetProfit(grossProfit,periodExpenses) };
}
