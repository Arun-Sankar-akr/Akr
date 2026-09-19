import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
export function addCustomer(data) { return addDoc(collection(db,"customers"), {...data,createdAt:serverTimestamp()}); }
export async function getCustomers() {
  const snap = await getDocs(query(collection(db,"customers"),orderBy("name")));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
