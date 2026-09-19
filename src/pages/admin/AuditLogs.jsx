import {useEffect,useState} from "react";
import {Plus,Search,Download} from "lucide-react";
import {formatCurrency} from "../../utils/currency";
export default function AuditLogs() {
  const [search,setSearch]=useState("");
  return <div>
    <div className="page-head"><div><div className="eyebrow">MANAGEMENT</div><h1>Audit Logs</h1><p>Track important changes and financial actions.</p></div><button className="primary-btn"><Plus size={16}/> Add new</button></div>
    <section className="panel">
      <div className="toolbar"><div className="search-bar"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search audit logs..."/></div><button className="secondary-btn"><Download size={15}/> Export</button></div>
      <div className="empty-module"><div className="module-icon">✦</div><h2>Audit Logs workspace</h2><p>The page is connected to the requested project structure. Add Firestore records and filters here as you expand the shop workflow.</p></div>
    </section>
  </div>
}