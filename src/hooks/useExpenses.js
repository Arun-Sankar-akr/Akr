import { useEffect, useState } from "react";
import { getExpenses } from "../services/expenseService";
export default function useExpenses() {
  const [expenses,setExpenses]=useState([]),[loading,setLoading]=useState(true);
  useEffect(()=>{getExpenses().then(setExpenses).catch(()=>setExpenses([])).finally(()=>setLoading(false));},[]);
  return {expenses,loading};
}
