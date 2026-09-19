export function calculateCart(items = []) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const serviceCost = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.costPrice || 0), 0);
  return { subtotal, serviceCost, grossProfit: subtotal - serviceCost, total: subtotal };
}

export function calculateNetProfit(grossProfit, expenses) {
  return Number(grossProfit || 0) - Number(expenses || 0);
}
