import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
export function openCashRegister(data) { return addDoc(collection(db,"cashRegisters"),{...data,status:"open",openedAt:serverTimestamp()}); }
export async function getCashHistory() {
  const snap = await getDocs(query(collection(db,"cashRegisters"),orderBy("openedAt","desc")));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
