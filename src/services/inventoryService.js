import { addDoc, collection, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
export function addInventoryItem(data) {
  return addDoc(collection(db, "inventory"), { ...data, quantity:Number(data.quantity || 0), createdAt:serverTimestamp() });
}
export async function getInventory() {
  const snap = await getDocs(query(collection(db, "inventory"), orderBy("itemName")));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
