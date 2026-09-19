export function startOfDay(date = new Date()) {
  const d = new Date(date); d.setHours(0,0,0,0); return d;
}
export function endOfDay(date = new Date()) {
  const d = new Date(date); d.setHours(23,59,59,999); return d;
}
export function formatDate(value) {
  if (!value) return "—";
  const d = value?.toDate ? value.toDate() : new Date(value);
  return d.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
