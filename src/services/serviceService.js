import { addDoc, collection, getDocs, orderBy, query, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function getServices() {
  const q = query(collection(db, "services"), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export function addService(data) {
  return addDoc(collection(db, "services"), { ...data, active: true, createdAt: serverTimestamp() });
}
export function updateService(id, data) {
  return updateDoc(doc(db, "services", id), data);
}
