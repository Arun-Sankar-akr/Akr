import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
export async function getStaff() {
  const snap = await getDocs(query(collection(db,"users"),orderBy("name")));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
