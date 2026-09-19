import { useEffect, useState } from "react";
import { getServices } from "../services/serviceService";
export default function useServices() {
  const [services,setServices]=useState([]),[loading,setLoading]=useState(true);
  useEffect(()=>{getServices().then(setServices).catch(()=>setServices([])).finally(()=>setLoading(false));},[]);
  return {services,loading,setServices};
}
