import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export function addExpense(data) {
  return addDoc(collection(db, "expenses"), { ...data, amount: Number(data.amount), createdAt: serverTimestamp() });
}
export async function getExpenses() {
  const snap = await getDocs(query(collection(db, "expenses"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}
