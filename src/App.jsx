import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase Client ──────────────────────────────────────────────────────────
// HIER deine eigenen Werte eintragen (Schritt 2 der Anleitung):
const SUPABASE_URL  = "https://irszeiamvwyrntyauury.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlyc3plaWFtdnd5cm50eWF1dXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2Mzc1MjcsImV4cCI6MjA5NjIxMzUyN30.ryxib1E5E2cfkwfXj6i2EnmD56tyCtz_39u7Bpw7qSc";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── Constants ────────────────────────────────────────────────────────────────
const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DE_DAYS  = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const DE_FULL  = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const DE_MONTH = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const COURT_COLORS = ["#22C55E","#EF4444","#3B82F6","#F59E0B","#8B5CF6","#EC4899","#14B8A6","#F97316"];
const BOOKING_TYPE_COLORS = { regular:"#6B7280", training:"#3B82F6", match:"#EF4444" };
const ROLE_LABELS = { admin:"Administrator", member2:"Mitglied Plus", member:"Mitglied" };

function fmt(d)     { return d.toISOString().slice(0,10); }
function today()    { return fmt(new Date()); }
function fmtDate(d) { return `${d.getDate()}. ${DE_MONTH[d.getMonth()]} ${d.getFullYear()}`; }
function dayOfWeek(dateStr) { const d=new Date(dateStr+"T12:00:00"); return d.getDay()===0?6:d.getDay()-1; }
function getWeekDays(base) {
  const m=new Date(base); const dw=m.getDay();
  m.setDate(m.getDate()-(dw===0?6:dw-1));
  return Array.from({length:7},(_,i)=>{ const d=new Date(m); d.setDate(m.getDate()+i); return d; });
}
function addDays(dateStr,n) { const d=new Date(dateStr+"T12:00:00"); d.setDate(d.getDate()+n); return fmt(d); }
function datesBetween(from,to) {
  const dates=[]; let cur=from;
  while(cur<=to){ dates.push(cur); cur=addDays(cur,1); }
  return dates;
}

export default function App() {
  const [session,setSession]   = useState(undefined);
  const [profile,setProfile]   = useState(null);
  const [courts,setCourts]     = useState([]);
  const [bookings,setBookings] = useState([]);
  const [view,setView]         = useState("calendar");
  const [calMode,setCalMode]   = useState("week");
  const [weekBase,setWeekBase] = useState(new Date());
  const [dayBase,setDayBase]   = useState(today());
  const [selCourt,setSelCourt] = useState(null);
  const [toast,setToast]       = useState(null);
  const [modal,setModal]       = useState(null);

  const showToast = (msg,type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3200); };

  useEffect(()=>{
    sb.auth.getSession().then(({data:{session}})=>setSession(session));
    const {data:{subscription}} = sb.auth.onAuthStateChange((_,session)=>setSession(session));
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session){ setProfile(null); return; }
    sb.from("profiles").select("*").eq("id",session.user.id).single().then(({data})=>setProfile(data));
  },[session]);

  useEffect(()=>{
    if(!session) return;
    sb.from("courts").select("*").order("sort_order").then(({data})=>{ setCourts(data||[]); setSelCourt(s=>s||(data?.[0]?.id||null)); });
  },[session]);

  const loadBookings = useCallback(async()=>{
    if(!session) return;
    const from=addDays(today(),-30);
    const {data} = await sb.from("bookings").select("*").gte("date",from).order("date").order("slot");
    setBookings(data||[]);
  },[session]);

  useEffect(()=>{ loadBookings(); },[loadBookings]);

  useEffect(()=>{
    if(!session) return;
    const channel = sb.channel("bookings-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"bookings"},()=>loadBookings())
      .subscribe();
    return ()=>sb.removeChannel(channel);
  },[session,loadBookings]);

  if(session===undefined) return <Loading msg="Verbinde mit Datenbank…"/>;
  if(!session) return <LoginScreen/>;
  if(!profile) return <Loading msg="Lade Profil…"/>;

  const canMassBook = profile.role==="admin"||profile.role==="member2";

  const adaptedBookings = bookings.map(b=>({...b,courtId:b.court_id,userId:b.user_id,userName:b.user_name}));
  const adaptedData = { bookings:adaptedBookings, courts };

  const bookSingle = async(courtId,date,slot,type="regular",label="")=>{
    const {error} = await sb.from("bookings").insert({court_id:courtId,user_id:profile.id,user_name:profile.name,date,slot,type,label});
    if(error){ showToast(error.code==="23505"?"Dieser Slot ist bereits belegt.":error.message,"error"); return; }
    await loadBookings(); setModal(null);
    showToast(`${slot} Uhr auf ${courts.find(c=>c.id===courtId)?.name} gebucht ✓`);
  };

  const massBook = async({courtIds,dateFrom,dateTo,weekdays,slots,type,label})=>{
    const allDates=datesBetween(dateFrom,dateTo).filter(d=>weekdays.includes(dayOfWeek(d)));
    const rows=[];
    for(const date of allDates) for(const courtId of courtIds) for(const slot of slots)
      rows.push({court_id:courtId,user_id:profile.id,user_name:profile.name,date,slot,type,label});
    let added=0;
    for(let i=0;i<rows.length;i+=50){
      const {data:ins} = await sb.from("bookings").upsert(rows.slice(i,i+50),{onConflict:"court_id,date,slot",ignoreDuplicates:true}).select();
      added+=(ins?.length||0);
    }
    await loadBookings(); showToast(`${added} Slots gebucht.`); setModal(null);
  };

  const cancel = async(bookingId)=>{
    const bk=bookings.find(b=>b.id===bookingId); if(!bk) return;
    if(bk.user_id!==profile.id&&profile.role!=="admin"){ showToast("Keine Berechtigung.","error"); return; }
    await sb.from("bookings").delete().eq("id",bookingId);
    await loadBookings(); showToast("Buchung storniert."); setModal(null);
  };

  const cancelMany = async(ids)=>{
    await sb.from("bookings").delete().in("id",ids);
    await loadBookings(); showToast(`${ids.length} Buchungen storniert.`);
  };

  const addCourt = async(name,surface)=>{
    await sb.from("courts").insert({name,surface,sort_order:courts.length+1});
    const {data} = await sb.from("courts").select("*").order("sort_order"); setCourts(data||[]); showToast(`${name} hinzugefügt ✓`);
  };
  const updateCourt = async(id,name,surface)=>{
    await sb.from("courts").update({name,surface}).eq("id",id);
    const {data} = await sb.from("courts").select("*").order("sort_order"); setCourts(data||[]); showToast("Aktualisiert ✓");
  };
  const deleteCourt = async(id)=>{
    await sb.from("courts").delete().eq("id",id);
    const {data} = await sb.from("courts").select("*").order("sort_order"); setCourts(data||[]); showToast("Gelöscht.");
  };

  const days=getWeekDays(weekBase);
  const navItems=[
    {id:"calendar",icon:"📅",label:"Buchungskalender"},
    {id:"myBookings",icon:"📋",label:"Meine Buchungen"},
    ...(canMassBook?[{id:"massbook",icon:"📆",label:"Massenbuchung"}]:[]),
    ...(profile.role==="admin"?[{id:"admin",icon:"⚙️",label:"Administration"}]:[]),
  ];

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          .desktop-sidebar { display: none !important; }
          .mobile-bottom-nav { display: flex !important; }
          .mobile-top-bar { display: flex !important; }
          .app-main { padding-bottom: 72px !important; }
        }
        @media (min-width: 768px) {
          .desktop-sidebar { display: flex !important; }
          .mobile-bottom-nav { display: none !important; }
          .mobile-top-bar { display: none !important; }
        }
      `}</style>

      <div style={S.shell}>
        <aside className="desktop-sidebar" style={{...S.sidebar, display:"none"}}>
          <div style={S.logo}><TennisBall size={28}/><span style={S.logoText}>Tennis Herrieden</span></div>
          <nav style={S.nav}>
            {navItems.map(item=>(
              <button key={item.id} style={{...S.navBtn,...(view===item.id?S.navBtnActive:{})}} onClick={()=>setView(item.id)}>
                <span style={{fontSize:16}}>{item.icon}</span><span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div style={S.sidebarBottom}>
            <div style={S.userChip}><Av name={profile.name}/><div><div style={{fontWeight:700,fontSize:13}}>{profile.name}</div><div style={{fontSize:11,color:"#6B7280"}}>{ROLE_LABELS[profile.role]}</div></div></div>
            <button style={S.logoutBtn} onClick={()=>sb.auth.signOut()}>Abmelden</button>
          </div>
        </aside>

        <main className="app-main" style={S.main}>
          <div className="mobile-top-bar" style={{display:"none",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#0F172A",position:"sticky",top:0,zIndex:50}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><TennisBall size={22}/><span style={{color:"#fff",fontWeight:800,fontSize:15}}>Tennis Herrieden</span></div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Av name={profile.name}/>
              <button style={{background:"none",border:"1px solid #334155",borderRadius:6,color:"#94A3B8",cursor:"pointer",fontSize:12,padding:"5px 10px"}} onClick={()=>sb.auth.signOut()}>Abmelden</button>
            </div>
          </div>

          {view==="calendar"&&<CalendarView data={adaptedData} user={profile} calMode={calMode} setCalMode={setCalMode} days={days} weekBase={weekBase} setWeekBase={setWeekBase} dayBase={dayBase} setDayBase={setDayBase} selCourt={selCourt||courts[0]?.id} setSelCourt={setSelCourt} onSlotClick={(courtId,date,slot,existing)=>setModal({type:"slot",courtId,date,slot,existing})}/>}
          {view==="myBookings"&&<MyBookings data={adaptedData} user={profile} onCancel={cancel}/>}
          {view==="massbook"&&canMassBook&&<MassBookView data={adaptedData} user={profile} onMassBook={massBook} onCancelMany={cancelMany}/>}
          {view==="admin"&&profile.role==="admin"&&<AdminView data={adaptedData} onAddCourt={addCourt} onUpdateCourt={updateCourt} onDeleteCourt={deleteCourt} onCancelBooking={cancel}/>}
        </main>

        <nav className="mobile-bottom-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"#0F172A",borderTop:"1px solid #1E293B",zIndex:100,justifyContent:"space-around",padding:"8px 0",paddingBottom:"env(safe-area-inset-bottom)"}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>setView(item.id)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8,color:view===item.id?"#4ADE80":"#64748B"}}>
              <span style={{fontSize:22}}>{item.icon}</span>
              <span style={{fontSize:10,fontWeight:600}}>{item.label.split(" ")[0]}</span>
            </button>
          ))}
        </nav>

        {modal?.type==="slot"&&<SlotModal modal={modal} data={adaptedData} user={profile} onBook={bookSingle} onCancel={cancel} onClose={()=>setModal(null)}/>}
        {toast&&<div style={{...S.toast,background:toast.type==="error"?"#EF4444":"#10B981"}}>{toast.msg}</div>}
      </div>
    </>
  );
}

function LoginScreen() {
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [name,setName]=useState("");
  const [msg,setMsg]=useState(null);
  const [loading,setLoading]=useState(false);
  const handle=async()=>{
    setLoading(true);setMsg(null);
    if(mode==="login"){
      const {error}=await sb.auth.signInWithPassword({email,password});
      if(error)setMsg({text:error.message,type:"error"});
    } else if(mode==="register"){
      const {error}=await sb.auth.signUp({email,password,options:{data:{name}}});
      if(error)setMsg({text:error.message,type:"error"});
      else setMsg({text:"Bitte bestätige deine E-Mail, dann kannst du dich anmelden.",type:"ok"});
    } else {
      const {error}=await sb.auth.resetPasswordForEmail(email);
      if(error)setMsg({text:error.message,type:"error"});
      else setMsg({text:"Passwort-Reset-Link gesendet.",type:"ok"});
    }
    setLoading(false);
  };
  return (
    <div style={S.loginWrap}>
      <div style={S.loginCard}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <TennisBall size={52}/>
          <h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,marginTop:12}}>Tennis Herrieden</h1>
          <p style={{color:"#6B7280",fontSize:13,marginTop:4}}>Tennisplatz-Buchungssystem</p>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:20}}>
          {[["login","Anmelden"],["register","Registrieren"]].map(([m,l])=>(
            <button key={m} style={{...S.tabBtn,flex:1,...(mode===m?S.tabBtnActive:{})}} onClick={()=>{setMode(m);setMsg(null);}}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="register"&&<input placeholder="Vollständiger Name" value={name} onChange={e=>setName(e.target.value)} style={S.input}/>}
          <input type="email" placeholder="E-Mail" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} style={S.input}/>
          {mode!=="reset"&&<input type="password" placeholder="Passwort" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} style={S.input}/>}
          {msg&&<div style={{padding:"10px 12px",borderRadius:8,fontSize:13,background:msg.type==="error"?"#FEE2E2":"#DCFCE7",color:msg.type==="error"?"#991B1B":"#166534"}}>{msg.text}</div>}
          <button style={{...S.primaryBtn,marginTop:4,opacity:loading?.6:1}} onClick={handle} disabled={loading}>
            {loading?"…":mode==="login"?"Anmelden":mode==="register"?"Registrieren":"Link senden"}
          </button>
          {mode==="login"&&<button style={{background:"none",border:"none",color:"#6B7280",cursor:"pointer",fontSize:12}} onClick={()=>{setMode("reset");setMsg(null);}}>Passwort vergessen?</button>}
        </div>
      </div>
    </div>
  );
}

function CalendarView({data,user,calMode,setCalMode,days,weekBase,setWeekBase,dayBase,setDayBase,selCourt,setSelCourt,onSlotClick}) {
  const todayStr=today();
  const prevWeek=()=>{const d=new Date(weekBase);d.setDate(d.getDate()-7);setWeekBase(d);};
  const nextWeek=()=>{const d=new Date(weekBase);d.setDate(d.getDate()+7);setWeekBase(d);};
  return (
    <div style={{padding:"24px 28px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div><h1 style={S.pageTitle}>Buchungskalender</h1><p style={S.pageSub}>Klicke auf einen freien Slot zum Buchen</p></div>
        <div style={{display:"flex",gap:6}}>
          {[["week","📅 Woche"],["day","🗓 Tag"]].map(([m,l])=>(
            <button key={m} style={{...S.tabBtn,...(calMode===m?S.tabBtnActive:{})}} onClick={()=>setCalMode(m)}>{l}</button>
          ))}
        </div>
      </div>
      {calMode==="week"&&(
        <>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {data.courts.map((c,i)=>(
              <button key={c.id} style={{...S.courtTab,...(selCourt===c.id?{background:COURT_COLORS[i%COURT_COLORS.length],color:"#fff",borderColor:COURT_COLORS[i%COURT_COLORS.length]}:{})}} onClick={()=>setSelCourt(c.id)}>
                {c.name}<br/><span style={{fontSize:10,opacity:.8}}>{c.surface}</span>
              </button>
            ))}
          </div>
          <div style={S.weekNav}>
            <button style={S.weekBtn} onClick={prevWeek}>← Vorwoche</button>
            <span style={{fontWeight:600,fontSize:14}}>{fmtDate(days[0])} – {fmtDate(days[6])}</span>
            <button style={S.weekBtn} onClick={nextWeek}>Nächste Woche →</button>
            <button style={{...S.weekBtn,marginLeft:8}} onClick={()=>setWeekBase(new Date())}>Heute</button>
          </div>
          <WeekGrid data={data} user={user} days={days} selCourt={selCourt} todayStr={todayStr} onSlotClick={onSlotClick}/>
        </>
      )}
      {calMode==="day"&&(
        <>
          <div style={S.weekNav}>
            <button style={S.weekBtn} onClick={()=>setDayBase(addDays(dayBase,-1))}>← Vorheriger Tag</button>
            <span style={{fontWeight:600,fontSize:14}}>{DE_FULL[dayOfWeek(dayBase)]}, {fmtDate(new Date(dayBase+"T12:00:00"))}</span>
            <button style={S.weekBtn} onClick={()=>setDayBase(addDays(dayBase,1))}>Nächster Tag →</button>
            <button style={{...S.weekBtn,marginLeft:8}} onClick={()=>setDayBase(today())}>Heute</button>
          </div>
          <DayGrid data={data} user={user} date={dayBase} todayStr={todayStr} onSlotClick={onSlotClick}/>
        </>
      )}
      <div style={{display:"flex",gap:20,marginTop:12,flexWrap:"wrap"}}>
        {[["#22C55E","Eigene Buchung"],["#6B7280","Belegt"],["#3B82F6","Training"],["#EF4444","Spieltag"],["#F9FAFB","Verfügbar"]].map(([col,label])=>(
          <div key={label} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:13,height:13,borderRadius:3,background:col,border:"1px solid #E5E7EB"}}></div>
            <span style={{fontSize:12,color:"#6B7280"}}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekGrid({data,user,days,selCourt,todayStr,onSlotClick}) {
  const ci=data.courts.findIndex(c=>c.id===selCourt);
  const color=COURT_COLORS[ci%COURT_COLORS.length]||"#22C55E";
  return (
    <div style={{overflowX:"auto"}}>
      <table style={S.calTable}>
        <thead><tr><th style={S.thTime}></th>
          {days.map((d,i)=>{const isToday=fmt(d)===todayStr;return(<th key={i} style={{...S.thDay,...(isToday?S.thDayToday:{})}}><div style={{fontSize:11,color:isToday?"#22C55E":"#9CA3AF"}}>{DE_DAYS[i]}</div><div style={{fontSize:16,fontWeight:800}}>{d.getDate()}</div></th>);})}
        </tr></thead>
        <tbody>{SLOTS.map(slot=>(<tr key={slot}><td style={S.tdTime}>{slot}</td>
          {days.map((d,di)=>{
            const dateStr=fmt(d);
            const booking=data.bookings.find(b=>b.courtId===selCourt&&b.date===dateStr&&b.slot===slot);
            const isOwn=booking?.userId===user.id;const isPast=dateStr<todayStr;
            const bType=booking?.type||"regular";const bColor=BOOKING_TYPE_COLORS[bType];
            return (<td key={di} style={S.tdSlot}><button disabled={isPast&&!booking} onClick={()=>onSlotClick(selCourt,dateStr,slot,booking||null)}
              style={{...S.slotBtn,...(booking?{background:isOwn?color+"22":bColor+"22",borderColor:isOwn?color:bColor,color:isOwn?color:bColor,fontWeight:700}:{}),...(isPast&&!booking?S.slotPast:{})}}>
              {booking?(()=>{const icon=bType==="training"?"🏋️":bType==="match"?"🏆":"";const name=isOwn?"✓ Du":booking.userName.split(" ")[0];return `${icon} ${name}`.trim();})():(isPast?"—":"Frei")}</button></td>);
          })}</tr>))}</tbody>
      </table>
    </div>
  );
}

function DayGrid({data,user,date,todayStr,onSlotClick}) {
  const isPastDay=date<todayStr;
  return (
    <div style={{overflowX:"auto"}}>
      <table style={S.calTable}>
        <thead><tr><th style={S.thTime}>Uhrzeit</th>
          {data.courts.map((c,i)=>(<th key={c.id} style={{...S.thDay,borderLeft:`3px solid ${COURT_COLORS[i%COURT_COLORS.length]}`}}><div style={{fontSize:11,color:COURT_COLORS[i%COURT_COLORS.length],fontWeight:700}}>{c.name}</div><div style={{fontSize:11,color:"#9CA3AF"}}>{c.surface}</div></th>))}
        </tr></thead>
        <tbody>{SLOTS.map(slot=>(<tr key={slot}><td style={S.tdTime}>{slot}</td>
          {data.courts.map((c,ci)=>{
            const booking=data.bookings.find(b=>b.courtId===c.id&&b.date===date&&b.slot===slot);
            const isOwn=booking?.userId===user.id;const color=COURT_COLORS[ci%COURT_COLORS.length];
            const bType=booking?.type||"regular";const bColor=BOOKING_TYPE_COLORS[bType];
            return (<td key={c.id} style={{...S.tdSlot,borderLeft:`2px solid ${color}22`}}><button disabled={isPastDay&&!booking} onClick={()=>onSlotClick(c.id,date,slot,booking||null)}
              style={{...S.slotBtn,...(booking?{background:isOwn?color+"22":bColor+"22",borderColor:isOwn?color:bColor,color:isOwn?color:bColor,fontWeight:700}:{}),...(isPastDay&&!booking?S.slotPast:{})}}>
              {booking?(()=>{const icon=bType==="training"?"🏋️":bType==="match"?"🏆":"";const name=isOwn?"✓ Du":booking.userName.split(" ")[0];return `${icon} ${name}`.trim();})():(isPastDay?"—":"Frei")}</button></td>);
          })}</tr>))}</tbody>
      </table>
    </div>
  );
}

function MyBookings({data,user,onCancel}) {
  const todayStr=today();const [openGroups,setOpenGroups]=useState({});const [showPast,setShowPast]=useState(false);
  const mine=data.bookings.filter(b=>b.userId===user.id).sort((a,b)=>(a.date+a.slot).localeCompare(b.date+b.slot));
  const upcoming=mine.filter(b=>b.date>=todayStr);const past=mine.filter(b=>b.date<todayStr);
  const massGroups={};const singles=[];
  for(const b of upcoming){if(b.type==="training"||b.type==="match"){const key=`${b.type}||${b.label||""}`;if(!massGroups[key])massGroups[key]={type:b.type,label:b.label||"",bookings:[]};massGroups[key].bookings.push(b);}else singles.push(b);}
  const toggleGroup=key=>setOpenGroups(o=>({...o,[key]:!o[key]}));
  const groupCourts=bs=>[...new Set(bs.map(b=>data.courts.find(c=>c.id===b.courtId)?.name||"?"))].join(", ");
  const groupDateRange=bs=>{const dates=bs.map(b=>b.date).sort();if(dates.length===1)return fmtDate(new Date(dates[0]+"T12:00:00"));return `${fmtDate(new Date(dates[0]+"T12:00:00"))} – ${fmtDate(new Date(dates[dates.length-1]+"T12:00:00"))}`;};
  const groupSlots=bs=>[...new Set(bs.map(b=>b.slot))].sort().join(", ")+" Uhr";
  const nextOcc=bs=>{const f=bs.filter(b=>b.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date));if(!f.length)return null;const d=new Date(f[0].date+"T12:00:00");return `${DE_FULL[dayOfWeek(f[0].date)]}, ${fmtDate(d)}, ${f[0].slot} Uhr`;};
  return (
    <div style={{padding:"24px 28px",maxWidth:820}}>
      <h1 style={S.pageTitle}>Meine Buchungen</h1>
      <p style={S.pageSub}>{user.name} · {ROLE_LABELS[user.role]} · {upcoming.length} bevorstehende Slots</p>
      {Object.keys(massGroups).length>0&&(<div style={{marginBottom:28}}><SectTitle>Serien & Veranstaltungen</SectTitle>
        {Object.entries(massGroups).map(([key,g])=>{
          const isOpen=!!openGroups[key];const typeColor=BOOKING_TYPE_COLORS[g.type];
          const typeIcon=g.type==="training"?"🏋️":"🏆";const typeLabel=g.type==="training"?"Training":"Spieltag";const next=nextOcc(g.bookings);
          return (<div key={key} style={{...S.card,borderLeft:`4px solid ${typeColor}`,marginBottom:10,padding:0,overflow:"hidden"}}>
            <div style={{padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:18}}>{typeIcon}</span><span style={{fontWeight:800,fontSize:15}}>{g.label||typeLabel}</span><span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:typeColor+"22",color:typeColor,fontWeight:700}}>{typeLabel}</span></div>
                <div style={{fontSize:12,color:"#6B7280",display:"flex",flexWrap:"wrap",gap:12}}><span>📅 {groupDateRange(g.bookings)}</span><span>🎾 {groupCourts(g.bookings)}</span><span>⏰ {groupSlots(g.bookings)}</span></div>
                {next&&<div style={{fontSize:12,color:typeColor,fontWeight:600,marginTop:4}}>Nächster Termin: {next}</div>}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                <div style={{textAlign:"center",background:"#F9FAFB",borderRadius:8,padding:"6px 12px"}}><div style={{fontWeight:800,fontSize:18,color:typeColor}}>{g.bookings.length}</div><div style={{fontSize:11,color:"#9CA3AF"}}>Slots</div></div>
                <button style={S.cancelBtn} onClick={()=>{if(window.confirm(`Alle ${g.bookings.length} Slots stornieren?`))g.bookings.forEach(b=>onCancel(b.id));}}>Alle stornieren</button>
                <button style={{...S.ghostBtn,padding:"7px 12px",fontSize:13}} onClick={()=>toggleGroup(key)}>{isOpen?"▲ Einklappen":"▼ Details"}</button>
              </div>
            </div>
            {isOpen&&(<div style={{borderTop:"1px solid #F3F4F6",padding:"8px 16px 12px"}}>
              <div style={{fontSize:12,color:"#9CA3AF",marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:.4}}>Alle Termine</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:6}}>
                {g.bookings.map(b=>{const court=data.courts.find(c=>c.id===b.courtId);const ci=data.courts.findIndex(c=>c.id===b.courtId);const col=COURT_COLORS[ci%COURT_COLORS.length];const d=new Date(b.date+"T12:00:00");
                  return (<div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#F9FAFB",borderRadius:7,padding:"7px 10px",borderLeft:`3px solid ${col}`}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>{DE_DAYS[dayOfWeek(b.date)]} {d.getDate()}. {DE_MONTH[d.getMonth()]} · {b.slot} Uhr</div><div style={{fontSize:11,color:"#9CA3AF"}}>{court?.name}</div></div>
                    <button style={{background:"none",border:"none",cursor:"pointer",color:"#D1D5DB",fontSize:16,padding:"0 4px"}} onClick={()=>onCancel(b.id)}>✕</button>
                  </div>);
                })}
              </div>
            </div>)}
          </div>);
        })}
      </div>)}
      {singles.length>0&&(<div style={{marginBottom:28}}><SectTitle>Einzelbuchungen ({singles.length})</SectTitle>
        {singles.map(b=>{const court=data.courts.find(c=>c.id===b.courtId);const ci=data.courts.findIndex(c=>c.id===b.courtId);const color=COURT_COLORS[ci%COURT_COLORS.length];const d=new Date(b.date+"T12:00:00");
          return (<div key={b.id} style={{...S.card,borderLeft:`4px solid ${color}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div><div style={{fontWeight:700,fontSize:14}}>{court?.name||"?"} · {b.slot} Uhr</div><div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{DE_FULL[dayOfWeek(b.date)]}, {fmtDate(d)}</div></div>
            <button style={S.cancelBtn} onClick={()=>onCancel(b.id)}>Stornieren</button>
          </div>);
        })}
      </div>)}
      {upcoming.length===0&&<Em msg="Keine bevorstehenden Buchungen"/>}
      <div>
        <button style={{...S.ghostBtn,fontSize:13,padding:"7px 14px",marginBottom:12}} onClick={()=>setShowPast(p=>!p)}>{showPast?"▲ Vergangene ausblenden":`▼ Vergangene Buchungen (${past.length})`}</button>
        {showPast&&[...past].reverse().slice(0,20).map(b=>{const court=data.courts.find(c=>c.id===b.courtId);const ci=data.courts.findIndex(c=>c.id===b.courtId);const color=COURT_COLORS[ci%COURT_COLORS.length];const bType=b.type||"regular";const icon=bType==="training"?"🏋️":bType==="match"?"🏆":"📅";const d=new Date(b.date+"T12:00:00");
          return (<div key={b.id} style={{...S.card,borderLeft:`4px solid ${color}`,opacity:.7,display:"flex",alignItems:"center",gap:10}}><div style={{fontSize:13,fontWeight:600}}>{icon} {court?.name||"?"} · {b.slot} Uhr</div><div style={{fontSize:12,color:"#9CA3AF"}}>{DE_FULL[dayOfWeek(b.date)]}, {fmtDate(d)}</div></div>);
        })}
      </div>
    </div>
  );
}

function MassBookView({data,user,onMassBook,onCancelMany}) {
  const [tab,setTab]=useState("create");
  const [form,setForm]=useState({type:"training",label:"",dateFrom:today(),dateTo:addDays(today(),27),weekdays:[1,2,3,4],courtIds:data.courts.length>0?[data.courts[0].id]:[],slots:["09:00","10:00"]});
  const [preview,setPreview]=useState(null);
  const WD=["Mo","Di","Mi","Do","Fr","Sa","So"];
  const toggleWd=i=>setForm(f=>({...f,weekdays:f.weekdays.includes(i)?f.weekdays.filter(d=>d!==i):[...f.weekdays,i].sort()}));
  const toggleCourt=id=>setForm(f=>({...f,courtIds:f.courtIds.includes(id)?f.courtIds.filter(c=>c!==id):[...f.courtIds,id]}));
  const toggleSlot=s=>setForm(f=>({...f,slots:f.slots.includes(s)?f.slots.filter(x=>x!==s):[...f.slots,s].sort()}));
  const calcPreview=()=>{
    const allDates=datesBetween(form.dateFrom,form.dateTo).filter(d=>form.weekdays.includes(dayOfWeek(d)));
    const total=allDates.length*form.courtIds.length*form.slots.length;let conflicts=0;
    for(const date of allDates) for(const cId of form.courtIds) for(const slot of form.slots) if(data.bookings.find(b=>b.courtId===cId&&b.date===date&&b.slot===slot)) conflicts++;
    setPreview({days:allDates.length,total,conflicts,toBook:total-conflicts,dates:allDates.slice(0,5)});
  };
  const myMass=data.bookings.filter(b=>b.userId===user.id&&(b.type==="training"||b.type==="match")&&b.date>=today());
  const groups={};for(const b of myMass){const key=`${b.type}__${b.label||""}`;if(!groups[key])groups[key]={type:b.type,label:b.label,ids:[],count:0};groups[key].ids.push(b.id);groups[key].count++;}
  return (
    <div style={{padding:"24px 28px"}}>
      <h1 style={S.pageTitle}>Massenbuchung</h1><p style={S.pageSub}>Trainingstage & Spieltage buchen</p>
      <div style={{display:"flex",gap:8,marginBottom:24}}>{[["create","Buchung erstellen"],["manage","Buchungen verwalten"]].map(([id,l])=>(<button key={id} style={{...S.tabBtn,...(tab===id?S.tabBtnActive:{})}} onClick={()=>setTab(id)}>{l}</button>))}</div>
      {tab==="create"&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
        <div style={S.card}>
          <h3 style={{fontWeight:700,marginBottom:16}}>Parameter</h3>
          <Lbl>Typ</Lbl><div style={{display:"flex",gap:8,marginBottom:14}}>{[["training","🏋️ Training","#3B82F6"],["match","🏆 Spieltag","#EF4444"]].map(([val,lab,col])=>(<button key={val} style={{flex:1,padding:"10px 8px",border:`2px solid ${form.type===val?col:"#E5E7EB"}`,borderRadius:8,background:form.type===val?col+"11":"#fff",cursor:"pointer",fontWeight:600,color:form.type===val?col:"#374151",fontSize:13}} onClick={()=>setForm(f=>({...f,type:val}))}>{lab}</button>))}</div>
          <Lbl>Bezeichnung</Lbl><input placeholder="z.B. Herren-Training" value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} style={{...S.input,marginBottom:14}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}><div><Lbl>Von</Lbl><input type="date" value={form.dateFrom} onChange={e=>setForm(f=>({...f,dateFrom:e.target.value}))} style={S.input}/></div><div><Lbl>Bis</Lbl><input type="date" value={form.dateTo} onChange={e=>setForm(f=>({...f,dateTo:e.target.value}))} style={S.input}/></div></div>
          <Lbl>Wochentage</Lbl><div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>{WD.map((l,i)=>(<button key={i} style={{width:36,height:36,borderRadius:"50%",border:`2px solid ${form.weekdays.includes(i)?"#111827":"#E5E7EB"}`,background:form.weekdays.includes(i)?"#111827":"#fff",color:form.weekdays.includes(i)?"#4ADE80":"#374151",fontWeight:700,cursor:"pointer",fontSize:12}} onClick={()=>toggleWd(i)}>{l}</button>))}</div>
          <Lbl>Plätze</Lbl><div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>{data.courts.map((c,i)=>(<button key={c.id} style={{padding:"6px 12px",borderRadius:7,border:`2px solid ${form.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]:"#E5E7EB"}`,background:form.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]+"11":"#fff",color:form.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]:"#374151",fontWeight:600,cursor:"pointer",fontSize:13}} onClick={()=>toggleCourt(c.id)}>{c.name}</button>))}</div>
          <Lbl>Zeitslots</Lbl><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>{SLOTS.map(s=>(<button key={s} style={{padding:"5px 10px",borderRadius:6,border:`1.5px solid ${form.slots.includes(s)?"#111827":"#E5E7EB"}`,background:form.slots.includes(s)?"#111827":"#fff",color:form.slots.includes(s)?"#4ADE80":"#374151",fontWeight:600,cursor:"pointer",fontSize:12}} onClick={()=>toggleSlot(s)}>{s}</button>))}</div>
          <button style={{...S.primaryBtn,width:"100%"}} onClick={calcPreview}>Vorschau berechnen</button>
        </div>
        <div>{!preview&&<div style={{...S.card,textAlign:"center",color:"#9CA3AF",padding:"40px 20px"}}><div style={{fontSize:32,marginBottom:8}}>📊</div><div>Klicke auf „Vorschau berechnen"</div></div>}
          {preview&&(<div style={S.card}><h3 style={{fontWeight:700,marginBottom:16}}>Vorschau</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>{[["Tage",preview.days,"#111827"],["Gesamt",preview.total,"#111827"],["Belegt",preview.conflicts,"#EF4444"],["Gebucht",preview.toBook,"#22C55E"]].map(([l,v,c])=>(<div key={l} style={{background:"#F9FAFB",borderRadius:8,padding:"12px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:12,color:"#6B7280"}}>{l}</div></div>))}</div>
            {preview.dates.map(d=>(<div key={d} style={{fontSize:13,padding:"4px 0",borderBottom:"1px solid #F3F4F6"}}>{DE_FULL[dayOfWeek(d)]}, {fmtDate(new Date(d+"T12:00:00"))}</div>))}
            {preview.days>5&&<div style={{fontSize:12,color:"#9CA3AF",marginTop:4}}>...und {preview.days-5} weitere</div>}
            <div style={{marginTop:16}}>{preview.toBook>0?<button style={{...S.primaryBtn,width:"100%",background:"#22C55E",color:"#fff"}} onClick={()=>{onMassBook({...form});setPreview(null);}}>{preview.toBook} Slots buchen</button>:<div style={{padding:"12px",background:"#FEF3C7",borderRadius:8,fontSize:13,color:"#92400E",textAlign:"center"}}>Alle Slots belegt.</div>}</div>
          </div>)}
        </div>
      </div>)}
      {tab==="manage"&&(<div><h3 style={{fontWeight:700,marginBottom:14}}>Meine Massenbuchungen</h3>
        {Object.keys(groups).length===0&&<Em msg="Keine Massenbuchungen vorhanden"/>}
        {Object.entries(groups).map(([key,g])=>(<div key={key} style={{...S.card,display:"flex",justifyContent:"space-between",alignItems:"center",borderLeft:`4px solid ${BOOKING_TYPE_COLORS[g.type]}`}}>
          <div><div style={{fontWeight:700}}>{g.type==="training"?"🏋️ Training":"🏆 Spieltag"}{g.label&&<span style={{marginLeft:8,fontWeight:400,color:"#6B7280"}}>– {g.label}</span>}</div><div style={{fontSize:13,color:"#6B7280"}}>{g.count} Slots</div></div>
          <button style={S.cancelBtn} onClick={()=>onCancelMany(g.ids)}>Alle stornieren</button>
        </div>))}
      </div>)}
    </div>
  );
}

function AdminView({data,onAddCourt,onUpdateCourt,onDeleteCourt,onCancelBooking}) {
  const [tab,setTab]=useState("courts");
  const [courtForm,setCourtForm]=useState({name:"",surface:"Sand"});
  const [editCourt,setEditCourt]=useState(null);
  const [supaUsers,setSupaUsers]=useState([]);
  useEffect(()=>{
    if(tab!=="members") return;
    sb.from("profiles").select("*").order("created_at").then(({data})=>setSupaUsers(data||[]));
  },[tab]);

  const updateRole=async(uid,role)=>{
    await sb.from("profiles").update({role}).eq("id",uid);
    setSupaUsers(u=>u.map(x=>x.id===uid?{...x,role}:x));
  };

  const deleteUser=async(uid)=>{
    // Delete bookings first, then profile (auth user needs service role - use SQL)
    await sb.from("bookings").delete().eq("user_id",uid);
    await sb.from("profiles").delete().eq("id",uid);
    setSupaUsers(u=>u.filter(x=>x.id!==uid));
  };
  return (
    <div style={{padding:"24px 28px"}}>
      <h1 style={S.pageTitle}>Administration</h1>
      <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>{[["courts","🎾 Plätze"],["members","👥 Mitglieder"],["bookings","📅 Buchungen"]].map(([id,l])=>(<button key={id} style={{...S.tabBtn,...(tab===id?S.tabBtnActive:{})}} onClick={()=>setTab(id)}>{l}</button>))}</div>
      {tab==="courts"&&(<>
        <div style={S.card}><h3 style={{fontWeight:700,marginBottom:14}}>Neuen Platz hinzufügen</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><input placeholder="Platzname" value={courtForm.name} onChange={e=>setCourtForm(f=>({...f,name:e.target.value}))} style={S.input}/><select value={courtForm.surface} onChange={e=>setCourtForm(f=>({...f,surface:e.target.value}))} style={S.input}>{["Sand","Hartplatz","Rasen","Teppich","Kunstrasen"].map(s=><option key={s}>{s}</option>)}</select></div>
          <button style={{...S.primaryBtn,marginTop:12}} onClick={()=>{if(!courtForm.name)return;onAddCourt(courtForm.name,courtForm.surface);setCourtForm({name:"",surface:"Sand"});}}>Anlegen</button></div>
        <div style={{marginTop:16}}>{data.courts.map((c,i)=>(<div key={c.id} style={{...S.card,borderLeft:`4px solid ${COURT_COLORS[i%COURT_COLORS.length]}`}}>
          {editCourt?.id===c.id?(<div style={{display:"flex",gap:10,flexWrap:"wrap"}}><input value={editCourt.name} onChange={e=>setEditCourt(f=>({...f,name:e.target.value}))} style={{...S.input,maxWidth:180}}/><select value={editCourt.surface} onChange={e=>setEditCourt(f=>({...f,surface:e.target.value}))} style={{...S.input,maxWidth:140}}>{["Sand","Hartplatz","Rasen","Teppich","Kunstrasen"].map(s=><option key={s}>{s}</option>)}</select><button style={S.primaryBtn} onClick={()=>{onUpdateCourt(c.id,editCourt.name,editCourt.surface);setEditCourt(null);}}>Speichern</button><button style={S.ghostBtn} onClick={()=>setEditCourt(null)}>Abbrechen</button></div>)
          :(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:700}}>{c.name}</div><div style={{fontSize:12,color:"#6B7280"}}>{c.surface}</div></div><div style={{display:"flex",gap:8}}><button style={{...S.ghostBtn,padding:"6px 12px",fontSize:13}} onClick={()=>setEditCourt({id:c.id,name:c.name,surface:c.surface})}>Bearbeiten</button><button style={S.cancelBtn} onClick={()=>onDeleteCourt(c.id)}>Löschen</button></div></div>)}
        </div>))}</div>
      </>)}
      {tab==="members"&&(<>
        <div style={{...S.card,background:"#EFF6FF",border:"1px solid #BFDBFE",marginBottom:16}}><div style={{fontWeight:700,marginBottom:6}}>ℹ️ Mitglieder einladen</div><div style={{fontSize:13,color:"#1D4ED8",lineHeight:1.6}}>Mitglieder registrieren sich selbst über den Login-Screen. Danach kannst du hier Rolle zuweisen oder Mitglieder löschen.</div></div>
        <h3 style={{fontWeight:700,marginBottom:12}}>Alle Mitglieder ({supaUsers.length})</h3>
        {supaUsers.map(u=>(
          <div key={u.id} style={{...S.card,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0,flex:1}}>
              <Av name={u.name}/>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14}}>{u.name}</div>
                <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{u.email||"–"}</div>
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#F3F4F6",color:"#374151",fontWeight:600,marginTop:4,display:"inline-block"}}>{ROLE_LABELS[u.role]}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
              <select value={u.role} onChange={e=>updateRole(u.id,e.target.value)} style={{...S.input,width:"auto",padding:"6px 10px",fontSize:12}}>
                <option value="member">Mitglied</option>
                <option value="member2">Mitglied Plus</option>
                <option value="admin">Administrator</option>
              </select>
              <button style={S.cancelBtn} onClick={()=>{if(window.confirm(`${u.name} wirklich löschen? Alle Buchungen werden ebenfalls gelöscht.`)) deleteUser(u.id);}}>Löschen</button>
            </div>
          </div>
        ))}
      </>)}
      {tab==="bookings"&&(<div><h3 style={{fontWeight:700,marginBottom:14}}>Bevorstehende Buchungen</h3>
        {data.bookings.filter(b=>b.date>=today()).sort((a,b)=>(a.date+a.slot).localeCompare(b.date+b.slot)).map(b=>{const court=data.courts.find(c=>c.id===b.courtId);const ci=data.courts.findIndex(c=>c.id===b.courtId);const icon=b.type==="training"?"🏋️":b.type==="match"?"🏆":"📅";
          return (<div key={b.id} style={{...S.card,borderLeft:`4px solid ${COURT_COLORS[ci%COURT_COLORS.length]}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:600}}>{icon} {court?.name||"?"} · {b.slot} Uhr · {b.date}</div><div style={{fontSize:12,color:"#6B7280"}}>{b.userName}{b.label?` · ${b.label}`:""}</div></div><button style={S.cancelBtn} onClick={()=>onCancelBooking(b.id)}>Stornieren</button></div>);
        })}
      </div>)}
    </div>
  );
}

function SlotModal({modal,data,user,onBook,onCancel,onClose}) {
  const {courtId,date,slot,existing}=modal;const court=data.courts.find(c=>c.id===courtId);const d=new Date(date+"T12:00:00");
  const isOwn=existing?.userId===user.id;const isAdmin=user.role==="admin";const bType=existing?.type||"regular";
  return (<div style={S.overlay} onClick={onClose}><div style={S.modal} onClick={e=>e.stopPropagation()}>
    <div style={S.modalHeader}><div><div style={S.modalTitle}>{court?.name} · {slot} Uhr</div><div style={S.modalSub}>{DE_FULL[dayOfWeek(date)]}, {fmtDate(d)}</div></div><button style={S.closeBtn} onClick={onClose}>✕</button></div>
    {!existing&&(<><p style={{color:"#6B7280",marginBottom:20,fontSize:14}}>Dieser Slot ist verfügbar.</p><div style={{display:"flex",gap:10}}><button style={S.primaryBtn} onClick={()=>onBook(courtId,date,slot)}>Jetzt buchen</button><button style={S.ghostBtn} onClick={onClose}>Abbrechen</button></div></>)}
    {existing&&(<><div style={{background:"#F9FAFB",borderRadius:8,padding:"12px 14px",marginBottom:16}}><div style={{fontSize:12,color:"#6B7280",marginBottom:4}}>Gebucht von</div><div style={{fontWeight:700,fontSize:16}}>{existing.userName}</div><span style={{fontSize:12,padding:"2px 8px",borderRadius:20,background:BOOKING_TYPE_COLORS[bType]+"22",color:BOOKING_TYPE_COLORS[bType],fontWeight:600,marginTop:6,display:"inline-block"}}>{bType==="training"?"🏋️ Training":bType==="match"?"🏆 Spieltag":"📅 Standard"}</span></div>
    {(isOwn||isAdmin)?(<div style={{display:"flex",gap:10}}><button style={{...S.cancelBtn,padding:"10px 18px",fontSize:14}} onClick={()=>onCancel(existing.id)}>Stornieren</button><button style={S.ghostBtn} onClick={onClose}>Schließen</button></div>):(<button style={S.ghostBtn} onClick={onClose}>Schließen</button>)}</>)}
  </div></div>);
}

function TennisBall({size=32}){return(<svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{display:"block"}}><circle cx="16" cy="16" r="15" stroke="#22C55E" strokeWidth="2"/><ellipse cx="16" cy="16" rx="5" ry="14" stroke="#22C55E" strokeWidth="1.5"/><line x1="1" y1="16" x2="31" y2="16" stroke="#22C55E" strokeWidth="1.5"/></svg>);}
function Av({name}){return(<div style={{width:34,height:34,borderRadius:"50%",background:"#22C55E",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{name?.[0]||"?"}</div>);}
function Loading({msg="Laden…"}){return(<div style={{display:"flex",justifyContent:"center",alignItems:"center",height:"100vh",background:"#F9FAFB"}}><div style={{textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>🎾</div><div style={{color:"#6B7280"}}>{msg}</div></div></div>);}
function SectTitle({children}){return <div style={{fontSize:13,fontWeight:800,color:"#374151",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>{children}</div>;}
function Em({msg}){return <div style={{color:"#9CA3AF",padding:"18px 0",fontSize:14}}>– {msg}</div>;}
function Lbl({children}){return <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>{children}</div>;}

const S={
  shell:{display:"flex",height:"100vh",fontFamily:"'DM Sans',system-ui,sans-serif",background:"#F3F4F6",color:"#111827"},
  sidebar:{width:228,background:"#0F172A",color:"#F8FAFC",display:"flex",flexDirection:"column",padding:"20px 0",flexShrink:0},
  logo:{display:"flex",alignItems:"center",gap:10,padding:"0 20px 22px",borderBottom:"1px solid #1E293B"},
  logoText:{fontWeight:800,fontSize:17,letterSpacing:-.5},
  nav:{flex:1,padding:"14px 0"},
  navBtn:{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 20px",background:"none",border:"none",color:"#94A3B8",fontSize:13,cursor:"pointer",textAlign:"left"},
  navBtnActive:{background:"#1E293B",color:"#4ADE80",borderLeft:"3px solid #4ADE80"},
  sidebarBottom:{padding:"16px 20px",borderTop:"1px solid #1E293B"},
  userChip:{display:"flex",alignItems:"center",gap:10,marginBottom:12},
  logoutBtn:{width:"100%",padding:"8px",background:"none",border:"1px solid #334155",borderRadius:6,color:"#94A3B8",cursor:"pointer",fontSize:12},
  main:{flex:1,overflowY:"auto"},
  pageTitle:{fontSize:23,fontWeight:800,letterSpacing:-.5,margin:0},
  pageSub:{color:"#6B7280",fontSize:13,marginTop:4},
  courtTab:{padding:"8px 14px",border:"2px solid #E5E7EB",borderRadius:8,cursor:"pointer",background:"#fff",fontSize:13,fontWeight:600,textAlign:"center"},
  weekNav:{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"},
  weekBtn:{padding:"6px 14px",background:"#fff",border:"1px solid #E5E7EB",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:500},
  calTable:{width:"100%",borderCollapse:"collapse",background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.06)",minWidth:600},
  thTime:{width:58,padding:"10px 8px",background:"#F8FAFC",fontSize:12,color:"#9CA3AF",fontWeight:600},
  thDay:{padding:"10px 8px",textAlign:"center",borderLeft:"1px solid #F1F5F9",background:"#F8FAFC"},
  thDayToday:{background:"#F0FDF4"},
  tdTime:{padding:"4px 8px",fontSize:12,color:"#9CA3AF",textAlign:"right",borderTop:"1px solid #F8FAFC",whiteSpace:"nowrap"},
  tdSlot:{padding:3,borderLeft:"1px solid #F8FAFC",borderTop:"1px solid #F8FAFC"},
  slotBtn:{width:"100%",padding:"5px 4px",border:"1px solid #E5E7EB",borderRadius:5,background:"#F9FAFB",cursor:"pointer",fontSize:11,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  slotPast:{background:"#F9FAFB",color:"#D1D5DB",cursor:"not-allowed"},
  card:{background:"#fff",borderRadius:10,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,.05)"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999},
  modal:{background:"#fff",borderRadius:14,padding:28,width:380,boxShadow:"0 20px 60px rgba(0,0,0,.2)"},
  modalHeader:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18},
  modalTitle:{fontWeight:800,fontSize:18,letterSpacing:-.3},
  modalSub:{color:"#6B7280",fontSize:13,marginTop:2},
  closeBtn:{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#9CA3AF",padding:0},
  loginWrap:{minHeight:"100vh",background:"linear-gradient(135deg,#ECFDF5,#EFF6FF)",display:"flex",alignItems:"center",justifyContent:"center"},
  loginCard:{background:"#fff",borderRadius:16,padding:32,width:340,boxShadow:"0 8px 40px rgba(0,0,0,.10)"},
  input:{padding:"10px 12px",border:"1.5px solid #E5E7EB",borderRadius:8,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box",background:"#fff"},
  primaryBtn:{padding:"11px 20px",background:"#0F172A",color:"#4ADE80",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:14},
  ghostBtn:{padding:"11px 20px",background:"#F9FAFB",color:"#374151",border:"1px solid #E5E7EB",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:14},
  cancelBtn:{padding:"7px 14px",background:"#FEE2E2",color:"#DC2626",border:"none",borderRadius:6,fontWeight:600,cursor:"pointer",fontSize:13,flexShrink:0},
  tabBtn:{padding:"8px 16px",border:"1.5px solid #E5E7EB",borderRadius:7,cursor:"pointer",background:"#fff",fontSize:13,fontWeight:500},
  tabBtnActive:{background:"#0F172A",color:"#4ADE80",borderColor:"#0F172A"},
  toast:{position:"fixed",bottom:24,right:24,padding:"12px 20px",borderRadius:10,color:"#fff",fontWeight:600,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,.2)",zIndex:9999},
};
