import { useState, useEffect, useCallback, Fragment } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://irszeiamvwyrntyauury.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlyc3plaWFtdnd5cm50eWF1dXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2Mzc1MjcsImV4cCI6MjA5NjIxMzUyN30.ryxib1E5E2cfkwfXj6i2EnmD56tyCtz_39u7Bpw7qSc";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DE_DAYS  = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const DE_FULL  = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const DE_MONTH = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const COURT_COLORS = ["#22C55E","#EF4444","#3B82F6","#F59E0B","#8B5CF6","#EC4899","#14B8A6","#F97316"];
const BOOKING_TYPE_COLORS = { regular:"#6B7280", training:"#3B82F6", match:"#EF4444" };
const BOOKING_TYPE_MAP = { regular:{icon:"🎾",color:"#22C55E"}, training:{icon:"🏋️",color:"#3B82F6"}, match:{icon:"🏆",color:"#EF4444"} };
const ROLE_LABELS = { admin:"Administrator", member2:"Mitglied Plus", member:"Mitglied" };
const KASSE_EMOJIS = ["🍺","🥤","🍎","💧","🍊","☕","🧃","🍵","🥛","🍋","🫖","🧋","🍷","🥂","🫙"];

function fmt(d)      { return d.toISOString().slice(0,10); }
function today()     { return fmt(new Date()); }
function fmtDate(d)  { return `${d.getDate()}. ${DE_MONTH[d.getMonth()]} ${d.getFullYear()}`; }
function fmtDateShort(s) { const d=new Date(s+"T12:00:00"); return d.toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"short"}); }
function eur(n)      { return (n||0).toFixed(2).replace(".",",")+" €"; }
function dayOfWeek(s){ const d=new Date(s+"T12:00:00"); return d.getDay()===0?6:d.getDay()-1; }
function getWeekDays(base){ const m=new Date(base); const dw=m.getDay(); m.setDate(m.getDate()-(dw===0?6:dw-1)); return Array.from({length:7},(_,i)=>{ const d=new Date(m); d.setDate(m.getDate()+i); return d; }); }
function addDays(s,n){ const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()+n); return fmt(d); }
function datesBetween(from,to){ const dates=[]; let cur=from; while(cur<=to){ dates.push(cur); cur=addDays(cur,1); } return dates; }
function daysUntil(s){ const diff=Math.round((new Date(s+"T12:00:00")-new Date())/86400000); if(diff===0)return"Heute"; if(diff===1)return"Morgen"; return`in ${diff} Tagen`; }

// ═══════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [session,setSession]   = useState(undefined);
  const [profile,setProfile]   = useState(null);
  const [screen,setScreen]     = useState("home"); // "home" | "booking" | "kasse" | "settings"

  useEffect(()=>{
    sb.auth.getSession().then(({data:{session}})=>setSession(session));
    const {data:{subscription}}=sb.auth.onAuthStateChange((_,session)=>setSession(session));
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session){ setProfile(null); return; }
    sb.from("profiles").select("*").eq("id",session.user.id).single().then(({data})=>setProfile(data));
  },[session]);

  if(session===undefined) return <Loading msg="Verbinde mit Datenbank…"/>;
  if(!session) return <LoginScreen/>;
  if(!profile) return <Loading msg="Lade Profil…"/>;

  if(screen==="booking")  return <BookingApp  profile={profile} onBack={()=>setScreen("home")}/>;
  if(screen==="kasse")    return <KasseApp    profile={profile} onBack={()=>setScreen("home")}/>;
  if(screen==="settings") return <SettingsApp profile={profile} onBack={()=>setScreen("home")}/>;
  return <HomeScreen profile={profile} onGoBooking={()=>setScreen("booking")} onGoKasse={()=>setScreen("kasse")} onGoSettings={()=>setScreen("settings")}/>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOME SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function HomeScreen({profile,onGoBooking,onGoKasse,onGoSettings}) {
  const [nextBookings,setNextBookings] = useState([]);
  const [openLog,setOpenLog]           = useState([]);
  const [openTotal,setOpenTotal]       = useState(0);
  useEffect(()=>{
    // next 2 bookings – nur reguläre Einzelbuchungen
    sb.from("bookings").select("*,courts(name,surface)").eq("user_id",profile.id).eq("type","regular").gte("date",today()).order("date").order("slot").limit(2)
      .then(({data})=>setNextBookings(data||[]));
    // open kasse items
    sb.from("kasse_log").select("*").eq("user_id",profile.id).eq("paid",false)
      .then(({data})=>{ setOpenLog(data||[]); setOpenTotal((data||[]).reduce((s,l)=>s+l.price,0)); });
  },[profile.id]);

  return (
    <div style={H.wrap}>
      <div style={H.glow}/>
      <div style={H.inner}>
        {/* Header */}
        <div style={H.header}>
          <TennisBall size={52}/>
          <h1 style={H.title}>Tennis Herrieden</h1>
          <p style={H.greeting}>Hallo, {profile.name} 👋</p>
        </div>

        {/* ── Widgets ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Next bookings */}
          <div style={H.widget} onClick={onGoBooking}>
            <div style={H.widgetLabel}>📅 Nächste Buchungen</div>
            {nextBookings.length===0
              ? <div style={{fontSize:13,color:"#475569",padding:"6px 0"}}>Keine bevorstehenden Buchungen</div>
              : nextBookings.map(b=>{
                  const t=BOOKING_TYPE_MAP[b.type]||BOOKING_TYPE_MAP.regular;
                  return (
                    <div key={b.id} style={H.bookingRow}>
                      <div style={{...H.bookingDot,background:t.color+"22",border:`1.5px solid ${t.color}44`}}>
                        <span style={{fontSize:15}}>{t.icon}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,color:"#F1F5F9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {b.label||b.courts?.name||"?"} · {b.slot} Uhr
                        </div>
                        <div style={{fontSize:11,color:"#64748B",marginTop:1}}>
                          {fmtDateShort(b.date)} · {b.courts?.name} · {b.courts?.surface}
                        </div>
                      </div>
                      <div style={{fontSize:11,fontWeight:700,color:t.color,background:t.color+"18",borderRadius:20,padding:"3px 8px",flexShrink:0}}>
                        {daysUntil(b.date)}
                      </div>
                    </div>
                  );
                })
            }
            <div style={H.widgetLink}>Alle anzeigen →</div>
          </div>

          {/* Open drinks – compact */}
          <div style={{...H.widgetCompact,...(openLog.length>0?H.widgetWarn:H.widgetOk)}} onClick={onGoKasse}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🧾</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.7}}>Offene Getränke</div>
                {openLog.length===0
                  ? <span style={{fontSize:13,fontWeight:700,color:"#4ADE80"}}>✅ Alles bezahlt</span>
                  : <span style={{fontSize:18,fontWeight:800,color:"#F59E0B"}}>{eur(openTotal)} <span style={{fontSize:12,fontWeight:500,color:"#92400E"}}>({openLog.length})</span></span>
                }
              </div>
              <span style={{fontSize:12,color:openLog.length>0?"#D97706":"#475569"}}>→</span>
            </div>
          </div>
        </div>

        {/* ── Nav tiles ── */}
        <div style={H.navGrid}>
          <button style={{...H.navTile,borderColor:"#22C55E33"}} onClick={onGoBooking}>
            <span style={{fontSize:28}}>📅</span>
            <span style={H.navTileLabel}>Buchungssystem</span>
            <span style={H.navTileSub}>Plätze reservieren</span>
          </button>
          <button style={{...H.navTile,borderColor:"#F59E0B33"}} onClick={onGoKasse}>
            <span style={{fontSize:28}}>🧾</span>
            <span style={H.navTileLabel}>Kasse</span>
            <span style={H.navTileSub}>Getränke & Abrechnung</span>
          </button>
          {profile.role==="admin"&&(
            <button style={{...H.navTile,borderColor:"#8B5CF633",gridColumn:"1 / -1"}} onClick={onGoSettings}>
              <span style={{fontSize:28}}>⚙️</span>
              <span style={H.navTileLabel}>Einstellungen</span>
              <span style={H.navTileSub}>Systemkonfiguration</span>
            </button>
          )}
        </div>

        {/* Logout */}
        <div style={{textAlign:"center",paddingBottom:8}}>
          <button style={H.logoutBtn} onClick={()=>sb.auth.signOut()}>Abmelden</button>
        </div>
      </div>

    </div>
  );
}

const H={
  wrap:         {minHeight:"100vh",background:"#0F172A",fontFamily:"'DM Sans',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",position:"relative",overflowX:"hidden"},
  glow:         {position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:600,height:300,background:"radial-gradient(ellipse at 50% 0%, #22C55E14, transparent 70%)",pointerEvents:"none"},
  inner:        {width:"100%",maxWidth:480,padding:"52px 20px 32px",display:"flex",flexDirection:"column",gap:20},
  header:       {textAlign:"center",paddingTop:16},
  title:        {fontSize:26,fontWeight:800,color:"#F8FAFC",letterSpacing:-.8,margin:"12px 0 4px"},
  greeting:     {color:"#475569",fontSize:14,margin:0},
  widget:       {background:"#1E293B",border:"1.5px solid #334155",borderRadius:14,padding:"16px 18px",cursor:"pointer",display:"flex",flexDirection:"column",gap:0},
  widgetCompact:{background:"#1E293B",border:"1.5px solid #334155",borderRadius:12,padding:"12px 16px",cursor:"pointer"},
  widgetWarn:   {borderColor:"#F59E0B55",background:"#1C1810"},
  widgetOk:     {borderColor:"#22C55E33"},
  widgetLabel:  {fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.8,marginBottom:10},
  widgetLink:   {fontSize:12,color:"#475569",marginTop:10,textAlign:"right"},
  bookingRow:   {display:"flex",alignItems:"center",gap:10,marginBottom:8},
  bookingDot:   {width:34,height:34,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  navGrid:      {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  navTile:      {background:"#1E293B",border:"1.5px solid #334155",borderRadius:12,padding:"18px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6},
  navTileLabel: {fontSize:14,fontWeight:700,color:"#94A3B8"},
  navTileSub:   {fontSize:11,color:"#475569"},
  logoutBtn:    {background:"none",border:"1px solid #1E293B",borderRadius:6,color:"#334155",cursor:"pointer",fontSize:12,padding:"6px 16px"},
};

// ═══════════════════════════════════════════════════════════════════════════
// BOOKING APP  (existing logic, wrapped with a back button)
// ═══════════════════════════════════════════════════════════════════════════
function BookingApp({profile,onBack}) {
  const [courts,setCourts]     = useState([]);
  const [bookings,setBookings] = useState([]);
  const [guestFee,setGuestFee] = useState(5.00);
  const [view,setView]         = useState("calendar");
  const [calMode,setCalMode]   = useState("week");
  const [weekBase,setWeekBase] = useState(new Date());
  const [dayBase,setDayBase]   = useState(today());
  const [selCourt,setSelCourt] = useState(null);
  const [toast,setToast]       = useState(null);
  const [modal,setModal]       = useState(null);

  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3200); };

  useEffect(()=>{
    sb.from("courts").select("*").order("sort_order").then(({data})=>{ setCourts(data||[]); setSelCourt(s=>s||(data?.[0]?.id||null)); });
    sb.from("settings").select("*").eq("key","guest_fee").single().then(({data})=>{ if(data) setGuestFee(parseFloat(data.value)||5); });
  },[]);

  const loadBookings=useCallback(async()=>{
    const from=addDays(today(),-30);
    const {data}=await sb.from("bookings").select("*").gte("date",from).order("date").order("slot");
    setBookings(data||[]);
  },[]);

  useEffect(()=>{ loadBookings(); },[loadBookings]);

  useEffect(()=>{
    const ch=sb.channel("bookings-live").on("postgres_changes",{event:"*",schema:"public",table:"bookings"},()=>loadBookings()).subscribe();
    return ()=>sb.removeChannel(ch);
  },[loadBookings]);

  const canMassBook=profile.role==="admin"||profile.role==="member2";
  const adaptedBookings=bookings.map(b=>({...b,courtId:b.court_id,userId:b.user_id,userName:b.user_name}));
  const adaptedData={bookings:adaptedBookings,courts};

  const bookSingle=async(courtId,date,slot,type="regular",label="",withGuest=false)=>{
    const {error}=await sb.from("bookings").insert({court_id:courtId,user_id:profile.id,user_name:profile.name,date,slot,type,label,with_guest:withGuest,guest_fee:withGuest?guestFee:0});
    if(error){ showToast(error.code==="23505"?"Dieser Slot ist bereits belegt.":error.message,"error"); return; }
    await loadBookings(); setModal(null);
    showToast(`${slot} Uhr auf ${courts.find(c=>c.id===courtId)?.name} gebucht ✓`);
  };
  const massBook=async({courtIds,dateFrom,dateTo,weekdays,slots,type,label})=>{
    const allDates=datesBetween(dateFrom,dateTo).filter(d=>weekdays.includes(dayOfWeek(d)));
    const rows=[];
    for(const date of allDates) for(const courtId of courtIds) for(const slot of slots)
      rows.push({court_id:courtId,user_id:profile.id,user_name:profile.name,date,slot,type,label,with_guest:false,guest_fee:0});
    let added=0;
    for(let i=0;i<rows.length;i+=50){
      const {data:ins}=await sb.from("bookings").upsert(rows.slice(i,i+50),{onConflict:"court_id,date,slot",ignoreDuplicates:true}).select();
      added+=(ins?.length||0);
    }
    await loadBookings(); showToast(`${added} Slots gebucht.`); setModal(null);
  };
  const cancel=async(bookingId)=>{
    const bk=bookings.find(b=>b.id===bookingId); if(!bk) return;
    if(bk.user_id!==profile.id&&profile.role!=="admin"){ showToast("Keine Berechtigung.","error"); return; }
    await sb.from("bookings").delete().eq("id",bookingId);
    await loadBookings(); showToast("Buchung storniert."); setModal(null);
  };
  const cancelMany=async(ids)=>{ await sb.from("bookings").delete().in("id",ids); await loadBookings(); showToast(`${ids.length} Buchungen storniert.`); };
  const markGuestPaid=async(userId)=>{
    await sb.from("bookings").update({guest_paid:true}).eq("user_id",userId).eq("with_guest",true).eq("guest_paid",false);
    await loadBookings(); showToast("Als bezahlt markiert ✓");
  };
  const addCourt=async(name,surface)=>{ await sb.from("courts").insert({name,surface,sort_order:courts.length+1}); const {data}=await sb.from("courts").select("*").order("sort_order"); setCourts(data||[]); showToast(`${name} hinzugefügt ✓`); };
  const updateCourt=async(id,name,surface)=>{ await sb.from("courts").update({name,surface}).eq("id",id); const {data}=await sb.from("courts").select("*").order("sort_order"); setCourts(data||[]); showToast("Aktualisiert ✓"); };
  const deleteCourt=async(id)=>{ await sb.from("courts").delete().eq("id",id); const {data}=await sb.from("courts").select("*").order("sort_order"); setCourts(data||[]); showToast("Gelöscht."); };
  const saveGuestFee=async(fee)=>{ await sb.from("settings").upsert({key:"guest_fee",value:String(fee)},{onConflict:"key"}); setGuestFee(fee); showToast(`Gebühr auf ${eur(fee)} gesetzt ✓`); };
  const deleteUser=async(uid)=>{ await sb.from("bookings").delete().eq("user_id",uid); await sb.from("profiles").delete().eq("id",uid); showToast("Gelöscht."); };

  const days=getWeekDays(weekBase);
  const navItems=[
    {id:"back",   icon:"🏠",label:"Startseite"},
    {id:"calendar",icon:"📅",label:"Buchungskalender"},
    {id:"myBookings",icon:"📋",label:"Meine Buchungen"},
    ...(canMassBook?[{id:"massbook",icon:"📆",label:"Massenbuchung"}]:[]),
    ...(profile.role==="admin"?[{id:"admin",icon:"⚙️",label:"Administration"}]:[]),
  ];

  const handleNav=(id)=>{ if(id==="back"){ onBack(); return; } setView(id); };

  return (
    <>
      <style>{`
        @media(max-width:767px){.desktop-sidebar{display:none!important}.mobile-bottom-nav{display:flex!important}.mobile-top-bar{display:flex!important}.app-main{padding-bottom:72px!important}}
        @media(min-width:768px){.desktop-sidebar{display:flex!important}.mobile-bottom-nav{display:none!important}.mobile-top-bar{display:none!important}}
      `}</style>
      <div style={S.shell}>
        <aside className="desktop-sidebar" style={{...S.sidebar,display:"none"}}>
          <div style={S.logo}><TennisBall size={28}/><span style={S.logoText}>Tennis Herrieden</span></div>
          <nav style={S.nav}>
            {navItems.map(item=>(<button key={item.id} style={{...S.navBtn,...(view===item.id?S.navBtnActive:{})}} onClick={()=>handleNav(item.id)}><span style={{fontSize:16}}>{item.icon}</span><span>{item.label}</span></button>))}
          </nav>
          <div style={S.sidebarBottom}>
            <div style={S.userChip}><Av name={profile.name}/><div><div style={{fontWeight:700,fontSize:13}}>{profile.name}</div><div style={{fontSize:11,color:"#6B7280"}}>{ROLE_LABELS[profile.role]}</div></div></div>
            <button style={S.logoutBtn} onClick={()=>sb.auth.signOut()}>Abmelden</button>
          </div>
        </aside>
        <main className="app-main" style={S.main}>
          <div className="mobile-top-bar" style={{display:"none",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#0F172A",position:"sticky",top:0,zIndex:50}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><TennisBall size={22}/><span style={{color:"#fff",fontWeight:800,fontSize:15}}>Tennis Herrieden</span></div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Av name={profile.name}/><button style={{background:"none",border:"1px solid #334155",borderRadius:6,color:"#94A3B8",cursor:"pointer",fontSize:12,padding:"5px 10px"}} onClick={()=>sb.auth.signOut()}>Abmelden</button></div>
          </div>
          {view==="calendar"&&<CalendarView data={adaptedData} user={profile} calMode={calMode} setCalMode={setCalMode} days={days} weekBase={weekBase} setWeekBase={setWeekBase} dayBase={dayBase} setDayBase={setDayBase} selCourt={selCourt||courts[0]?.id} setSelCourt={setSelCourt} onSlotClick={(courtId,date,slot,existing)=>setModal({type:"slot",courtId,date,slot,existing})}/>}
          {view==="myBookings"&&<MyBookings data={adaptedData} user={profile} onCancel={cancel} guestFee={guestFee} onMarkPaid={()=>markGuestPaid(profile.id)}/>}
          {view==="massbook"&&canMassBook&&<MassBookView data={adaptedData} user={profile} onMassBook={massBook} onCancelMany={cancelMany}/>}
          {view==="admin"&&profile.role==="admin"&&<AdminView data={adaptedData} allBookings={bookings} guestFee={guestFee} onSaveGuestFee={saveGuestFee} onAddCourt={addCourt} onUpdateCourt={updateCourt} onDeleteCourt={deleteCourt} onDeleteUser={deleteUser} onCancelBooking={cancel} onMarkPaid={markGuestPaid}/>}
        </main>
        <nav className="mobile-bottom-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"#0F172A",borderTop:"1px solid #1E293B",zIndex:100,justifyContent:"space-around",padding:"8px 0",paddingBottom:"env(safe-area-inset-bottom)"}}>
          {navItems.map(item=>(<button key={item.id} onClick={()=>handleNav(item.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8,color:view===item.id?"#4ADE80":"#64748B"}}><span style={{fontSize:22}}>{item.icon}</span><span style={{fontSize:10,fontWeight:600}}>{item.label.split(" ")[0]}</span></button>))}
        </nav>
        {modal?.type==="slot"&&<SlotModal modal={modal} data={adaptedData} user={profile} guestFee={guestFee} onBook={bookSingle} onCancel={cancel} onClose={()=>setModal(null)}/>}
        {toast&&<div style={{...S.toast,background:toast.type==="error"?"#EF4444":"#10B981"}}>{toast.msg}</div>}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KASSE APP
// ═══════════════════════════════════════════════════════════════════════════
function KasseApp({profile,onBack}) {
  const [tab,setTab]       = useState("drinks");
  const [favs,setFavs]     = useState([]);
  const [log,setLog]       = useState([]);
  const [toast,setToast]   = useState(null);

  const isAdmin = profile.role==="admin";
  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  const loadFavs = useCallback(async()=>{
    const {data}=await sb.from("kasse_favorites").select("*").eq("user_id",profile.id).order("sort_order");
    setFavs(data||[]);
  },[profile.id]);

  const loadLog = useCallback(async()=>{
    const q = isAdmin
      ? sb.from("kasse_log").select("*,profiles(name)").order("created_at",{ascending:false})
      : sb.from("kasse_log").select("*").eq("user_id",profile.id).order("created_at",{ascending:false});
    const {data}=await q;
    setLog(data||[]);
  },[profile.id,isAdmin]);

  useEffect(()=>{ loadFavs(); loadLog(); },[loadFavs,loadLog]);

  // ── Favorites CRUD ──
  const addFav=async(name,price,emoji)=>{
    await sb.from("kasse_favorites").insert({user_id:profile.id,name,price,emoji,sort_order:favs.length});
    await loadFavs();
  };
  const updateFav=async(id,name,price,emoji)=>{
    await sb.from("kasse_favorites").update({name,price,emoji}).eq("id",id);
    await loadFavs();
  };
  const deleteFav=async(id)=>{
    await sb.from("kasse_favorites").delete().eq("id",id);
    await loadFavs();
  };

  // ── Log drink (qty entries) ──
  const logDrink=async(name,price,emoji,qty=1)=>{
    const rows=Array.from({length:qty},()=>({user_id:profile.id,drink_name:name,price,emoji,qty:1,date:today(),paid:false}));
    await sb.from("kasse_log").insert(rows);
    await loadLog();
    const label=qty>1?`${qty}× ${name}`:name;
    showToast(`${emoji} ${label} notiert!`);
  };

  // ── Mark paid ──
  const markPaid=async(userId)=>{
    await sb.from("kasse_log").update({paid:true}).eq("user_id",userId).eq("paid",false);
    await loadLog(); showToast("Als bezahlt markiert ✓");
  };

  // ── Delete entry ──
  const deleteEntry=async(id)=>{
    await sb.from("kasse_log").delete().eq("id",id);
    await loadLog();
  };

  const myLog   = log.filter(l=>l.user_id===profile.id);
  const myOpen  = myLog.filter(l=>!l.paid);
  const myTotal = myOpen.reduce((s,l)=>s+l.price,0);

  const tabs=[
    {id:"drinks",  label:"Getränke",      icon:"🥤"},
    {id:"log",     label:"Meine Notizen", icon:"📋"},
    {id:"settings",label:"Einstellungen", icon:"⚙️"},
    ...(isAdmin?[{id:"admin",label:"Übersicht",icon:"👁️"}]:[]),
  ];

  return (
    <>
      <style>{`
        @media(max-width:767px){.k-sidebar{display:none!important}.k-bottom-nav{display:flex!important}.k-top-bar{display:flex!important}.k-main{padding-bottom:72px!important}}
        @media(min-width:768px){.k-sidebar{display:flex!important}.k-bottom-nav{display:none!important}.k-top-bar{display:none!important}}
      `}</style>
      <div style={S.shell}>
        <aside className="k-sidebar" style={{...K.sidebar,display:"none"}}>
          <button style={K.backBtn} onClick={onBack}>← Startseite</button>
          <div style={K.logo}>
            <div style={{fontSize:24}}>🧾</div>
            <div style={{fontWeight:800,color:"#F8FAFC",fontSize:15}}>Kasse</div>
          </div>
          {myOpen.length>0&&(
            <div style={K.openChip}>
              <div style={{fontSize:10,color:"#D97706",fontWeight:700}}>OFFEN</div>
              <div style={{fontWeight:800,fontSize:20,color:"#F59E0B"}}>{eur(myTotal)}</div>
              <div style={{fontSize:10,color:"#92400E"}}>{myOpen.length} Getränke</div>
            </div>
          )}
          <nav style={{marginTop:12}}>
            {tabs.map(t=>(<button key={t.id} style={{...S.navBtn,...(tab===t.id?S.navBtnActive:{})}} onClick={()=>setTab(t.id)}><span style={{fontSize:15}}>{t.icon}</span><span>{t.label}</span></button>))}
          </nav>
          <div style={S.sidebarBottom}>
            <div style={S.userChip}><Av name={profile.name}/><div><div style={{fontWeight:700,fontSize:13}}>{profile.name}</div><div style={{fontSize:11,color:"#6B7280"}}>{ROLE_LABELS[profile.role]}</div></div></div>
            <button style={S.logoutBtn} onClick={()=>sb.auth.signOut()}>Abmelden</button>
          </div>
        </aside>

        <main className="k-main" style={S.main}>
          <div className="k-top-bar" style={{display:"none",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#0F172A",position:"sticky",top:0,zIndex:50}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <button style={{background:"none",border:"none",color:"#94A3B8",cursor:"pointer",fontSize:13,fontWeight:600,padding:0}} onClick={onBack}>← Startseite</button>
            </div>
            <span style={{color:"#fff",fontWeight:800,fontSize:15}}>🧾 Kasse</span>
            {myOpen.length>0
              ? <span style={{fontSize:13,fontWeight:700,color:"#F59E0B"}}>{eur(myTotal)}</span>
              : <span style={{fontSize:13,color:"#475569"}}>{profile.name}</span>
            }
          </div>

          {tab==="drinks"  &&<KasseDrinksTab  favs={favs} onLogDrink={logDrink} onGoSettings={()=>setTab("settings")}/>}
          {tab==="log"     &&<KasseLogTab     myLog={myLog} myOpen={myOpen} myTotal={myTotal} onMarkPaid={()=>markPaid(profile.id)} onDeleteEntry={deleteEntry} onLogDrink={logDrink}/>}
          {tab==="settings"&&<KasseSettingsTab favs={favs} onAddFav={addFav} onUpdateFav={updateFav} onDeleteFav={deleteFav}/>}
          {tab==="admin"&&isAdmin&&<KasseAdminTab log={log} onMarkPaid={markPaid}/>}
        </main>

        <nav className="k-bottom-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"#0F172A",borderTop:"1px solid #1E293B",zIndex:100,justifyContent:"space-around",padding:"8px 0",paddingBottom:"env(safe-area-inset-bottom)"}}>
          <button onClick={onBack} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8,color:"#64748B"}}><span style={{fontSize:22}}>🏠</span><span style={{fontSize:10,fontWeight:600}}>Start</span></button>
          {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8,color:tab===t.id?"#4ADE80":"#64748B"}}><span style={{fontSize:22}}>{t.icon}</span><span style={{fontSize:10,fontWeight:600}}>{t.label.split(" ")[0]}</span></button>))}
        </nav>

        {toast&&<div style={{...S.toast,background:toast.type==="error"?"#EF4444":"#10B981"}}>{toast.msg}</div>}
      </div>
    </>
  );
}

// ── DRINKS TAB ────────────────────────────────────────────────────────────
function KasseDrinksTab({favs,onLogDrink,onGoSettings}) {
  const [quickModal,setQuickModal] = useState(false);
  const [confirmed,setConfirmed]   = useState(null);
  const [pending,setPending]       = useState(null);
  const [qtys,setQtys]             = useState({});

  const getQty=(id)=>qtys[id]||1;
  const setQty=(id,val)=>setQtys(prev=>({...prev,[id]:Math.max(1,val)}));

  const handleTap=(f)=>setPending(f.id);
  const handleConfirm=(f)=>{
    const q=getQty(f.id);
    onLogDrink(f.name,f.price,f.emoji,q);
    setPending(null); setConfirmed(f.id);
    setQtys(prev=>({...prev,[f.id]:1}));
    setTimeout(()=>setConfirmed(null),1200);
  };

  return (
    <div style={K.page}>
      <div style={{marginBottom:20}}>
        <h1 style={S.pageTitle}>Getränke</h1>
        <p style={S.pageSub}>Tippe zum Notieren · wird in „Meine Notizen" gelistet</p>
      </div>

      {favs.length===0?(
        <div style={{...S.card,textAlign:"center",padding:"40px 20px",borderStyle:"dashed"}}>
          <div style={{fontSize:40,marginBottom:12}}>🥤</div>
          <div style={{fontWeight:700,marginBottom:6}}>Noch keine Favoriten</div>
          <div style={{fontSize:13,color:"#9CA3AF",marginBottom:16}}>Hinterlege deine Lieblingsgetränke unter Einstellungen.</div>
          <button style={S.primaryBtn} onClick={onGoSettings}>Favoriten einrichten →</button>
        </div>
      ):(
        <div style={K.drinkGrid}>
          {/* Anderes – immer zuerst */}
          <div style={{...K.drinkTile,borderStyle:"dashed",borderColor:"#D1D5DB",background:"#FAFAFA",cursor:"pointer"}} onClick={()=>setQuickModal(true)}>
            <span style={{fontSize:38,lineHeight:1,color:"#9CA3AF"}}>＋</span>
            <span style={{fontWeight:700,fontSize:13,color:"#9CA3AF",marginTop:4}}>Anderes</span>
            <span style={{fontSize:12,color:"#D1D5DB",fontWeight:500}}>Einmalig</span>
            <div style={{...K.qtyRow,visibility:"hidden"}}><button style={K.qtyBtn}>−</button><span style={K.qtyVal}>1</span><button style={K.qtyBtn}>+</button></div>
            <button style={{...K.notierBtn,background:"#F3F4F6",color:"#9CA3AF"}}>Notieren</button>
          </div>

          {favs.map(f=>{
            const done=confirmed===f.id;
            const isPend=pending===f.id;
            const q=getQty(f.id);
            return (
              <div key={f.id} style={{...K.drinkTile,...(done?K.drinkTileDone:isPend?K.drinkTilePend:{})}}>
                <span style={{fontSize:38,lineHeight:1}}>{done?"✓":f.emoji}</span>
                <span style={{fontWeight:700,fontSize:13,color:done?"#4ADE80":isPend?"#92400E":"#111827",marginTop:4}}>{f.name}</span>
                <span style={{fontSize:14,fontWeight:800,color:done?"#4ADE80":isPend?"#D97706":"#22C55E"}}>
                  {q>1?`${q}× ${eur(f.price)}`:eur(f.price)}
                </span>
                {isPend?(
                  <>
                    <div style={{fontSize:11,color:"#92400E",fontWeight:700,marginTop:4,textAlign:"center"}}>Wirklich notieren?</div>
                    <div style={{display:"flex",gap:5,width:"100%",marginTop:4}}>
                      <button style={{...K.notierBtn,flex:1,background:"#22C55E",color:"#fff"}} onClick={()=>handleConfirm(f)}>✓ Ja</button>
                      <button style={{...K.notierBtn,flex:1,background:"#F3F4F6",color:"#6B7280"}} onClick={()=>setPending(null)}>✕ Nein</button>
                    </div>
                  </>
                ):(
                  <>
                    <div style={K.qtyRow} onClick={e=>e.stopPropagation()}>
                      <button style={K.qtyBtn} onClick={()=>setQty(f.id,q-1)}>−</button>
                      <span style={K.qtyVal}>{q}</span>
                      <button style={K.qtyBtn} onClick={()=>setQty(f.id,q+1)}>+</button>
                    </div>
                    <button style={{...K.notierBtn,...(done?{background:"#4ADE80",color:"#fff"}:{})}} onClick={()=>handleTap(f)}>
                      {done?"✓ Notiert":q>1?`${q}× notieren`:"Notieren"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {quickModal&&<KasseQuickModal onLog={(n,p,e,q)=>{onLogDrink(n,p,e,q);setQuickModal(false);}} onClose={()=>setQuickModal(false)}/>}
    </div>
  );
}

// ── LOG TAB ────────────────────────────────────────────────────────────────
function KasseLogTab({myLog,myOpen,myTotal,onMarkPaid,onDeleteEntry,onLogDrink}) {
  const [quickModal,setQuickModal]   = useState(false);
  const [showPaid,setShowPaid]       = useState(false);
  const [showConfirm,setShowConfirm] = useState(false);

  const paid=myLog.filter(l=>l.paid);
  const byDate={};
  for(const l of myOpen){ if(!byDate[l.date])byDate[l.date]=[]; byDate[l.date].push(l); }
  const sortedDates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));

  return (
    <div style={K.page}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div><h1 style={S.pageTitle}>Meine Notizen</h1><p style={S.pageSub}>Noch nicht bezahlt</p></div>
        <button style={S.primaryBtn} onClick={()=>setQuickModal(true)}>+ Eintragen</button>
      </div>

      {myOpen.length>0&&(
        <div style={K.summaryBar}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8"}}>OFFEN</div>
            <div style={{fontSize:28,fontWeight:800,color:"#F59E0B"}}>{eur(myTotal)}</div>
            <div style={{fontSize:12,color:"#64748B"}}>{myOpen.length} Getränke</div>
          </div>
          <button style={K.payBtn} onClick={()=>setShowConfirm(true)}>✓ Als bezahlt<br/>markieren</button>
        </div>
      )}

      {myOpen.length===0&&!showPaid&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"#9CA3AF"}}>
          <div style={{fontSize:44}}>✅</div>
          <div style={{fontWeight:700,marginTop:8,color:"#374151"}}>Alles bezahlt!</div>
        </div>
      )}

      {sortedDates.map(date=>(
        <div key={date} style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>{fmtDateShort(date)}</div>
          {byDate[date].map(entry=>(
            <div key={entry.id} style={{...S.card,borderLeft:"4px solid #F59E0B",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:24}}>{entry.emoji}</span>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{entry.drink_name}</div></div>
              <div style={{fontWeight:800,fontSize:15}}>{eur(entry.price)}</div>
              <button style={{background:"none",border:"none",color:"#D1D5DB",cursor:"pointer",fontSize:14,fontWeight:700}} onClick={()=>onDeleteEntry(entry.id)}>✕</button>
            </div>
          ))}
          <div style={{fontSize:12,color:"#6B7280",textAlign:"right",marginTop:4,paddingRight:36}}>
            Summe: <strong>{eur(byDate[date].reduce((s,l)=>s+l.price,0))}</strong>
          </div>
        </div>
      ))}

      {paid.length>0&&(
        <div style={{marginTop:8}}>
          <button style={{background:"none",border:"none",color:"#9CA3AF",cursor:"pointer",fontSize:13,padding:"4px 0",marginBottom:8}} onClick={()=>setShowPaid(p=>!p)}>
            {showPaid?"▲ Bezahlte ausblenden":`▼ Bezahlte anzeigen (${paid.length})`}
          </button>
          {showPaid&&paid.map(entry=>(
            <div key={entry.id} style={{...S.card,borderLeft:"4px solid #D1D5DB",display:"flex",alignItems:"center",gap:12,opacity:.6}}>
              <span style={{fontSize:24}}>{entry.emoji}</span>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{entry.drink_name}</div><div style={{fontSize:11,color:"#9CA3AF"}}>Bezahlt ✓</div></div>
              <div style={{fontWeight:800,fontSize:15,color:"#9CA3AF"}}>{eur(entry.price)}</div>
            </div>
          ))}
        </div>
      )}

      {quickModal&&<KasseQuickModal onLog={(n,p,e,q)=>{onLogDrink(n,p,e,q);setQuickModal(false);}} onClose={()=>setQuickModal(false)}/>}

      {showConfirm&&(
        <div style={S.overlay} onClick={()=>setShowConfirm(false)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHeader}><div style={S.modalTitle}>Bezahlung bestätigen</div><button style={S.closeBtn} onClick={()=>setShowConfirm(false)}>✕</button></div>
            <p style={{color:"#6B7280",fontSize:13,marginBottom:16}}>Bitte bestätige, dass du die Getränke beim Kassenwart bezahlt hast.</p>
            <div style={{background:"#FEF3C7",borderRadius:10,padding:14,textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:11,color:"#92400E",fontWeight:700,marginBottom:4}}>BETRAG</div>
              <div style={{fontSize:32,fontWeight:800}}>{eur(myTotal)}</div>
              <div style={{fontSize:12,color:"#6B7280",marginTop:4}}>{myOpen.length} Getränke</div>
            </div>
            <button style={{...S.primaryBtn,width:"100%",background:"#22C55E",color:"#fff",marginBottom:8}} onClick={()=>{onMarkPaid();setShowConfirm(false);}}>✓ Ja, bezahlt</button>
            <button style={{...S.ghostBtn,width:"100%"}} onClick={()=>setShowConfirm(false)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SETTINGS TAB ──────────────────────────────────────────────────────────
function KasseSettingsTab({favs,onAddFav,onUpdateFav,onDeleteFav}) {
  const [showForm,setShowForm] = useState(false);
  const [editId,setEditId]     = useState(null);
  const [name,setName]         = useState("");
  const [price,setPrice]       = useState("");
  const [emoji,setEmoji]       = useState("🥤");

  const openAdd=()=>{ setEditId(null);setName("");setPrice("");setEmoji("🥤");setShowForm(true); };
  const openEdit=(f)=>{ setEditId(f.id);setName(f.name);setPrice(String(f.price).replace(".",","));setEmoji(f.emoji);setShowForm(true); };
  const handleSave=()=>{
    const p=parseFloat(price.replace(",","."));
    if(!name||isNaN(p)) return;
    if(editId) onUpdateFav(editId,name,p,emoji); else onAddFav(name,p,emoji);
    setShowForm(false);
  };

  return (
    <div style={K.page}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div><h1 style={S.pageTitle}>Meine Favoriten</h1><p style={S.pageSub}>Erscheinen als Schnell-Kacheln unter Getränke</p></div>
        <button style={S.primaryBtn} onClick={openAdd}>+ Hinzufügen</button>
      </div>

      {showForm&&(
        <div style={{...S.card,borderLeft:"4px solid #22C55E",marginBottom:20}}>
          <div style={{fontWeight:700,marginBottom:14}}>{editId?"Getränk bearbeiten":"Neues Lieblingsgetränk"}</div>
          <div style={{marginBottom:12}}>
            <Lbl>Emoji</Lbl>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {KASSE_EMOJIS.map(e=>(<button key={e} onClick={()=>setEmoji(e)} style={{fontSize:18,padding:"4px 6px",border:`2px solid ${emoji===e?"#22C55E":"#E5E7EB"}`,borderRadius:6,background:emoji===e?"#DCFCE7":"#fff",cursor:"pointer"}}>{e}</button>))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:10,alignItems:"flex-end"}}>
            <div><Lbl>Name</Lbl><input placeholder="z.B. Cola" value={name} onChange={e=>setName(e.target.value)} style={S.input}/></div>
            <div style={{width:90}}><Lbl>Preis (€)</Lbl><input placeholder="2,00" value={price} onChange={e=>setPrice(e.target.value)} style={S.input} inputMode="decimal"/></div>
            <div style={{display:"flex",gap:6}}>
              <button style={S.primaryBtn} onClick={handleSave}>{editId?"Speichern":"Hinzufügen"}</button>
              <button style={S.cancelBtn} onClick={()=>setShowForm(false)}>✕</button>
            </div>
          </div>
        </div>
      )}

      {favs.length===0&&!showForm&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"#9CA3AF"}}>
          <div style={{fontSize:36}}>🥤</div>
          <div style={{marginTop:8}}>Noch keine Favoriten</div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
        {favs.map(f=>(
          <div key={f.id} style={{...S.card,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:30}}>{f.emoji}</span>
            <div style={{flex:1}}><div style={{fontWeight:700}}>{f.name}</div><div style={{fontSize:13,color:"#6B7280"}}>{eur(f.price)}</div></div>
            <div style={{display:"flex",gap:4}}>
              <button style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,cursor:"pointer",fontSize:14,padding:"4px 7px"}} onClick={()=>openEdit(f)}>✏️</button>
              <button style={{...S.cancelBtn,padding:"4px 8px",fontSize:13}} onClick={()=>onDeleteFav(f.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ADMIN TAB ──────────────────────────────────────────────────────────────
function KasseAdminTab({log,onMarkPaid}) {
  const [subtab,setSubtab]     = useState("open");
  const [profiles,setProfiles] = useState([]);
  const [confirmPay,setConfirmPay] = useState(null);

  useEffect(()=>{ sb.from("profiles").select("*").then(({data})=>setProfiles(data||[])); },[]);

  const getName=(uid)=>profiles.find(p=>p.id===uid)?.name||"Unbekannt";
  const userIds=[...new Set(log.map(l=>l.user_id))];
  const userStats=userIds.map(uid=>{
    const open=log.filter(l=>l.user_id===uid&&!l.paid);
    const paid=log.filter(l=>l.user_id===uid&&l.paid);
    return { uid, name:getName(uid), openCount:open.length, openTotal:open.reduce((s,l)=>s+l.price,0), paidTotal:paid.reduce((s,l)=>s+l.price,0), openItems:open };
  });
  const totalOpen=userStats.reduce((s,u)=>s+u.openTotal,0);

  return (
    <div style={K.page}>
      <h1 style={S.pageTitle}>Kassenverwaltung</h1>
      <p style={S.pageSub}>Übersicht für Administratoren</p>

      <div style={{background:"#0F172A",borderRadius:12,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:16,marginTop:16}}>
        <div>
          <div style={{fontSize:11,color:"#94A3B8",fontWeight:700}}>GESAMT OFFEN</div>
          <div style={{fontSize:30,fontWeight:800,color:"#F59E0B"}}>{eur(totalOpen)}</div>
        </div>
        <div style={{fontSize:12,color:"#475569",borderLeft:"1px solid #334155",paddingLeft:16}}>
          {userStats.filter(u=>u.openCount>0).length} Mitglieder mit offenen Getränken
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["open","Offene Beträge"],["history","Historie"]].map(([id,l])=>(<button key={id} style={{...S.tabBtn,...(subtab===id?S.tabBtnActive:{})}} onClick={()=>setSubtab(id)}>{l}</button>))}
      </div>

      {subtab==="open"&&userStats.filter(u=>u.openCount>0).map(u=>(
        <div key={u.uid} style={{...S.card,borderLeft:"4px solid #F59E0B",marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>{u.name}</div>
              <div style={{fontSize:12,color:"#6B7280"}}>{u.openCount} offene Getränke</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontWeight:800,fontSize:20,color:"#D97706"}}>{eur(u.openTotal)}</div>
              <button style={{fontSize:11,padding:"3px 8px",background:"#DCFCE7",color:"#16A34A",border:"none",borderRadius:20,cursor:"pointer",fontWeight:700,marginTop:3}} onClick={()=>setConfirmPay(u)}>Als bezahlt markieren</button>
            </div>
          </div>
          <div style={{borderTop:"1px solid #F3F4F6",paddingTop:8,display:"flex",flexWrap:"wrap",gap:6}}>
            {u.openItems.map(item=>(<div key={item.id} style={{fontSize:12,background:"#FEF3C7",borderRadius:20,padding:"3px 10px",color:"#92400E",fontWeight:600}}>{item.emoji} {item.drink_name} · {eur(item.price)}</div>))}
          </div>
        </div>
      ))}
      {subtab==="open"&&userStats.filter(u=>u.openCount>0).length===0&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"#9CA3AF"}}><div style={{fontSize:36}}>✅</div><div style={{marginTop:8}}>Alle auf dem neusten Stand!</div></div>
      )}

      {subtab==="history"&&userStats.map(u=>(
        <div key={u.uid} style={{...S.card,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontWeight:700}}>{u.name}</div>
          <div style={{display:"flex",gap:16,fontSize:13}}>
            <div style={{color:"#D97706",fontWeight:700}}>{eur(u.openTotal)} offen</div>
            <div style={{color:"#22C55E",fontWeight:700}}>{eur(u.paidTotal)} bezahlt</div>
          </div>
        </div>
      ))}

      {confirmPay&&(
        <div style={S.overlay} onClick={()=>setConfirmPay(null)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHeader}><div style={S.modalTitle}>Zahlung bestätigen</div><button style={S.closeBtn} onClick={()=>setConfirmPay(null)}>✕</button></div>
            <p style={{color:"#6B7280",fontSize:13,marginBottom:16}}>{confirmPay.name} als bezahlt markieren?</p>
            <div style={{background:"#FEF3C7",borderRadius:10,padding:14,textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:11,color:"#92400E",fontWeight:700,marginBottom:4}}>BETRAG</div>
              <div style={{fontSize:32,fontWeight:800}}>{eur(confirmPay.openTotal)}</div>
            </div>
            <button style={{...S.primaryBtn,width:"100%",background:"#22C55E",color:"#fff",marginBottom:8}} onClick={()=>{onMarkPaid(confirmPay.uid);setConfirmPay(null);}}>✓ Als bezahlt markieren</button>
            <button style={{...S.ghostBtn,width:"100%"}} onClick={()=>setConfirmPay(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── QUICK LOG MODAL ────────────────────────────────────────────────────────
function KasseQuickModal({onLog,onClose}) {
  const [name,setName]   = useState("");
  const [price,setPrice] = useState("");
  const [emoji,setEmoji] = useState("🥤");
  const [qty,setQty]     = useState(1);

  const handle=()=>{
    const p=parseFloat(price.replace(",","."));
    if(isNaN(p)||p<=0) return;
    onLog(name.trim()||"Getränk",p,emoji,qty);
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHeader}><div style={S.modalTitle}>Getränk notieren</div><button style={S.closeBtn} onClick={onClose}>✕</button></div>
        <div style={{marginBottom:14}}>
          <Lbl>Emoji</Lbl>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {KASSE_EMOJIS.map(e=>(<button key={e} onClick={()=>setEmoji(e)} style={{fontSize:18,padding:"4px 6px",border:`2px solid ${emoji===e?"#22C55E":"#E5E7EB"}`,borderRadius:6,background:emoji===e?"#DCFCE7":"#fff",cursor:"pointer"}}>{e}</button>))}
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <Lbl>Name <span style={{color:"#9CA3AF",fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional)</span></Lbl>
          <input placeholder="z.B. Bier" value={name} onChange={e=>setName(e.target.value)} style={S.input}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,marginBottom:16,alignItems:"flex-end"}}>
          <div>
            <Lbl>Preis pro Stück (€) <span style={{color:"#EF4444"}}>*</span></Lbl>
            <input placeholder="2,50" value={price} onChange={e=>setPrice(e.target.value)} style={S.input} inputMode="decimal"/>
          </div>
          <div>
            <Lbl>Anzahl</Lbl>
            <div style={{display:"flex",alignItems:"center",border:"1.5px solid #E5E7EB",borderRadius:8,overflow:"hidden",height:40}}>
              <button style={{width:36,height:"100%",border:"none",background:"#F3F4F6",color:"#374151",fontSize:18,fontWeight:700,cursor:"pointer"}} onClick={()=>setQty(q=>Math.max(1,q-1))}>−</button>
              <span style={{width:36,textAlign:"center",fontWeight:800,fontSize:16}}>{qty}</span>
              <button style={{width:36,height:"100%",border:"none",background:"#F3F4F6",color:"#374151",fontSize:18,fontWeight:700,cursor:"pointer"}} onClick={()=>setQty(q=>q+1)}>+</button>
            </div>
          </div>
        </div>
        {price&&!isNaN(parseFloat(price.replace(",","."))&&(
          <div style={{background:"#F9FAFB",borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",justifyContent:"space-between",fontSize:13}}>
            <span style={{color:"#6B7280"}}>{qty}× {eur(parseFloat(price.replace(",",".")))}</span>
            <span style={{fontWeight:800}}>= {eur(qty*parseFloat(price.replace(",",".")))}</span>
          </div>
        ))}
        <button style={{...S.primaryBtn,width:"100%",opacity:(!price||isNaN(parseFloat(price.replace(",","."))))?0.4:1}} onClick={handle}>Notieren</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS APP
// ═══════════════════════════════════════════════════════════════════════════
function SettingsApp({profile,onBack}) {
  const [tab,setTab]       = useState("booking");
  const [toast,setToast]   = useState(null);
  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  const tabs=[
    {id:"booking", label:"Buchung",   icon:"📅"},
    {id:"courts",  label:"Plätze",    icon:"🎾"},
    {id:"members", label:"Mitglieder",icon:"👤"},
    {id:"display", label:"Display",   icon:"🖥️"},
  ];

  return (
    <>
      <style>{`
        @media(max-width:767px){.cfg-sidebar{display:none!important}.cfg-bottom-nav{display:flex!important}.cfg-top-bar{display:flex!important}.cfg-main{padding-bottom:72px!important}}
        @media(min-width:768px){.cfg-sidebar{display:flex!important}.cfg-bottom-nav{display:none!important}.cfg-top-bar{display:none!important}}
      `}</style>
      <div style={S.shell}>
        <aside className="cfg-sidebar" style={{...K.sidebar,display:"none"}}>
          <button style={K.backBtn} onClick={onBack}>← Startseite</button>
          <div style={K.logo}>
            <div style={{fontSize:24}}>⚙️</div>
            <div style={{fontWeight:800,color:"#F8FAFC",fontSize:15}}>Einstellungen</div>
          </div>
          <nav style={{marginTop:12}}>
            {tabs.map(t=>(<button key={t.id} style={{...S.navBtn,...(tab===t.id?S.navBtnActive:{})}} onClick={()=>setTab(t.id)}><span style={{fontSize:15}}>{t.icon}</span><span>{t.label}</span></button>))}
          </nav>
          <div style={S.sidebarBottom}>
            <div style={S.userChip}><Av name={profile.name}/><div><div style={{fontWeight:700,fontSize:13}}>{profile.name}</div><div style={{fontSize:11,color:"#6B7280"}}>{ROLE_LABELS[profile.role]}</div></div></div>
            <button style={S.logoutBtn} onClick={()=>sb.auth.signOut()}>Abmelden</button>
          </div>
        </aside>

        <main className="cfg-main" style={S.main}>
          <div className="cfg-top-bar" style={{display:"none",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#0F172A",position:"sticky",top:0,zIndex:50}}>
            <button style={{background:"none",border:"none",color:"#94A3B8",cursor:"pointer",fontSize:13,fontWeight:600,padding:0}} onClick={onBack}>← Startseite</button>
            <span style={{color:"#fff",fontWeight:800,fontSize:15}}>⚙️ Einstellungen</span>
            <span style={{width:80}}/>
          </div>

          {tab==="booking" &&<SettingsBookingTab onToast={showToast}/>}
          {tab==="courts"  &&<SettingsCourtsTab  onToast={showToast}/>}
          {tab==="members" &&<SettingsMembersTab onToast={showToast}/>}
          {tab==="display" &&<SettingsDisplayTab onToast={showToast}/>}
        </main>

        <nav className="cfg-bottom-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"#0F172A",borderTop:"1px solid #1E293B",zIndex:100,justifyContent:"space-around",padding:"8px 0",paddingBottom:"env(safe-area-inset-bottom)"}}>
          <button onClick={onBack} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8,color:"#64748B"}}><span style={{fontSize:22}}>🏠</span><span style={{fontSize:10,fontWeight:600}}>Start</span></button>
          {tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8,color:tab===t.id?"#8B5CF6":"#64748B"}}><span style={{fontSize:22}}>{t.icon}</span><span style={{fontSize:10,fontWeight:600}}>{t.label.split(" ")[0]}</span></button>))}
        </nav>

        {toast&&<div style={{...S.toast,background:toast.type==="error"?"#EF4444":"#10B981"}}>{toast.msg}</div>}
      </div>
    </>
  );
}

// ── SETTINGS: BUCHUNG ─────────────────────────────────────────────────────
function SettingsBookingTab({onToast}) {
  const [guestFee,setGuestFee]   = useState("");
  const [saving,setSaving]       = useState(false);
  const [loaded,setLoaded]       = useState(false);

  useEffect(()=>{
    sb.from("settings").select("*").eq("key","guest_fee").single()
      .then(({data})=>{ setGuestFee(data?String(parseFloat(data.value)||5).replace(".",","):"5,00"); setLoaded(true); });
  },[]);

  const save=async()=>{
    const fee=parseFloat(guestFee.replace(",","."));
    if(isNaN(fee)||fee<0) return;
    setSaving(true);
    await sb.from("settings").upsert({key:"guest_fee",value:String(fee)},{onConflict:"key"});
    setSaving(false);
    onToast(`Gästegebühr auf ${eur(fee)} gesetzt ✓`);
  };

  return (
    <div style={K.page}>
      <h1 style={S.pageTitle}>Buchungseinstellungen</h1>
      <p style={S.pageSub}>Übergreifende Parameter für das Buchungssystem</p>

      <div style={{...S.card,borderLeft:"4px solid #8B5CF6",marginTop:20}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Gästegebühr</div>
        <div style={{fontSize:13,color:"#6B7280",marginBottom:16}}>Betrag pro Buchung mit Gastspieler – wird am Jahresende abgerechnet</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:12}}>
          <div style={{flex:1,maxWidth:160}}>
            <Lbl>Betrag (€)</Lbl>
            <input value={guestFee} onChange={e=>setGuestFee(e.target.value)} style={S.input} inputMode="decimal" placeholder="5,00" disabled={!loaded}/>
          </div>
          <button style={{...S.primaryBtn,background:"#8B5CF6",marginBottom:1,opacity:saving?0.6:1}} onClick={save} disabled={saving}>
            {saving?"Speichern…":"Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS: PLÄTZE ──────────────────────────────────────────────────────
function SettingsCourtsTab({onToast}) {
  const [courts,setCourts] = useState([]);
  const [showForm,setShowForm] = useState(false);
  const [editId,setEditId]   = useState(null);
  const [name,setName]       = useState("");
  const [surface,setSurface] = useState("");

  const load=async()=>{ const {data}=await sb.from("courts").select("*").order("sort_order"); setCourts(data||[]); };
  useEffect(()=>{ load(); },[]);

  const openAdd=()=>{ setEditId(null);setName("");setSurface("");setShowForm(true); };
  const openEdit=(c)=>{ setEditId(c.id);setName(c.name);setSurface(c.surface);setShowForm(true); };
  const handleSave=async()=>{
    if(!name.trim()) return;
    if(editId){ await sb.from("courts").update({name:name.trim(),surface:surface.trim()}).eq("id",editId); onToast("Platz aktualisiert ✓"); }
    else { await sb.from("courts").insert({name:name.trim(),surface:surface.trim(),sort_order:courts.length+1}); onToast(`${name} hinzugefügt ✓`); }
    setShowForm(false); load();
  };
  const handleDelete=async(id,cname)=>{
    if(!window.confirm(`Platz „${cname}" wirklich löschen?`)) return;
    await sb.from("courts").delete().eq("id",id);
    onToast("Gelöscht."); load();
  };

  return (
    <div style={K.page}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div><h1 style={S.pageTitle}>Platzverwaltung</h1><p style={S.pageSub}>Tennisplätze anlegen und bearbeiten</p></div>
        <button style={{...S.primaryBtn,background:"#8B5CF6"}} onClick={openAdd}>+ Hinzufügen</button>
      </div>

      {showForm&&(
        <div style={{...S.card,borderLeft:"4px solid #8B5CF6",marginBottom:20}}>
          <div style={{fontWeight:700,marginBottom:14}}>{editId?"Platz bearbeiten":"Neuer Platz"}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,alignItems:"flex-end"}}>
            <div><Lbl>Name</Lbl><input placeholder="z.B. Platz 1" value={name} onChange={e=>setName(e.target.value)} style={S.input}/></div>
            <div><Lbl>Belag</Lbl><input placeholder="z.B. Sand" value={surface} onChange={e=>setSurface(e.target.value)} style={S.input}/></div>
            <div style={{display:"flex",gap:6}}>
              <button style={{...S.primaryBtn,background:"#8B5CF6"}} onClick={handleSave}>{editId?"Speichern":"Hinzufügen"}</button>
              <button style={S.cancelBtn} onClick={()=>setShowForm(false)}>✕</button>
            </div>
          </div>
        </div>
      )}

      {courts.length===0&&!showForm&&(
        <div style={{textAlign:"center",padding:"40px 0",color:"#9CA3AF"}}><div style={{fontSize:36}}>🎾</div><div style={{marginTop:8}}>Noch keine Plätze angelegt</div></div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {courts.map((c,i)=>(
          <div key={c.id} style={{...S.card,display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:COURT_COLORS[i%COURT_COLORS.length],flexShrink:0}}/>
            <div style={{flex:1}}><div style={{fontWeight:700}}>{c.name}</div><div style={{fontSize:12,color:"#6B7280"}}>{c.surface}</div></div>
            <div style={{display:"flex",gap:6}}>
              <button style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,cursor:"pointer",fontSize:14,padding:"4px 7px"}} onClick={()=>openEdit(c)}>✏️</button>
              <button style={{...S.cancelBtn,padding:"4px 8px",fontSize:13}} onClick={()=>handleDelete(c.id,c.name)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SETTINGS: MITGLIEDER ──────────────────────────────────────────────────
function SettingsMembersTab({onToast}) {
  const [members,setMembers]   = useState([]);
  const [saving,setSaving]     = useState(null);

  const load=async()=>{ const {data}=await sb.from("profiles").select("*").order("name"); setMembers(data||[]); };
  useEffect(()=>{ load(); },[]);

  const changeRole=async(uid,role)=>{
    setSaving(uid);
    await sb.from("profiles").update({role}).eq("id",uid);
    setSaving(null); onToast("Rolle aktualisiert ✓"); load();
  };
  const deleteMember=async(uid,mname)=>{
    if(!window.confirm(`Mitglied „${mname}" und alle Buchungen wirklich löschen?`)) return;
    await sb.from("bookings").delete().eq("user_id",uid);
    await sb.from("profiles").delete().eq("id",uid);
    onToast("Mitglied gelöscht."); load();
  };

  return (
    <div style={K.page}>
      <h1 style={S.pageTitle}>Mitgliederverwaltung</h1>
      <p style={S.pageSub}>Rollen zuweisen und Mitglieder verwalten</p>

      <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:20}}>
        {members.map(m=>(
          <div key={m.id} style={{...S.card,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <Av name={m.name}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14}}>{m.name}</div>
              <div style={{fontSize:11,color:"#6B7280",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.email||""}</div>
            </div>
            <select value={m.role||"member"} disabled={saving===m.id} onChange={e=>changeRole(m.id,e.target.value)}
              style={{border:"1.5px solid #E5E7EB",borderRadius:7,padding:"5px 8px",fontSize:13,fontWeight:600,cursor:"pointer",background:"#fff",color:"#374151"}}>
              <option value="member">Mitglied</option>
              <option value="member2">Mitglied Plus</option>
              <option value="admin">Administrator</option>
            </select>
            <button style={{...S.cancelBtn,padding:"5px 9px",fontSize:13}} onClick={()=>deleteMember(m.id,m.name)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HEIMSPIEL: MANUELLE EINGABE ──────────────────────────────────────────
function SpinningBall({size=16}) {
  return (
    <>
      <style>{`@keyframes hs-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
        style={{display:"inline-block",animation:"hs-spin 1s linear infinite",flexShrink:0}}>
        <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5"/>
        <ellipse cx="16" cy="16" rx="5" ry="13" stroke="currentColor" strokeWidth="1.8"/>
        <line x1="2" y1="16" x2="30" y2="16" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
    </>
  );
}

const RUBBER_RESULT_OPTS = [
  {v:"open",  label:"Offen",        color:"#9CA3AF"},
  {v:"live",  label:"● Läuft",      color:"#F59E0B"},
  {v:"win",   label:"✓ Heimsieg",   color:"#16A34A"},
  {v:"loss",  label:"✗ Niederlage", color:"#DC2626"},
];
const RUBBER_IDS = {
  "6er": ["E1","E2","E3","E4","E5","E6","D1","D2","D3"],
  "4er": ["E1","E2","E3","E4","D1","D2"],
};
const DEFAULT_RUBBERS = (format="6er") =>
  RUBBER_IDS[format].map(id=>({id,home:"",away:"",score:"",result:"open"}));

function fmtTs(iso) {
  if(!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})
    + " " + d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}) + " Uhr";
}

function HeimspieleManualEntry({onToast, onSaved, reloadKey}) {
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [open,           setOpen]           = useState(false);
  const [dirty,          setDirty]          = useState(false);
  const [confirmReload,  setConfirmReload]  = useState(false);

  // Cache-Metadaten (nur zur Anzeige)
  const [savedAt,  setSavedAt]  = useState(null);
  const [source,   setSource]   = useState(null); // "auto" | "manual"

  // Logos – nur aus Cache übernommen, nicht editierbar
  const [homeLogo,   setHomeLogo]   = useState(null);
  const [awayLogo,   setAwayLogo]   = useState(null);

  // Editierbare Felder
  const [format,     setFormat]     = useState("6er"); // "4er" | "6er"
  const [homeTeam,   setHomeTeam]   = useState("");
  const [awayTeam,   setAwayTeam]   = useState("");
  const [league,     setLeague]     = useState("");
  const [matchDate,  setMatchDate]  = useState(""); // YYYY-MM-DD
  const [matchTime,  setMatchTime]  = useState(""); // HH:MM
  const [status,     setStatus]     = useState("upcoming");
  const [homeScore,  setHomeScore]  = useState(0);
  const [awayScore,  setAwayScore]  = useState(0);
  const [rubbers,    setRubbers]    = useState(DEFAULT_RUBBERS("6er"));

  const applyMatch = (m) => {
    setHomeLogo(m.homeLogo  || null);
    setAwayLogo(m.awayLogo  || null);
    setHomeTeam(m.homeTeam  || "");
    setAwayTeam(m.awayTeam  || "");
    setLeague(  m.league    || "");
    setMatchDate(m.matchDate || "");
    setMatchTime((m.time || "").replace(/\s*Uhr$/i, "").trim());
    setStatus(  m.status    || "upcoming");
    setHomeScore(m.homeScore ?? 0);
    setAwayScore(m.awayScore ?? 0);
    const rubs = m.rubbers && m.rubbers.length > 0 ? m.rubbers.map(r=>({...r})) : [];
    const det = rubs.filter(r=>r.id.startsWith("E")).length <= 4 ? "4er" : "6er";
    setFormat(det);
    setRubbers(rubs.length > 0 ? rubs : DEFAULT_RUBBERS(det));
    setSavedAt(m._savedAt || null);
    setSource( m._source  || "auto");
    setDirty(false);
    setConfirmReload(false);
  };

  // Format-Wechsel: bestehende Rubber-Daten behalten, fehlende ergänzen, überschüssige entfernen
  const switchFormat = (newFmt) => {
    const ids = RUBBER_IDS[newFmt];
    const rubberMap = Object.fromEntries(rubbers.map(r=>[r.id,r]));
    setRubbers(ids.map(id => rubberMap[id] || {id,home:"",away:"",score:"",result:"open"}));
    setFormat(newFmt);
    setDirty(true);
  };

  const doReload = async () => {
    setConfirmReload(false);
    try {
      const {data, error} = await sb.from("settings")
        .select("value").eq("key","btv_match_cache").single();
      if(error && error.code !== "PGRST116") throw error;
      if(data?.value) {
        let m = data.value;
        if(typeof m === "string") m = JSON.parse(m);
        applyMatch(m);
        onToast("Cache geladen ✓");
      } else {
        setHomeLogo(null); setAwayLogo(null);
        setHomeTeam(""); setAwayTeam(""); setLeague("");
        setMatchDate(""); setMatchTime("");
        setStatus("upcoming"); setHomeScore(0); setAwayScore(0);
        setFormat("6er"); setRubbers(DEFAULT_RUBBERS("6er"));
        setSavedAt(null); setSource(null); setDirty(false);
        onToast("Kein Cache vorhanden – leeres Formular");
      }
    } catch(err) {
      onToast(`Fehler beim Laden: ${err.message}`,"error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ doReload(); },[]);
  useEffect(()=>{ if(reloadKey) doReload(); },[reloadKey]);

  const requestReload = () => {
    if(dirty) { setConfirmReload(true); return; }
    doReload();
  };

  const mark = (setter) => (val) => { setter(val); setDirty(true); };
  const updRubber = (id,field,val) => {
    setRubbers(prev=>prev.map(r=>r.id===id?{...r,[field]:val}:r));
    setDirty(true);
  };

  const recalcScore = () => {
    const w = rubbers.filter(r=>r.result==="win").length;
    const l = rubbers.filter(r=>r.result==="loss").length;
    setHomeScore(w); setAwayScore(l); setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    // Status automatisch aus Rubbers ableiten
    const hasPlayers   = rubbers.some(r => (r.home || "").trim() || (r.away || "").trim());
    const openCount    = rubbers.filter(r => r.result === "open").length;
    const nonOpenCount = rubbers.filter(r => r.result !== "open").length;
    const autoStatus   = !hasPlayers && nonOpenCount === 0 ? "upcoming" : openCount === 0 ? "done" : "live";
    // _btv-Snapshot aus Cache laden und erhalten
    const { data: cacheRaw } = await sb.from("settings").select("value").eq("key","btv_match_cache").single();
    const existingCache = cacheRaw?.value ? (typeof cacheRaw.value === "string" ? JSON.parse(cacheRaw.value) : cacheRaw.value) : {};
    const payload = {
      homeTeam, awayTeam, league, status: autoStatus,
      matchDate: matchDate || null,
      time: matchTime ? matchTime + " Uhr" : null,
      homeLogo: homeLogo || null,
      awayLogo: awayLogo || null,
      _btv: existingCache._btv || null,  // BTV-Snapshot erhalten
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      rubbers,
      _source: "manual",
      _savedAt: now,
    };
    const {error} = await sb.from("settings")
      .upsert([{key:"btv_match_cache", value:JSON.stringify(payload)}],{onConflict:"key"});
    setSaving(false);
    if(error){ onToast(`Fehler: ${error.message}`,"error"); return; }
    setSavedAt(now); setSource("manual"); setDirty(false);
    onToast("📲 Spielstand auf Display übertragen ✓");
    onSaved?.(payload);
  };

  const singles = rubbers.filter(r=>r.id.startsWith("E"));
  const doubles = rubbers.filter(r=>r.id.startsWith("D"));

  // Zeitstempel-Info für den Header
  const tsInfo = savedAt
    ? `${source==="manual"?"✏️ Manuell":"🤖 Auto"} · ${fmtTs(savedAt)}`
    : null;

  return (
    <div style={{marginBottom:24,border:`1.5px solid ${dirty?"#F59E0B":"#FCD34D"}`,borderRadius:12,overflow:"hidden"}}>
      {/* Header */}
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:"100%",background:"#FFFBEB",padding:"12px 16px",border:"none",
          cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
        <span style={{fontSize:18}}>✏️</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:13,color:"#92400E"}}>
            Spielstand manuell einpflegen
            {dirty&&<span style={{marginLeft:8,fontSize:11,color:"#D97706",fontWeight:400}}>● ungespeichert</span>}
          </div>
          <div style={{fontSize:11,color:"#B45309",marginTop:1}}>
            {tsInfo
              ? <span>{tsInfo}{source==="auto"?" · Live-Daten überschreibbar":""}</span>
              : "Fallback wenn BTV nicht erreichbar · Änderungen werden sofort angezeigt"}
          </div>
        </div>
        <span style={{color:"#B45309",fontSize:14}}>{open?"▲":"▼"}</span>
      </button>

      {open&&(
        <div style={{padding:16,background:"#fff",borderTop:"1px solid #FDE68A"}}>
          {loading&&<div style={{fontSize:13,color:"#9CA3AF",padding:"8px 0"}}>Lade Cache…</div>}

          {!loading&&(<>
            {/* Timestamp-Banner */}
            {savedAt&&(
              <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,fontSize:12,
                background:source==="manual"?"#FFFBEB":"#EFF6FF",
                border:`1px solid ${source==="manual"?"#FDE68A":"#BFDBFE"}`,
                color:source==="manual"?"#92400E":"#1E40AF"}}>
                {source==="manual"
                  ? `✏️ Letzter Stand: manuell gespeichert am ${fmtTs(savedAt)}`
                  : `🤖 Letzter Stand: automatisch abgerufen am ${fmtTs(savedAt)}`}
                {source==="auto"&&
                  <div style={{marginTop:4,fontSize:11,opacity:0.8}}>
                    Wenn du jetzt speicherst, überschreibst du die Live-Daten.
                    Der nächste automatische Abruf stellt sie wieder her.
                  </div>
                }
              </div>
            )}
            {!savedAt&&(
              <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,fontSize:12,
                background:"#F9FAFB",border:"1px solid #E5E7EB",color:"#6B7280"}}>
                Kein Cache vorhanden – du kannst alle Felder von Hand befüllen.
              </div>
            )}

            {/* Reload-Bestätigung */}
            {confirmReload&&(
              <div style={{marginBottom:12,padding:"10px 12px",borderRadius:8,
                background:"#FEF3C7",border:"1px solid #FCD34D",fontSize:13}}>
                <strong>Ungespeicherte Änderungen verwerfen?</strong>
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button onClick={doReload}
                    style={{padding:"5px 14px",borderRadius:6,border:"none",
                      background:"#DC2626",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:700}}>
                    Ja, verwerfen
                  </button>
                  <button onClick={()=>setConfirmReload(false)}
                    style={{padding:"5px 14px",borderRadius:6,border:"1px solid #E5E7EB",
                      background:"#fff",fontSize:12,cursor:"pointer"}}>
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            {/* Format-Toggle */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:6}}>MANNSCHAFTSGRÖSSE</div>
              <div style={{display:"flex",gap:8}}>
                {["6er","4er"].map(f=>(
                  <button key={f} onClick={()=>switchFormat(f)}
                    style={{flex:1,padding:"8px 0",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",
                      border:`2px solid ${format===f?"#8B5CF6":"#E5E7EB"}`,
                      background:format===f?"#F5F3FF":"#fff",
                      color:format===f?"#7C3AED":"#6B7280"}}>
                    {f==="6er" ? "6er · E1–E6 + D1–D3" : "4er · E1–E4 + D1–D2"}
                  </button>
                ))}
              </div>
            </div>

            {/* Teams + Reload */}
            <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,marginBottom:14,alignItems:"end"}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>HEIM</div>
                <input value={homeTeam} onChange={e=>mark(setHomeTeam)(e.target.value)}
                  placeholder="z.B. SG Herrieden"
                  style={{...S.input,width:"100%",fontSize:13,fontWeight:700}}/>
              </div>
              <div style={{textAlign:"center",paddingBottom:8,color:"#9CA3AF",fontSize:12,fontWeight:700}}>vs.</div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>GAST</div>
                <input value={awayTeam} onChange={e=>mark(setAwayTeam)(e.target.value)}
                  placeholder="z.B. TC Rothenburg"
                  style={{...S.input,width:"100%",fontSize:13,fontWeight:700}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:14}}>
              <div style={{flex:"0 0 auto"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>SPIELTAG</div>
                <input type="date" value={matchDate} onChange={e=>mark(setMatchDate)(e.target.value)}
                  style={{...S.input,fontSize:13,color:"#374151"}}/>
              </div>
              <div style={{flex:"0 0 auto"}}>
                <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>UHRZEIT</div>
                <input type="time" value={matchTime} onChange={e=>mark(setMatchTime)(e.target.value)}
                  style={{...S.input,fontSize:13,color:"#374151"}}/>
              </div>
              <div style={{flex:1,textAlign:"right",paddingBottom:1}}>
                <button onClick={requestReload}
                  style={{background:"none",border:"1px solid #E5E7EB",borderRadius:6,
                    padding:"4px 10px",fontSize:11,cursor:"pointer",color:"#6B7280"}}>
                  ↻ Cache neu laden
                </button>
              </div>
            </div>

            {/* Gesamtstand */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:6}}>
                GESAMTSTAND
                <button onClick={recalcScore}
                  style={{marginLeft:8,background:"none",border:"1px solid #E5E7EB",borderRadius:4,
                    padding:"1px 6px",fontSize:10,cursor:"pointer",color:"#6B7280",fontWeight:400}}>
                  ↻ aus Rubbers
                </button>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#9CA3AF",marginBottom:3}}>Heim</div>
                  <input type="number" min={0} max={9} value={homeScore}
                    onChange={e=>{setHomeScore(e.target.value);setDirty(true);}}
                    style={{width:56,textAlign:"center",fontSize:22,fontWeight:800,
                      border:"2px solid #E5E7EB",borderRadius:8,padding:"4px 0"}}/>
                </div>
                <span style={{fontSize:22,color:"#9CA3AF",fontWeight:700,paddingTop:14}}>:</span>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#9CA3AF",marginBottom:3}}>Gast</div>
                  <input type="number" min={0} max={9} value={awayScore}
                    onChange={e=>{setAwayScore(e.target.value);setDirty(true);}}
                    style={{width:56,textAlign:"center",fontSize:22,fontWeight:800,
                      border:"2px solid #E5E7EB",borderRadius:8,padding:"4px 0"}}/>
                </div>
              </div>
            </div>

            {/* Rubbers */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:8}}>
                RUBBERS
                <span style={{fontWeight:400,marginLeft:6,color:"#9CA3AF"}}>alle Felder editierbar</span>
              </div>
              {[["Einzel",singles],["Doppel",doubles]].map(([label,list])=>(
                <div key={label} style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#9CA3AF",marginBottom:4,
                    textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {list.map(r=>(
                      <div key={r.id} style={{border:"1px solid #E5E7EB",borderRadius:8,
                        padding:"8px 10px",background:r.id.startsWith("D")?"#EFF6FF":"#fff"}}>
                        {/* Zeile 1: ID + Namen */}
                        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:5}}>
                          <span style={{fontWeight:800,fontSize:13,color:"#374151",minWidth:26}}>{r.id}</span>
                          <input value={r.home} onChange={e=>updRubber(r.id,"home",e.target.value)}
                            placeholder="Heimspieler"
                            style={{flex:1,fontSize:12,border:"1px solid #D1D5DB",borderRadius:5,
                              padding:"3px 6px",minWidth:0}}/>
                          <span style={{color:"#9CA3AF",fontSize:11}}>vs</span>
                          <input value={r.away} onChange={e=>updRubber(r.id,"away",e.target.value)}
                            placeholder="Gastspieler"
                            style={{flex:1,fontSize:12,border:"1px solid #D1D5DB",borderRadius:5,
                              padding:"3px 6px",minWidth:0}}/>
                        </div>
                        {/* Zeile 2: Score + Ergebnis */}
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{minWidth:26}}/>
                          <input value={r.score} onChange={e=>updRubber(r.id,"score",e.target.value)}
                            placeholder="6:3 4:6 10:8"
                            style={{flex:1,fontSize:12,border:"1px solid #D1D5DB",borderRadius:5,
                              padding:"3px 6px",minWidth:0}}/>
                          <select value={r.result} onChange={e=>updRubber(r.id,"result",e.target.value)}
                            style={{fontSize:12,border:"1px solid #D1D5DB",borderRadius:5,padding:"3px 6px",
                              background:"#fff",fontWeight:600,
                              color:RUBBER_RESULT_OPTS.find(o=>o.v===r.result)?.color||"#374151"}}>
                            {RUBBER_RESULT_OPTS.map(o=>(
                              <option key={o.v} value={o.v}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={save} disabled={saving}
              style={{...S.primaryBtn,background:dirty?"#D97706":"#9CA3AF",
                width:"100%",opacity:saving?0.6:1,transition:"background .2s"}}>
              {saving?"Speichern…":"📲 Spielstand auf Display übertragen"}
            </button>
          </>)}
        </div>
      )}
    </div>
  );
}

// ── SETTINGS: DISPLAY – Hilfskomponenten ─────────────────────────────────
function ToggleSwitch({on, onToggle}) {
  return (
    <div onClick={onToggle}
      style={{width:44,height:24,background:on?"#8B5CF6":"#D1D5DB",borderRadius:12,
        position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
      <div style={{width:20,height:20,background:"#fff",borderRadius:"50%",
        position:"absolute",top:2,left:on?22:2,transition:"left .2s",
        boxShadow:"0 1px 4px rgba(0,0,0,.25)"}}/>
    </div>
  );
}

function ZeitSchaltung({sched, setSched}) {
  const set = (field) => (e) => setSched(s => ({...s, [field]: e.target.value}));
  const hasAny = sched.from || sched.to;
  const now = new Date();
  const isActive = sched.from && sched.to &&
    now >= new Date(sched.from) && now <= new Date(sched.to);
  return (
    <div style={{marginTop:16,padding:"12px 14px",background:"#F9FAFB",
      borderRadius:8,border:`1px solid ${isActive?"#86EFAC":"#E5E7EB"}`}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:8,
        display:"flex",alignItems:"center",gap:8}}>
        ⏰ ZEITSCHALTUNG <span style={{fontWeight:400}}>(optional)</span>
        {isActive&&<span style={{fontSize:10,background:"#DCFCE7",color:"#16A34A",
          padding:"1px 7px",borderRadius:10,fontWeight:700}}>AKTIV JETZT</span>}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,color:"#9CA3AF",marginBottom:3}}>VON</div>
          <input type="datetime-local" value={sched.from} onChange={set("from")}
            style={{fontSize:12,padding:"5px 8px",border:"1px solid #D1D5DB",
              borderRadius:6,color:"#374151"}}/>
        </div>
        <div>
          <div style={{fontSize:10,color:"#9CA3AF",marginBottom:3}}>BIS</div>
          <input type="datetime-local" value={sched.to} onChange={set("to")}
            style={{fontSize:12,padding:"5px 8px",border:"1px solid #D1D5DB",
              borderRadius:6,color:"#374151"}}/>
        </div>
        {hasAny&&(
          <button onClick={()=>setSched({from:"",to:""})}
            style={{padding:"5px 10px",fontSize:11,color:"#EF4444",background:"none",
              border:"1px solid #FECACA",borderRadius:6,cursor:"pointer"}}>
            ✕ löschen
          </button>
        )}
      </div>
      <div style={{fontSize:10,color:"#9CA3AF",marginTop:6}}>
        Innerhalb dieser Zeit wird dieser Modus automatisch aktiviert – unabhängig vom Toggle
      </div>
    </div>
  );
}

// ── SETTINGS: DISPLAY ────────────────────────────────────────────────────
function SettingsDisplayTab({onToast}) {
  const [activeTab,      setActiveTab]      = useState("schedule");
  const [mode,           setMode]           = useState("schedule"); // toggle-aktiver Modus
  const [theme,          setTheme]          = useState("dark");
  const [vereinsnr,      setVernr]          = useState("6085");
  const [saison,         setSaison]         = useState("2026");
  const [mannschaft,     setMannschaft]     = useState("");
  const [gegner,         setGegner]         = useState("");
  const [matchUrl,       setMatchUrl]       = useState("");
  const [bildUrl,        setBildUrl]        = useState("");
  const [githubPat,      setGithubPat]      = useState("");
  const [schedSchedule,  setSchedSchedule]  = useState({from:"",to:""});
  const [schedHeim,      setSchedHeim]      = useState({from:"",to:""});
  const [schedBild,      setSchedBild]      = useState({from:"",to:""});
  const [matchCache,     setMatchCache]     = useState(null); // btv_match_cache
  const [revertKey,      setRevertKey]      = useState(0);
  const [uploading,      setUploading]      = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [fetchStatus,    setFetchStatus]    = useState(null);
  const [schedError,     setSchedError]     = useState(null);

  useEffect(()=>{
    sb.from("settings").select("*")
      .in("key",["display_mode","display_theme","display_vereinsnummer","display_saison",
                 "display_mannschaft","display_gegner","display_match_url",
                 "display_bild_url","github_pat",
                 "display_sched_schedule","display_sched_heimspiel","display_sched_bild",
                 "btv_match_cache"])
      .then(({data})=>{
        if(!data) return;
        const map=Object.fromEntries(data.map(r=>[r.key,r.value]));
        if(map.display_mode)           setMode(map.display_mode);
        if(map.display_theme)          setTheme(map.display_theme);
        if(map.display_vereinsnummer)  setVernr(map.display_vereinsnummer);
        if(map.display_saison)         setSaison(map.display_saison);
        if(map.display_mannschaft)     setMannschaft(map.display_mannschaft);
        if(map.display_gegner)         setGegner(map.display_gegner);
        if(map.display_match_url)      setMatchUrl(map.display_match_url);
        if(map.display_bild_url)       setBildUrl(map.display_bild_url);
        if(map.github_pat)             setGithubPat(map.github_pat);
        try { if(map.display_sched_schedule)  setSchedSchedule(JSON.parse(map.display_sched_schedule)); } catch(_){}
        try { if(map.display_sched_heimspiel) setSchedHeim(JSON.parse(map.display_sched_heimspiel)); } catch(_){}
        try { if(map.display_sched_bild)      setSchedBild(JSON.parse(map.display_sched_bild)); } catch(_){}
        try { if(map.btv_match_cache)         setMatchCache(JSON.parse(map.btv_match_cache)); } catch(_){}
      });
  },[]);

  const checkOverlap = () => {
    const list = [
      {label:"Tagesbelegungsplan", ...schedSchedule},
      {label:"Heimspielmodus",     ...schedHeim},
      {label:"Bildanzeige",        ...schedBild},
    ].filter(s => s.from && s.to);
    for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) {
      const a=list[i], b=list[j];
      if(new Date(a.from)<new Date(b.to) && new Date(b.from)<new Date(a.to))
        return `Zeitüberschneidung: „${a.label}" und „${b.label}" überlappen sich`;
    }
    return null;
  };

  const uploadBild=async(file)=>{
    setUploading(true);
    const img=new Image();
    const objUrl=URL.createObjectURL(file);
    img.onload=async()=>{
      const maxW=1920;
      const ratio=Math.min(1,maxW/img.width);
      const canvas=document.createElement("canvas");
      canvas.width=Math.round(img.width*ratio);
      canvas.height=Math.round(img.height*ratio);
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      URL.revokeObjectURL(objUrl);
      const dataUrl=canvas.toDataURL("image/jpeg",0.85);
      const {error}=await sb.from("settings").upsert([{key:"display_bild_url",value:dataUrl}],{onConflict:"key"});
      if(error){ onToast(`Fehler: ${error.message}`,"error"); }
      else{ setBildUrl(dataUrl); onToast("Bild gespeichert ✓"); }
      setUploading(false);
    };
    img.src=objUrl;
  };

  const save=async()=>{
    const overlap = checkOverlap();
    if(overlap){ setSchedError(overlap); return; }
    setSchedError(null);
    setSaving(true);
    const {error}=await sb.from("settings").upsert([
      {key:"display_mode",            value:mode},
      {key:"display_theme",           value:theme},
      {key:"display_vereinsnummer",   value:vereinsnr},
      {key:"display_saison",          value:saison},
      {key:"display_mannschaft",      value:mannschaft},
      {key:"display_gegner",          value:gegner},
      {key:"display_match_url",       value:matchUrl},
      {key:"github_pat",              value:githubPat},
      {key:"display_sched_schedule",  value:JSON.stringify(schedSchedule)},
      {key:"display_sched_heimspiel", value:JSON.stringify(schedHeim)},
      {key:"display_sched_bild",      value:JSON.stringify(schedBild)},
    ],{onConflict:"key"});
    setSaving(false);
    if(error){ onToast(`Fehler: ${error.message}`,"error"); return; }
    onToast("Display-Einstellungen gespeichert ✓");
  };

  const triggerFetch = async () => {
    if(!githubPat) { onToast("Kein GitHub PAT hinterlegt – bitte zuerst speichern","error"); return; }
    setFetchStatus("running");
    try {
      const res = await fetch(
        "https://api.github.com/repos/MeierAndre130577/tennis-herrieden/actions/workflows/btv-fetch.yml/dispatches",
        { method:"POST",
          headers:{ Authorization:`Bearer ${githubPat}`, Accept:"application/vnd.github+json", "Content-Type":"application/json" },
          body: JSON.stringify({ref:"main"}) }
      );
      if(res.status === 204) {
        setFetchStatus("ok");
        onToast("✅ Fetch gestartet – läuft in ~30 Sek.");
        // Cache nach ~35 Sek. neu laden
        setTimeout(async ()=>{
          const {data} = await sb.from("settings").select("value").eq("key","btv_match_cache").single();
          if(data?.value) try { setMatchCache(JSON.parse(data.value)); } catch(_){}
          setFetchStatus(null);
        }, 35000);
      } else {
        const txt = await res.text();
        setFetchStatus("error");
        onToast(`Fehler ${res.status}: ${txt}`,"error");
        setTimeout(()=>setFetchStatus(null), 6000);
      }
    } catch(e) {
      setFetchStatus("error");
      onToast(`Netzwerkfehler: ${e.message}`,"error");
      setTimeout(()=>setFetchStatus(null), 6000);
    }
  };

  const revertToBtv = async () => {
    if (!matchCache?._btv) return;
    const btv = matchCache._btv;
    const newCache = {
      ...matchCache,
      matchDate: btv.matchDate ?? matchCache.matchDate,
      time:      btv.time      ?? matchCache.time,
      league:    btv.league    ?? matchCache.league,
      homeLogo:  btv.homeLogo  ?? matchCache.homeLogo,
      awayLogo:  btv.awayLogo  ?? matchCache.awayLogo,
      _source: "auto",
    };
    await sb.from("settings").upsert({key:"btv_match_cache", value: JSON.stringify(newCache)});
    setMatchCache(newCache);
    setRevertKey(k => k + 1);
    onToast("✅ BTV-Stand wiederhergestellt");
  };

  const themes=[
    {id:"dark",     label:"Dunkel",        desc:"Navy-Blau Hintergrund (Standard)",       bg:"#0F172A",fg:"#F8FAFC"},
    {id:"light",    label:"Hell",          desc:"Weißer Hintergrund, dunkle Schrift",      bg:"#F8FAFC",fg:"#0F172A"},
    {id:"contrast", label:"Hoher Kontrast",desc:"Schwarz-Weiß für sehr helle Umgebungen", bg:"#FFFFFF",fg:"#000000"},
  ];

  const TABS = [
    {id:"farbschema", icon:"🎨", label:"Farbschema"},
    {id:"schedule",   icon:"📅", label:"Tagesbelegung"},
    {id:"heimspiel",  icon:"🏆", label:"Heimspiel"},
    {id:"bild",       icon:"🖼️", label:"Bildanzeige"},
  ];

  const ModeRow = ({modeId}) => (
    <div onClick={()=>setMode(modeId)}
      style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"12px 14px",borderRadius:10,marginBottom:20,cursor:"pointer",
        background:mode===modeId?"#F5F3FF":"#F9FAFB",
        border:`1.5px solid ${mode===modeId?"#8B5CF6":"#E5E7EB"}`}}>
      <div>
        <div style={{fontWeight:700,fontSize:13,color:mode===modeId?"#7C3AED":"#374151"}}>
          Auf Display anzeigen
        </div>
        <div style={{fontSize:11,color:"#6B7280",marginTop:2}}>
          {mode===modeId ? "✓ Aktuell aktiver Modus" : "Klicken zum Aktivieren"}
        </div>
      </div>
      <ToggleSwitch on={mode===modeId} onToggle={()=>setMode(modeId)}/>
    </div>
  );

  return (
    <div style={K.page}>
      <h1 style={S.pageTitle}>Display-Einstellungen</h1>
      <p style={S.pageSub}>Steuert, was auf dem Kiosk-Display angezeigt wird</p>

      {/* Tab-Navigation */}
      <div style={{display:"flex",marginTop:20,borderBottom:"2px solid #E5E7EB",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{padding:"10px 14px",border:"none",background:"none",cursor:"pointer",
              borderBottom:activeTab===t.id?"2px solid #8B5CF6":"2px solid transparent",
              marginBottom:-2,fontSize:12,fontWeight:activeTab===t.id?700:400,
              color:activeTab===t.id?"#7C3AED":"#6B7280",
              display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
            <span>{t.icon}</span>{t.label}
            {t.id!=="farbschema"&&mode===t.id&&(
              <span style={{width:6,height:6,borderRadius:"50%",
                background:"#8B5CF6",display:"inline-block"}}/>
            )}
          </button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      <div style={{paddingTop:20,paddingBottom:8}}>

        {/* ── FARBSCHEMA ── */}
        {activeTab==="farbschema"&&(
          <div>
            <p style={{fontSize:12,color:"#6B7280",marginBottom:16}}>
              Gilt übergreifend für alle Anzeigemodi.
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {themes.map(t=>(
                <button key={t.id} onClick={()=>setTheme(t.id)}
                  style={{...S.card,border:`2px solid ${theme===t.id?"#8B5CF6":"#E5E7EB"}`,
                    background:theme===t.id?"#F5F3FF":"#fff",display:"flex",alignItems:"center",
                    gap:14,padding:"14px 16px",marginBottom:0,cursor:"pointer",textAlign:"left"}}>
                  <div style={{width:36,height:36,borderRadius:8,background:t.bg,
                    border:"1.5px solid #D1D5DB",display:"flex",alignItems:"center",
                    justifyContent:"center",flexShrink:0}}>
                    <span style={{color:t.fg,fontWeight:800,fontSize:13}}>Aa</span>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14}}>{t.label}</div>
                    <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{t.desc}</div>
                  </div>
                  {theme===t.id&&<span style={{color:"#8B5CF6",fontWeight:800,fontSize:18}}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── TAGESBELEGUNGSPLAN ── */}
        {activeTab==="schedule"&&(
          <div>
            <ModeRow modeId="schedule"/>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>VEREINSNUMMER (BTV)</div>
              <input value={vereinsnr} onChange={e=>setVernr(e.target.value)} style={{...S.input,width:"100%"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>SAISON</div>
              <input value={saison} onChange={e=>setSaison(e.target.value)} style={{...S.input,width:"100%"}}/>
            </div>
            <ZeitSchaltung sched={schedSchedule} setSched={setSchedSchedule}/>
          </div>
        )}

        {/* ── HEIMSPIELMODUS ── */}
        {activeTab==="heimspiel"&&(
          <div>
            <ModeRow modeId="heimspiel"/>

            {/* GitHub PAT */}
            <div style={{marginBottom:14,padding:"10px 12px",background:"#FFFBEB",borderRadius:8,border:"1px solid #FDE68A"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#92400E",marginBottom:5}}>
                GITHUB TOKEN (PAT) 🔑 <span style={{fontWeight:400,color:"#B45309"}}>einmalig hinterlegen</span>
              </div>
              <input type="password" value={githubPat} onChange={e=>setGithubPat(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                style={{...S.input,width:"100%",fontSize:12,fontFamily:"monospace"}}/>
              <div style={{fontSize:10,color:"#B45309",marginTop:4}}>
                GitHub → Settings → Developer settings → Personal access tokens → Classic → Scope: <strong>workflow</strong>
              </div>
            </div>

            {/* Staffel-URL */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>STAFFEL-URL (BTV)</div>
              <input value={matchUrl} onChange={e=>setMatchUrl(e.target.value)}
                placeholder="https://www.btv.de/de/spielbetrieb/tabelle-spielplan.html?groupid=…"
                style={{...S.input,width:"100%",fontSize:12}}/>
              <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Einmal pro Mannschaft – bleibt dauerhaft gleich</div>
            </div>

            {/* Heimmannschaft */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>HEIMMANNSCHAFT</div>
              <input value={mannschaft} onChange={e=>setMannschaft(e.target.value)}
                placeholder="z.B. SG TSV/DJK Herrieden" style={{...S.input,width:"100%"}}/>
              <div style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>Genau so wie auf btv.de angegeben</div>
            </div>

            {/* Gastmannschaft */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>
                GASTMANNSCHAFT <span style={{fontWeight:400,color:"#EF4444"}}>↺ vor jedem Spiel aktualisieren</span>
              </div>
              <input value={gegner} onChange={e=>setGegner(e.target.value)}
                placeholder="z.B. TC Rothenburg" style={{...S.input,width:"100%"}}/>
            </div>

            {/* Fetch-Button */}
            {mannschaft&&gegner&&(
              <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,
                padding:"10px 12px",fontSize:12,color:"#1E40AF",marginBottom:4}}>
                ✅ <strong>{mannschaft}</strong> vs. <strong>{gegner}</strong>
                {matchUrl&&<div style={{marginTop:4,wordBreak:"break-all",opacity:0.7,fontSize:11}}>
                  🔗 {matchUrl.slice(0,70)}{matchUrl.length>70?"…":""}
                </div>}
                <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #BFDBFE"}}>
                  <button onClick={triggerFetch} disabled={fetchStatus==="running"}
                    style={{display:"inline-flex",alignItems:"center",gap:6,
                      background:fetchStatus==="ok"?"#059669":fetchStatus==="error"?"#DC2626":"#1E40AF",
                      color:"#fff",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,
                      border:"none",cursor:fetchStatus==="running"?"wait":"pointer",
                      opacity:fetchStatus==="running"?0.7:1}}>
                    {fetchStatus==="running"?"⏳ Startet…":fetchStatus==="ok"?"✅ Gestartet!":fetchStatus==="error"?"❌ Fehler":"▶ Fetch jetzt starten"}
                  </button>
                  <div style={{marginTop:5,fontSize:10,color:"#6B7280",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>Nach Gegner-Änderung einmal klicken → Daten kommen in ~30 Sek.</span>
                    {matchCache?._savedAt&&(
                      <span style={{fontSize:10,color:"#6B7280",fontStyle:"italic"}}>
                        Letzter Fetch: {new Date(matchCache._savedAt).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})} Uhr
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Cache-Status */}
            {matchCache&&(()=>{
              const c = matchCache;
              const btv = c._btv || {};
              const savedAt = c._savedAt ? new Date(c._savedAt).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : null;
              const dateStr = c.matchDate ? new Date(c.matchDate+"T12:00:00").toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"numeric",year:"numeric"}) : null;
              const players = (c.rubbers||[]).filter(r=>(r.home||r.away)).length;
              const total   = (c.rubbers||[]).length;
              // Badges: "BTV" wenn vom Fetch, "BTV + Manuell" wenn manuell überschrieben, "Manuell" wenn kein BTV-Wert
              const hasBtv = Object.keys(btv).length > 0;
              const btvBadge    = {bg:"#DBEAFE",color:"#1D4ED8",label:"🤖 BTV"};
              const manBadge    = {bg:"#FEF3C7",color:"#92400E",label:"✏️ Manuell"};
              // Für BTV-Snapshot-Felder: zeige ob aktueller Wert noch dem BTV-Wert entspricht
              const fieldBadges = (field) => {
                const fromBtv = btv[field] != null;
                const unchanged = fromBtv && btv[field] === c[field];
                if (c._source === "auto" || unchanged) return [btvBadge];
                if (fromBtv && !unchanged) return [btvBadge, manBadge]; // BTV-Wert wurde manuell überschrieben
                return [manBadge];
              };
              // Für Rubbers/Stand: BTV wenn auto, BTV+Manuell wenn manuell überschrieben und BTV-Daten vorhanden
              const rubberBadges = c._source === "auto" ? [btvBadge]
                : hasBtv ? [btvBadge, manBadge]
                : [manBadge];
              const rows = [
                {label:"Spieltag",  value:dateStr,  badges:fieldBadges("matchDate")},
                {label:"Uhrzeit",   value:c.time,   badges:fieldBadges("time")},
                {label:"Liga",      value:c.league||null, badges:fieldBadges("league")},
                {label:"Heim-Logo", value:c.homeLogo?"✓ vorhanden":"– nicht gefunden", ok:!!c.homeLogo, badges:fieldBadges("homeLogo")},
                {label:"Gast-Logo", value:c.awayLogo?"✓ vorhanden":"– nicht gefunden", ok:!!c.awayLogo, badges:fieldBadges("awayLogo")},
                {label:"Spieler",   value:total>0?`${players} / ${total} eingetragen`:null, badges:rubberBadges},
                {label:"Stand",     value:total>0?`${c.homeScore}:${c.awayScore}`:null, badges:rubberBadges},
              ];
              return (
                <div style={{marginTop:12,padding:"12px 14px",background:"#F8FAFC",
                  border:"1px solid #E2E8F0",borderRadius:8,fontSize:12}}>
                  <div style={{fontWeight:700,color:"#374151",marginBottom:8,
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>📋 Cache-Stand</span>
                    <span style={{fontSize:10,color:"#9CA3AF",fontWeight:400}}>{savedAt||""}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:"4px 10px",alignItems:"center"}}>
                    {rows.map(r=>(
                      <Fragment key={r.label}>
                        <span style={{fontSize:10,color:"#9CA3AF",fontWeight:700,whiteSpace:"nowrap"}}>{r.label}</span>
                        <span style={{color:r.value?(r.ok===false?"#EF4444":"#111827"):"#D1D5DB",
                          fontStyle:r.value?"normal":"italic"}}>
                          {r.value||"–"}
                        </span>
                        <span style={{display:"flex",gap:3}}>
                          {r.badges.map(b=>(
                            <span key={b.label} style={{fontSize:10,padding:"1px 6px",borderRadius:8,
                              fontWeight:700,background:b.bg,color:b.color,whiteSpace:"nowrap"}}>
                              {b.label}
                            </span>
                          ))}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                  {hasBtv && c._source !== "auto" && (
                    <button onClick={revertToBtv}
                      style={{marginTop:10,width:"100%",background:"none",border:"1px solid #BFDBFE",
                        borderRadius:6,padding:"5px 0",fontSize:11,cursor:"pointer",
                        color:"#1D4ED8",fontWeight:600}}>
                      ↩ Auf letzten BTV-Stand zurücksetzen
                    </button>
                  )}
                </div>
              );
            })()}

            <ZeitSchaltung sched={schedHeim} setSched={setSchedHeim}/>

            <div style={{marginTop:20}}>
              <HeimspieleManualEntry onToast={onToast} onSaved={setMatchCache} reloadKey={revertKey}/>
            </div>
          </div>
        )}

        {/* ── BILDANZEIGE ── */}
        {activeTab==="bild"&&(
          <div>
            <ModeRow modeId="bild"/>
            <input type="file" accept="image/*" id="bild-file-input" style={{display:"none"}}
              onChange={e=>e.target.files[0]&&uploadBild(e.target.files[0])}/>
            <label htmlFor="bild-file-input"
              style={{...S.primaryBtn,display:"inline-block",cursor:uploading?"not-allowed":"pointer",opacity:uploading?0.6:1}}>
              {uploading?"Hochladen…":"📁 Bild hochladen"}
            </label>
            {bildUrl&&(
              <div style={{marginTop:14}}>
                <img src={bildUrl} alt="" style={{width:"100%",maxHeight:180,objectFit:"contain",borderRadius:8,background:"#E5E7EB"}}/>
                <div style={{fontSize:11,color:"#9CA3AF",marginTop:6}}>Aktuell hinterlegtes Bild</div>
              </div>
            )}
            {!bildUrl&&<div style={{marginTop:10,fontSize:12,color:"#9CA3AF"}}>Noch kein Bild hochgeladen.</div>}
            <ZeitSchaltung sched={schedBild} setSched={setSchedBild}/>
          </div>
        )}
      </div>

      {/* Fehler Zeitschaltung */}
      {schedError&&(
        <div style={{padding:"10px 14px",background:"#FEF2F2",border:"1px solid #FECACA",
          borderRadius:8,fontSize:12,color:"#DC2626",marginBottom:16}}>
          ⚠️ {schedError}
        </div>
      )}

      {/* Footer – immer sichtbar */}
      <div style={{display:"flex",alignItems:"center",gap:16,paddingTop:16,
        borderTop:"1px solid #E5E7EB",marginTop:8}}>
        <button style={{...S.primaryBtn,background:"#8B5CF6",opacity:saving?0.6:1}}
          onClick={save} disabled={saving}>
          {saving?"Speichern…":"Einstellungen speichern"}
        </button>
        <a href="/display.html" target="_blank" rel="noopener noreferrer"
          style={{color:"#8B5CF6",fontSize:13,fontWeight:600,textDecoration:"none"}}>
          Display öffnen ↗
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXISTING BOOKING COMPONENTS (unverändert)
// ═══════════════════════════════════════════════════════════════════════════
function SlotModal({modal,data,user,guestFee,onBook,onCancel,onClose}) {
  const {courtId,date,slot,existing}=modal;
  const [withGuest,setWithGuest]=useState(false);
  const court=data.courts.find(c=>c.id===courtId);
  const d=new Date(date+"T12:00:00");
  const isOwn=existing?.userId===user.id;
  const isAdmin=user.role==="admin";
  const bType=existing?.type||"regular";
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHeader}>
          <div><div style={S.modalTitle}>{court?.name} · {slot} Uhr</div><div style={S.modalSub}>{DE_FULL[dayOfWeek(date)]}, {fmtDate(d)}</div></div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        {!existing&&(<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
            {[["Platz",court?.name||"?"],["Uhrzeit",slot+" Uhr"],["Dauer","1 Std."]].map(([l,v])=>(<div key={l} style={{background:"#F8FAFC",borderRadius:8,padding:"10px",textAlign:"center"}}><div style={{fontSize:10,color:"#9CA3AF",fontWeight:700,marginBottom:3}}>{l}</div><div style={{fontSize:13,fontWeight:800,color:"#111827"}}>{v}</div></div>))}
          </div>
          <div style={{background:"#FFFBEB",border:"1.5px solid #FDE68A",borderRadius:12,padding:14,marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>setWithGuest(g=>!g)}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:22}}>👥</span><div><div style={{fontWeight:700,fontSize:14,color:"#111827"}}>Gastspieler</div><div style={{fontSize:11,color:"#92400E",marginTop:1}}>Gebühr wird am Jahresende abgerechnet</div></div></div>
              <div style={{width:44,height:24,background:withGuest?"#F59E0B":"#E5E7EB",borderRadius:12,position:"relative",transition:"background .2s",flexShrink:0}}><div style={{width:20,height:20,background:"#fff",borderRadius:"50%",position:"absolute",top:2,left:withGuest?22:2,transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}></div></div>
            </div>
            {withGuest&&(<div style={{marginTop:10,padding:"10px 12px",background:"#FEF3C7",borderRadius:8,fontSize:12,color:"#92400E",fontWeight:600}}>💶 Gebühr: <strong>{eur(guestFee)}</strong> – wird in deinem Konto vorgemerkt</div>)}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button style={{...S.primaryBtn,flex:1}} onClick={()=>onBook(courtId,date,slot,"regular","",withGuest)}>{withGuest?"Mit Gastspieler buchen":"Jetzt buchen"}</button>
            <button style={S.ghostBtn} onClick={onClose}>Abbrechen</button>
          </div>
        </>)}
        {existing&&(<>
          <div style={{background:"#F9FAFB",borderRadius:8,padding:"12px 14px",marginBottom:16}}>
            <div style={{fontSize:12,color:"#6B7280",marginBottom:4}}>Gebucht von</div>
            <div style={{fontWeight:700,fontSize:16}}>{existing.userName}</div>
            <div style={{marginTop:6,display:"flex",gap:6,flexWrap:"wrap"}}>
              <span style={{fontSize:12,padding:"2px 8px",borderRadius:20,background:BOOKING_TYPE_COLORS[bType]+"22",color:BOOKING_TYPE_COLORS[bType],fontWeight:600}}>{bType==="training"?"🏋️ Training":bType==="match"?"🏆 Spieltag":"📅 Standard"}</span>
              {existing.with_guest&&<span style={{fontSize:12,padding:"2px 8px",borderRadius:20,background:"#FEF3C7",color:"#D97706",fontWeight:700}}>👥 Gastspieler</span>}
            </div>
          </div>
          {(isOwn||isAdmin)?(<div style={{display:"flex",gap:10}}><button style={{...S.cancelBtn,padding:"10px 18px",fontSize:14}} onClick={()=>onCancel(existing.id)}>Stornieren</button><button style={S.ghostBtn} onClick={onClose}>Schließen</button></div>):(<button style={S.ghostBtn} onClick={onClose}>Schließen</button>)}
        </>)}
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
        <div style={{display:"flex",gap:6}}>{[["week","📅 Woche"],["day","🗓 Tag"]].map(([m,l])=>(<button key={m} style={{...S.tabBtn,...(calMode===m?S.tabBtnActive:{})}} onClick={()=>setCalMode(m)}>{l}</button>))}</div>
      </div>
      {calMode==="week"&&(<>
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>{data.courts.map((c,i)=>(<button key={c.id} style={{...S.courtTab,...(selCourt===c.id?{background:COURT_COLORS[i%COURT_COLORS.length],color:"#fff",borderColor:COURT_COLORS[i%COURT_COLORS.length]}:{})}} onClick={()=>setSelCourt(c.id)}>{c.name}<br/><span style={{fontSize:10,opacity:.8}}>{c.surface}</span></button>))}</div>
        <div style={S.weekNav}>
          <button style={S.weekBtn} onClick={prevWeek}>← Vorwoche</button>
          <span style={{fontWeight:600,fontSize:14}}>{fmtDate(days[0])} – {fmtDate(days[6])}</span>
          <button style={S.weekBtn} onClick={nextWeek}>Nächste Woche →</button>
          <button style={{...S.weekBtn,marginLeft:8}} onClick={()=>setWeekBase(new Date())}>Heute</button>
        </div>
        <WeekGrid data={data} user={user} days={days} selCourt={selCourt} todayStr={todayStr} onSlotClick={onSlotClick}/>
      </>)}
      {calMode==="day"&&(<>
        <div style={S.weekNav}>
          <button style={S.weekBtn} onClick={()=>setDayBase(addDays(dayBase,-1))}>← Vorheriger Tag</button>
          <span style={{fontWeight:600,fontSize:14}}>{DE_FULL[dayOfWeek(dayBase)]}, {fmtDate(new Date(dayBase+"T12:00:00"))}</span>
          <button style={S.weekBtn} onClick={()=>setDayBase(addDays(dayBase,1))}>Nächster Tag →</button>
          <button style={{...S.weekBtn,marginLeft:8}} onClick={()=>setDayBase(today())}>Heute</button>
        </div>
        <DayGrid data={data} user={user} date={dayBase} todayStr={todayStr} onSlotClick={onSlotClick}/>
      </>)}
      <div style={{display:"flex",gap:20,marginTop:12,flexWrap:"wrap"}}>
        {[["#22C55E","Eigene Buchung"],["#16A34A","Mit Gastspieler"],["#6B7280","Belegt"],["#3B82F6","Training"],["#EF4444","Spieltag"],["#F9FAFB","Verfügbar"]].map(([col,label])=>(<div key={label} style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:13,height:13,borderRadius:3,background:col,border:"1px solid #E5E7EB"}}></div><span style={{fontSize:12,color:"#6B7280"}}>{label}</span></div>))}
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
            const slotColor=isOwn?(booking?.with_guest?"#16A34A":color):bColor;
            return (<td key={di} style={S.tdSlot}><button disabled={isPast&&!booking} onClick={()=>onSlotClick(selCourt,dateStr,slot,booking||null)}
              style={{...S.slotBtn,...(booking?{background:slotColor+"22",borderColor:slotColor,color:slotColor,fontWeight:700}:{}),...(isPast&&!booking?S.slotPast:{})}}>
              {booking?(()=>{
                const bType=booking?.type||"regular";
                const icon=bType==="training"?"🏋️":bType==="match"?"🏆":booking.with_guest?"👥":"";
                let label;
                if(bType==="training"||bType==="match"){
                  label=booking.label||( bType==="training"?"Training":"Spieltag");
                } else {
                  label=isOwn?"✓ Du":booking.userName.split(" ")[0];
                }
                return `${icon} ${label}`.trim();
              })():(isPast?"—":"Frei")}</button></td>);
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
            const slotColor=isOwn?(booking?.with_guest?"#16A34A":color):bColor;
            return (<td key={c.id} style={{...S.tdSlot,borderLeft:`2px solid ${color}22`}}><button disabled={isPastDay&&!booking} onClick={()=>onSlotClick(c.id,date,slot,booking||null)}
              style={{...S.slotBtn,...(booking?{background:slotColor+"22",borderColor:slotColor,color:slotColor,fontWeight:700}:{}),...(isPastDay&&!booking?S.slotPast:{})}}>
              {booking?(()=>{
                const bType=booking?.type||"regular";
                const icon=bType==="training"?"🏋️":bType==="match"?"🏆":booking.with_guest?"👥":"";
                let label;
                if(bType==="training"||bType==="match"){
                  label=booking.label||(bType==="training"?"Training":"Spieltag");
                } else {
                  label=isOwn?"✓ Du":booking.userName.split(" ")[0];
                }
                return `${icon} ${label}`.trim();
              })():(isPastDay?"—":"Frei")}</button></td>);
          })}</tr>))}</tbody>
      </table>
    </div>
  );
}

function MyBookings({data,user,onCancel,guestFee,onMarkPaid}) {
  const todayStr=today();
  const [openGroups,setOpenGroups]=useState({});
  const [showPast,setShowPast]=useState(false);
  const [showPayConfirm,setShowPayConfirm]=useState(false);
  const mine=data.bookings.filter(b=>b.userId===user.id).sort((a,b)=>(a.date+a.slot).localeCompare(b.date+b.slot));
  const upcoming=mine.filter(b=>b.date>=todayStr);
  const past=mine.filter(b=>b.date<todayStr);
  const openGuestBookings=mine.filter(b=>b.with_guest&&!b.guest_paid);
  const openAmount=openGuestBookings.length*guestFee;
  const paidBookings=mine.filter(b=>b.with_guest&&b.guest_paid);
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
      <p style={S.pageSub}>{user.name} · {ROLE_LABELS[user.role]}</p>
      {(openGuestBookings.length>0||paidBookings.length>0)&&(
        <div style={{background:openAmount>0?"linear-gradient(135deg,#FEF3C7,#FDE68A)":"linear-gradient(135deg,#DCFCE7,#BBF7D0)",border:`1.5px solid ${openAmount>0?"#F59E0B":"#22C55E"}`,borderRadius:14,padding:16,marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:openAmount>0?"#92400E":"#166534",marginBottom:4}}>GASTSPIELER-GEBÜHR {new Date().getFullYear()}</div>
            <div style={{fontSize:28,fontWeight:800,color:"#111827"}}>{eur(openAmount)}</div>
            <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{openGuestBookings.length} offene Buchungen · {eur(guestFee)} pro Buchung</div>
          </div>
          {openAmount>0&&(<button style={{...S.primaryBtn,background:"#0F172A",whiteSpace:"nowrap"}} onClick={()=>setShowPayConfirm(true)}>Als bezahlt<br/>markieren</button>)}
          {openAmount===0&&<div style={{fontSize:24}}>✅</div>}
        </div>
      )}
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
        {singles.map(b=>{const court=data.courts.find(c=>c.id===b.courtId);const ci=data.courts.findIndex(c=>c.id===b.courtId);const color=b.with_guest?"#16A34A":COURT_COLORS[ci%COURT_COLORS.length];const d=new Date(b.date+"T12:00:00");
          return (<div key={b.id} style={{...S.card,borderLeft:`4px solid ${color}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div><div style={{fontWeight:700,fontSize:14}}>{court?.name||"?"} · {b.slot} Uhr {b.with_guest?"👥":""}</div><div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{DE_FULL[dayOfWeek(b.date)]}, {fmtDate(d)}</div></div>
            <button style={S.cancelBtn} onClick={()=>onCancel(b.id)}>Stornieren</button>
          </div>);
        })}
      </div>)}
      {upcoming.length===0&&<Em msg="Keine bevorstehenden Buchungen"/>}
      <div>
        <button style={{...S.ghostBtn,fontSize:13,padding:"7px 14px",marginBottom:12}} onClick={()=>setShowPast(p=>!p)}>{showPast?"▲ Vergangene ausblenden":`▼ Vergangene Buchungen (${past.length})`}</button>
        {showPast&&[...past].reverse().slice(0,20).map(b=>{const court=data.courts.find(c=>c.id===b.courtId);const ci=data.courts.findIndex(c=>c.id===b.courtId);const color=b.with_guest?"#16A34A":COURT_COLORS[ci%COURT_COLORS.length];const bType=b.type||"regular";const icon=bType==="training"?"🏋️":bType==="match"?"🏆":b.with_guest?"👥":"📅";const d=new Date(b.date+"T12:00:00");
          return (<div key={b.id} style={{...S.card,borderLeft:`4px solid ${color}`,opacity:.7,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <div><div style={{fontSize:13,fontWeight:600}}>{icon} {court?.name||"?"} · {b.slot} Uhr</div><div style={{fontSize:12,color:"#9CA3AF"}}>{DE_FULL[dayOfWeek(b.date)]}, {fmtDate(d)}</div></div>
            {b.with_guest&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:b.guest_paid?"#DCFCE7":"#FEF3C7",color:b.guest_paid?"#16A34A":"#D97706",fontWeight:700}}>{b.guest_paid?"Bezahlt ✓":"Offen"}</span>}
          </div>);
        })}
      </div>
      {showPayConfirm&&(<div style={S.overlay} onClick={()=>setShowPayConfirm(false)}><div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHeader}><div style={S.modalTitle}>Zahlung bestätigen</div><button style={S.closeBtn} onClick={()=>setShowPayConfirm(false)}>✕</button></div>
        <p style={{color:"#6B7280",fontSize:13,marginBottom:16}}>Bitte bestätige, dass du den offenen Betrag an den Verein bezahlt hast.</p>
        <div style={{background:"#FEF3C7",borderRadius:10,padding:14,textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:11,color:"#92400E",fontWeight:700,marginBottom:4}}>ZU BEZAHLENDER BETRAG</div>
          <div style={{fontSize:28,fontWeight:800,color:"#111827"}}>{eur(openAmount)}</div>
          <div style={{fontSize:12,color:"#6B7280",marginTop:4}}>{openGuestBookings.length} Buchungen × {eur(guestFee)}</div>
        </div>
        <button style={{...S.primaryBtn,width:"100%",background:"#22C55E",color:"#fff",marginBottom:8}} onClick={()=>{onMarkPaid();setShowPayConfirm(false);}}>✓ Ja, ich habe bezahlt</button>
        <button style={{...S.ghostBtn,width:"100%"}} onClick={()=>setShowPayConfirm(false)}>Abbrechen</button>
      </div></div>)}
    </div>
  );
}

function MassBookView({data,user,onMassBook,onCancelMany}) {
  const [tab,setTab]     = useState("create");
  const [type,setType]   = useState("training"); // "training" | "match"

  // Training form
  const [tForm,setTForm] = useState({label:"",dateFrom:today(),dateTo:addDays(today(),27),weekdays:[1,2,3,4],courtIds:data.courts.length>0?[data.courts[0].id]:[],slots:["09:00","10:00"]});
  const [preview,setPreview] = useState(null);

  // Spieltag form
  const [mForm,setMForm] = useState({label:"",date:today(),courtIds:data.courts.length>0?[data.courts[0].id]:[],slots:["09:00"]});
  const [mConflicts,setMConflicts] = useState([]);

  const WD=["Mo","Di","Mi","Do","Fr","Sa","So"];
  const toggleWd =i => setTForm(f=>({...f,weekdays:f.weekdays.includes(i)?f.weekdays.filter(d=>d!==i):[...f.weekdays,i].sort()}));
  const toggleTCourt=id=>setTForm(f=>({...f,courtIds:f.courtIds.includes(id)?f.courtIds.filter(c=>c!==id):[...f.courtIds,id]}));
  const toggleTSlot =s =>setTForm(f=>({...f,slots:f.slots.includes(s)?f.slots.filter(x=>x!==s):[...f.slots,s].sort()}));
  const toggleMCourt=id=>setMForm(f=>({...f,courtIds:f.courtIds.includes(id)?f.courtIds.filter(c=>c!==id):[...f.courtIds,id]}));
  const toggleMSlot =s =>setMForm(f=>({...f,slots:f.slots.includes(s)?f.slots.filter(x=>x!==s):[...f.slots,s].sort()}));

  // Training preview
  const calcPreview=()=>{
    const allDates=datesBetween(tForm.dateFrom,tForm.dateTo).filter(d=>tForm.weekdays.includes(dayOfWeek(d)));
    const total=allDates.length*tForm.courtIds.length*tForm.slots.length;let conflicts=0;
    for(const date of allDates) for(const cId of tForm.courtIds) for(const slot of tForm.slots) if(data.bookings.find(b=>b.courtId===cId&&b.date===date&&b.slot===slot)) conflicts++;
    setPreview({days:allDates.length,total,conflicts,toBook:total-conflicts,dates:allDates.slice(0,5)});
  };

  // Spieltag: check conflicts on the fly
  const calcMatchConflicts=()=>{
    const c=[];
    for(const cId of mForm.courtIds) for(const slot of mForm.slots) if(data.bookings.find(b=>b.courtId===cId&&b.date===mForm.date&&b.slot===slot)) c.push(`${data.courts.find(x=>x.id===cId)?.name} ${slot}`);
    setMConflicts(c);
  };
  const bookMatch=()=>{
    const toBook=[];
    for(const cId of mForm.courtIds) for(const slot of mForm.slots) if(!data.bookings.find(b=>b.courtId===cId&&b.date===mForm.date&&b.slot===slot)) toBook.push({courtId:cId,date:mForm.date,slot});
    if(!toBook.length) return;
    onMassBook({courtIds:mForm.courtIds,dateFrom:mForm.date,dateTo:mForm.date,weekdays:[0,1,2,3,4,5,6],slots:mForm.slots,type:"match",label:mForm.label});
    setMConflicts([]);
  };

  // Groups for manage tab – training only in series, match as single entries
  const myTraining=data.bookings.filter(b=>b.userId===user.id&&b.type==="training"&&b.date>=today());
  const myMatch   =data.bookings.filter(b=>b.userId===user.id&&b.type==="match"   &&b.date>=today());
  const tGroups={};
  for(const b of myTraining){const key=`training__${b.label||""}`;if(!tGroups[key])tGroups[key]={label:b.label,ids:[],count:0,dates:[]};tGroups[key].ids.push(b.id);tGroups[key].count++;tGroups[key].dates.push(b.date);}
  const mGroups={};
  for(const b of myMatch){const key=`match__${b.date}__${b.label||""}`;if(!mGroups[key])mGroups[key]={label:b.label,date:b.date,ids:[],slots:[]};mGroups[key].ids.push(b.id);mGroups[key].slots.push(b.slot);}

  return (
    <div style={{padding:"24px 28px"}}>
      <h1 style={S.pageTitle}>Serienbuchung</h1>
      <p style={S.pageSub}>Training & Spieltage buchen</p>
      <div style={{display:"flex",gap:8,marginBottom:24,marginTop:4}}>
        {[["create","Buchung erstellen"],["manage","Buchungen verwalten"]].map(([id,l])=>(<button key={id} style={{...S.tabBtn,...(tab===id?S.tabBtnActive:{})}} onClick={()=>setTab(id)}>{l}</button>))}
      </div>

      {tab==="create"&&(<>
        {/* Type toggle */}
        <div style={{display:"flex",gap:10,marginBottom:20}}>
          {[["training","🏋️ Training","#3B82F6"],["match","🏆 Spieltag","#EF4444"]].map(([val,lab,col])=>(
            <button key={val} style={{flex:1,padding:"12px 8px",border:`2px solid ${type===val?col:"#E5E7EB"}`,borderRadius:10,background:type===val?col+"11":"#fff",cursor:"pointer",fontWeight:700,color:type===val?col:"#374151",fontSize:14}} onClick={()=>{setType(val);setPreview(null);setMConflicts([]);}}>
              {lab}
            </button>
          ))}
        </div>

        {/* ── TRAINING ── */}
        {type==="training"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
            <div style={S.card}>
              <h3 style={{fontWeight:700,marginBottom:16}}>Parameter</h3>
              <Lbl>Bezeichnung</Lbl>
              <input placeholder="z.B. Herren-Training" value={tForm.label} onChange={e=>setTForm(f=>({...f,label:e.target.value}))} style={{...S.input,marginBottom:14}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div><Lbl>Von</Lbl><input type="date" value={tForm.dateFrom} onChange={e=>setTForm(f=>({...f,dateFrom:e.target.value}))} style={S.input}/></div>
                <div><Lbl>Bis</Lbl><input type="date" value={tForm.dateTo} onChange={e=>setTForm(f=>({...f,dateTo:e.target.value}))} style={S.input}/></div>
              </div>
              <Lbl>Wochentage</Lbl>
              <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                {WD.map((l,i)=>(<button key={i} style={{width:36,height:36,borderRadius:"50%",border:`2px solid ${tForm.weekdays.includes(i)?"#111827":"#E5E7EB"}`,background:tForm.weekdays.includes(i)?"#111827":"#fff",color:tForm.weekdays.includes(i)?"#4ADE80":"#374151",fontWeight:700,cursor:"pointer",fontSize:12}} onClick={()=>toggleWd(i)}>{l}</button>))}
              </div>
              <Lbl>Plätze</Lbl>
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                {data.courts.map((c,i)=>(<button key={c.id} style={{padding:"6px 12px",borderRadius:7,border:`2px solid ${tForm.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]:"#E5E7EB"}`,background:tForm.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]+"11":"#fff",color:tForm.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]:"#374151",fontWeight:600,cursor:"pointer",fontSize:13}} onClick={()=>toggleTCourt(c.id)}>{c.name}</button>))}
              </div>
              <Lbl>Zeitslots</Lbl>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
                {SLOTS.map(s=>(<button key={s} style={{padding:"5px 10px",borderRadius:6,border:`1.5px solid ${tForm.slots.includes(s)?"#111827":"#E5E7EB"}`,background:tForm.slots.includes(s)?"#111827":"#fff",color:tForm.slots.includes(s)?"#4ADE80":"#374151",fontWeight:600,cursor:"pointer",fontSize:12}} onClick={()=>toggleTSlot(s)}>{s}</button>))}
              </div>
              <button style={{...S.primaryBtn,width:"100%"}} onClick={calcPreview}>Vorschau berechnen</button>
            </div>
            <div>
              {!preview&&<div style={{...S.card,textAlign:"center",color:"#9CA3AF",padding:"40px 20px"}}><div style={{fontSize:32,marginBottom:8}}>📊</div><div>Klicke auf „Vorschau berechnen"</div></div>}
              {preview&&(<div style={S.card}>
                <h3 style={{fontWeight:700,marginBottom:16}}>Vorschau</h3>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                  {[["Tage",preview.days,"#111827"],["Gesamt",preview.total,"#111827"],["Belegt",preview.conflicts,"#EF4444"],["Gebucht",preview.toBook,"#22C55E"]].map(([l,v,c])=>(<div key={l} style={{background:"#F9FAFB",borderRadius:8,padding:"12px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:12,color:"#6B7280"}}>{l}</div></div>))}
                </div>
                {preview.dates.map(d=>(<div key={d} style={{fontSize:13,padding:"4px 0",borderBottom:"1px solid #F3F4F6"}}>{DE_FULL[dayOfWeek(d)]}, {fmtDate(new Date(d+"T12:00:00"))}</div>))}
                {preview.days>5&&<div style={{fontSize:12,color:"#9CA3AF",marginTop:4}}>...und {preview.days-5} weitere</div>}
                <div style={{marginTop:16}}>
                  {preview.toBook>0
                    ?<button style={{...S.primaryBtn,width:"100%",background:"#22C55E",color:"#fff"}} onClick={()=>{onMassBook({...tForm,type:"training"});setPreview(null);}}>{preview.toBook} Slots buchen</button>
                    :<div style={{padding:"12px",background:"#FEF3C7",borderRadius:8,fontSize:13,color:"#92400E",textAlign:"center"}}>Alle Slots belegt.</div>
                  }
                </div>
              </div>)}
            </div>
          </div>
        )}

        {/* ── SPIELTAG ── */}
        {type==="match"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
            <div style={S.card}>
              <h3 style={{fontWeight:700,marginBottom:16}}>Spieltag buchen</h3>
              <Lbl>Bezeichnung</Lbl>
              <input placeholder="z.B. Vereinsmeisterschaft" value={mForm.label} onChange={e=>setMForm(f=>({...f,label:e.target.value}))} style={{...S.input,marginBottom:14}}/>
              <Lbl>Datum</Lbl>
              <input type="date" value={mForm.date} onChange={e=>{setMForm(f=>({...f,date:e.target.value}));setMConflicts([]);}} style={{...S.input,marginBottom:14,fontSize:15,fontWeight:700}}/>
              <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"10px 12px",marginBottom:14,fontSize:12,color:"#1D4ED8"}}>
                📅 {DE_FULL[dayOfWeek(mForm.date)]}, {fmtDate(new Date(mForm.date+"T12:00:00"))}
              </div>
              <Lbl>Plätze</Lbl>
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                {data.courts.map((c,i)=>(<button key={c.id} style={{padding:"6px 12px",borderRadius:7,border:`2px solid ${mForm.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]:"#E5E7EB"}`,background:mForm.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]+"11":"#fff",color:mForm.courtIds.includes(c.id)?COURT_COLORS[i%COURT_COLORS.length]:"#374151",fontWeight:600,cursor:"pointer",fontSize:13}} onClick={()=>toggleMCourt(c.id)}>{c.name}</button>))}
              </div>
              <Lbl>Zeitslots</Lbl>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
                {SLOTS.map(s=>(<button key={s} style={{padding:"5px 10px",borderRadius:6,border:`1.5px solid ${mForm.slots.includes(s)?"#EF4444":"#E5E7EB"}`,background:mForm.slots.includes(s)?"#EF444411":"#fff",color:mForm.slots.includes(s)?"#EF4444":"#374151",fontWeight:600,cursor:"pointer",fontSize:12}} onClick={()=>toggleMSlot(s)}>{s}</button>))}
              </div>
              <button style={{...S.primaryBtn,width:"100%"}} onClick={calcMatchConflicts}>Vorschau berechnen</button>
            </div>
            <div>
              {mConflicts.length===0&&mForm.slots.length>0&&(
                <div style={{...S.card,textAlign:"center",color:"#9CA3AF",padding:"40px 20px"}}>
                  <div style={{fontSize:32,marginBottom:8}}>🏆</div>
                  <div>Klicke auf „Vorschau berechnen"</div>
                </div>
              )}
              {mConflicts.length>=0&&mForm.slots.length>0&&mConflicts!==null&&(
                <div style={S.card}>
                  <h3 style={{fontWeight:700,marginBottom:16}}>Vorschau</h3>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                    <div style={{background:"#F9FAFB",borderRadius:8,padding:"12px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:"#22C55E"}}>{mForm.courtIds.length*mForm.slots.length-mConflicts.length}</div><div style={{fontSize:12,color:"#6B7280"}}>Buchbar</div></div>
                    <div style={{background:"#F9FAFB",borderRadius:8,padding:"12px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:"#EF4444"}}>{mConflicts.length}</div><div style={{fontSize:12,color:"#6B7280"}}>Belegt</div></div>
                  </div>
                  {mConflicts.length>0&&(
                    <div style={{background:"#FEE2E2",borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#DC2626"}}>
                      <div style={{fontWeight:700,marginBottom:4}}>Bereits belegt:</div>
                      {mConflicts.map(c=>(<div key={c}>· {c}</div>))}
                    </div>
                  )}
                  <div style={{fontSize:13,padding:"6px 0",borderBottom:"1px solid #F3F4F6",marginBottom:12}}>
                    🏆 {mForm.label||"Spieltag"} · {DE_FULL[dayOfWeek(mForm.date)]}, {fmtDate(new Date(mForm.date+"T12:00:00"))}
                  </div>
                  {(mForm.courtIds.length*mForm.slots.length-mConflicts.length)>0
                    ?<button style={{...S.primaryBtn,width:"100%",background:"#EF4444",color:"#fff"}} onClick={bookMatch}>{mForm.courtIds.length*mForm.slots.length-mConflicts.length} Slots buchen</button>
                    :<div style={{padding:"12px",background:"#FEF3C7",borderRadius:8,fontSize:13,color:"#92400E",textAlign:"center"}}>Alle Slots belegt.</div>
                  }
                </div>
              )}
            </div>
          </div>
        )}
      </>)}

      {tab==="manage"&&(
        <div>
          {/* Training series */}
          {Object.keys(tGroups).length>0&&(<>
            <SectTitle>Training-Serien</SectTitle>
            {Object.entries(tGroups).map(([key,g])=>{
              const dates=g.dates.filter(d=>d>=today()).sort();
              return (
                <div key={key} style={{...S.card,borderLeft:"4px solid #3B82F6",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                  <div>
                    <div style={{fontWeight:700}}>🏋️ Training{g.label&&<span style={{marginLeft:8,fontWeight:400,color:"#6B7280"}}>– {g.label}</span>}</div>
                    <div style={{fontSize:12,color:"#6B7280"}}>{g.count} Slots gesamt · nächster: {dates[0]?fmtDate(new Date(dates[0]+"T12:00:00")):"–"}</div>
                  </div>
                  <button style={S.cancelBtn} onClick={()=>onCancelMany(g.ids)}>Alle stornieren</button>
                </div>
              );
            })}
          </>)}

          {/* Spieltage */}
          {Object.keys(mGroups).length>0&&(<>
            <SectTitle style={{marginTop:16}}>Spieltage</SectTitle>
            {Object.entries(mGroups).sort(([,a],[,b])=>a.date.localeCompare(b.date)).map(([key,g])=>(
              <div key={key} style={{...S.card,borderLeft:"4px solid #EF4444",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontWeight:700}}>🏆 {g.label||"Spieltag"}</div>
                  <div style={{fontSize:12,color:"#6B7280"}}>{fmtDate(new Date(g.date+"T12:00:00"))} · {g.slots.sort().join(", ")} Uhr</div>
                </div>
                <button style={S.cancelBtn} onClick={()=>onCancelMany(g.ids)}>Stornieren</button>
              </div>
            ))}
          </>)}

          {Object.keys(tGroups).length===0&&Object.keys(mGroups).length===0&&<Em msg="Keine Buchungen vorhanden"/>}
        </div>
      )}
    </div>
  );
}

function AdminView({data,allBookings,guestFee,onSaveGuestFee,onAddCourt,onUpdateCourt,onDeleteCourt,onDeleteUser,onCancelBooking,onMarkPaid}) {
  const [tab,setTab]=useState("courts");
  const [courtForm,setCourtForm]=useState({name:"",surface:"Sand"});
  const [editCourt,setEditCourt]=useState(null);
  const [supaUsers,setSupaUsers]=useState([]);
  const [feeInput,setFeeInput]=useState(String(guestFee));
  const [confirmPay,setConfirmPay]=useState(null);
  useEffect(()=>{
    if(tab!=="members"&&tab!=="guest") return;
    sb.from("profiles").select("*").order("created_at").then(({data})=>setSupaUsers(data||[]));
  },[tab]);
  const updateRole=async(uid,role)=>{ await sb.from("profiles").update({role}).eq("id",uid); setSupaUsers(u=>u.map(x=>x.id===uid?{...x,role}:x)); };
  const deleteUser=async(uid)=>{ await onDeleteUser(uid); setSupaUsers(u=>u.filter(x=>x.id!==uid)); };
  const guestStats=supaUsers.map(u=>{
    const userBookings=allBookings.filter(b=>b.user_id===u.id&&b.with_guest);
    const open=userBookings.filter(b=>!b.guest_paid);
    const paid=userBookings.filter(b=>b.guest_paid);
    const paidAmount=paid.reduce((s)=>s+guestFee,0);
    return {...u,openCount:open.length,openAmount:open.length*guestFee,paidAmount,openBookings:open};
  });
  const totalOpen=guestStats.reduce((s,u)=>s+u.openAmount,0);
  const totalPaid=guestStats.reduce((s,u)=>s+u.paidAmount,0);
  return (
    <div style={{padding:"24px 28px"}}>
      <h1 style={S.pageTitle}>Administration</h1>
      <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
        {[["courts","🎾 Plätze"],["members","👥 Mitglieder"],["guest","💶 Gastspieler"],["bookings","📅 Buchungen"]].map(([id,l])=>(<button key={id} style={{...S.tabBtn,...(tab===id?S.tabBtnActive:{})}} onClick={()=>setTab(id)}>{l}</button>))}
      </div>
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
        <div style={{...S.card,background:"#EFF6FF",border:"1px solid #BFDBFE",marginBottom:16}}><div style={{fontWeight:700,marginBottom:6}}>ℹ️ Mitglieder einladen</div><div style={{fontSize:13,color:"#1D4ED8",lineHeight:1.6}}>Mitglieder registrieren sich selbst. Danach kannst du hier Rollen zuweisen oder Mitglieder löschen.</div></div>
        {supaUsers.map(u=>(<div key={u.id} style={{...S.card,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}><Av name={u.name}/><div><div style={{fontWeight:700,fontSize:14}}>{u.name}</div><div style={{fontSize:12,color:"#6B7280",marginTop:2}}>{u.email||"–"}</div><span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#F3F4F6",color:"#374151",fontWeight:600,marginTop:4,display:"inline-block"}}>{ROLE_LABELS[u.role]}</span></div></div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
            <select value={u.role} onChange={e=>updateRole(u.id,e.target.value)} style={{...S.input,width:"auto",padding:"6px 10px",fontSize:12}}><option value="member">Mitglied</option><option value="member2">Mitglied Plus</option><option value="admin">Administrator</option></select>
            <button style={S.cancelBtn} onClick={()=>{if(window.confirm(`${u.name} wirklich löschen?`))deleteUser(u.id);}}>Löschen</button>
          </div>
        </div>))}
      </>)}
      {tab==="guest"&&(<>
        <div style={{background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:13,color:"#1E40AF",marginBottom:10}}>⚙️ Gebühr pro Gastspieler-Buchung</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="number" value={feeInput} onChange={e=>setFeeInput(e.target.value)} min="0" step="0.5" style={{...S.input,maxWidth:100,fontSize:16,fontWeight:800}}/>
            <span style={{fontWeight:700,color:"#6B7280"}}>€</span>
            <button style={S.primaryBtn} onClick={()=>onSaveGuestFee(parseFloat(feeInput)||0)}>Speichern</button>
          </div>
          <div style={{fontSize:11,color:"#6B7280",marginTop:8}}>Gilt für alle zukünftigen Buchungen mit Gastspieler.</div>
        </div>
        <div style={{background:"#0F172A",borderRadius:12,padding:14,marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{textAlign:"center"}}><div style={{color:"#94A3B8",fontSize:11,fontWeight:700,marginBottom:4}}>GESAMT OFFEN {new Date().getFullYear()}</div><div style={{color:"#F59E0B",fontSize:22,fontWeight:800}}>{eur(totalOpen)}</div></div>
          <div style={{textAlign:"center"}}><div style={{color:"#94A3B8",fontSize:11,fontWeight:700,marginBottom:4}}>BEZAHLT {new Date().getFullYear()}</div><div style={{color:"#4ADE80",fontSize:22,fontWeight:800}}>{eur(totalPaid)}</div></div>
        </div>
        <SectTitle>Alle Mitglieder</SectTitle>
        {guestStats.filter(u=>u.openCount>0||u.paidAmount>0).map(u=>(
          <div key={u.id} style={{...S.card,borderLeft:`4px solid ${u.openAmount>0?"#F59E0B":"#22C55E"}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Av name={u.name}/>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{u.name}</div>
                <div style={{fontSize:12,color:"#6B7280"}}>{u.openCount} offen · {eur(u.paidAmount)} bezahlt</div>
                {u.openAmount>0&&<button style={{...S.cancelBtn,background:"#FEF3C7",color:"#D97706",border:"1px solid #FDE68A",marginTop:6,padding:"5px 10px",fontSize:11}} onClick={()=>setConfirmPay({userId:u.id,name:u.name,amount:u.openAmount,count:u.openCount})}>Als bezahlt markieren</button>}
              </div>
            </div>
            <div style={{textAlign:"right"}}><div style={{fontSize:18,fontWeight:800,color:u.openAmount>0?"#D97706":"#22C55E"}}>{eur(u.openAmount)}</div><div style={{fontSize:11,color:"#9CA3AF"}}>offen</div></div>
          </div>
        ))}
        {guestStats.every(u=>u.openCount===0&&u.paidAmount===0)&&<Em msg="Keine Gastspieler-Buchungen vorhanden"/>}
        {guestStats.some(u=>u.paidAmount>0)&&(<><SectTitle style={{marginTop:16}}>Zahlungshistorie</SectTitle>
          <div style={S.card}>{guestStats.filter(u=>u.paidAmount>0).map(u=>(
            <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #F3F4F6"}}>
              <div><div style={{fontWeight:600,fontSize:13}}>{u.name}</div><div style={{fontSize:11,color:"#6B7280"}}>Bezahlt</div></div>
              <div style={{textAlign:"right"}}><div style={{fontWeight:800,color:"#16A34A"}}>{eur(u.paidAmount)}</div><span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#DCFCE7",color:"#16A34A",fontWeight:700}}>Bezahlt ✓</span></div>
            </div>
          ))}</div>
        </>)}
      </>)}
      {tab==="bookings"&&(<div><h3 style={{fontWeight:700,marginBottom:14}}>Bevorstehende Buchungen</h3>
        {data.bookings.filter(b=>b.date>=today()).sort((a,b)=>(a.date+a.slot).localeCompare(b.date+b.slot)).map(b=>{const court=data.courts.find(c=>c.id===b.courtId);const ci=data.courts.findIndex(c=>c.id===b.courtId);const icon=b.type==="training"?"🏋️":b.type==="match"?"🏆":"📅";
          return (<div key={b.id} style={{...S.card,borderLeft:`4px solid ${COURT_COLORS[ci%COURT_COLORS.length]}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:600}}>{icon} {court?.name||"?"} · {b.slot} Uhr · {b.date}</div><div style={{fontSize:12,color:"#6B7280"}}>{b.userName}{b.with_guest?" · 👥 Gastspieler":""}{b.label?` · ${b.label}`:""}</div></div>
            <button style={S.cancelBtn} onClick={()=>onCancelBooking(b.id)}>Stornieren</button>
          </div>);
        })}
      </div>)}
      {confirmPay&&(<div style={S.overlay} onClick={()=>setConfirmPay(null)}><div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={S.modalHeader}><div style={S.modalTitle}>Zahlung bestätigen</div><button style={S.closeBtn} onClick={()=>setConfirmPay(null)}>✕</button></div>
        <p style={{color:"#6B7280",fontSize:13,marginBottom:16}}>{confirmPay.name} als bezahlt markieren?</p>
        <div style={{background:"#FEF3C7",borderRadius:10,padding:14,textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:11,color:"#92400E",fontWeight:700,marginBottom:4}}>BETRAG</div>
          <div style={{fontSize:28,fontWeight:800,color:"#111827"}}>{eur(confirmPay.amount)}</div>
          <div style={{fontSize:12,color:"#6B7280",marginTop:4}}>{confirmPay.count} Buchungen × {eur(guestFee)}</div>
        </div>
        <button style={{...S.primaryBtn,width:"100%",background:"#22C55E",color:"#fff",marginBottom:8}} onClick={()=>{onMarkPaid(confirmPay.userId);setConfirmPay(null);}}>✓ Als bezahlt markieren</button>
        <button style={{...S.ghostBtn,width:"100%"}} onClick={()=>setConfirmPay(null)}>Abbrechen</button>
      </div></div>)}
    </div>
  );
}

function LoginScreen() {
  const [mode,setMode]=useState("login");const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [name,setName]=useState("");const [msg,setMsg]=useState(null);const [loading,setLoading]=useState(false);
  const handle=async()=>{
    setLoading(true);setMsg(null);
    if(mode==="login"){ const {error}=await sb.auth.signInWithPassword({email,password}); if(error)setMsg({text:error.message,type:"error"}); }
    else if(mode==="register"){ const {error}=await sb.auth.signUp({email,password,options:{data:{name}}}); if(error)setMsg({text:error.message,type:"error"}); else setMsg({text:"Bitte bestätige deine E-Mail, dann kannst du dich anmelden.",type:"ok"}); }
    else { const {error}=await sb.auth.resetPasswordForEmail(email); if(error)setMsg({text:error.message,type:"error"}); else setMsg({text:"Passwort-Reset-Link gesendet.",type:"ok"}); }
    setLoading(false);
  };
  return (
    <div style={S.loginWrap}>
      <div style={S.loginCard}>
        <div style={{textAlign:"center",marginBottom:28}}><TennisBall size={52}/><h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,marginTop:12}}>Tennis Herrieden</h1><p style={{color:"#6B7280",fontSize:13,marginTop:4}}>Tennisplatz-Buchungssystem</p></div>
        <div style={{display:"flex",gap:6,marginBottom:20}}>{[["login","Anmelden"],["register","Registrieren"]].map(([m,l])=>(<button key={m} style={{...S.tabBtn,flex:1,...(mode===m?S.tabBtnActive:{})}} onClick={()=>{setMode(m);setMsg(null);}}>{l}</button>))}</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="register"&&<input placeholder="Vollständiger Name" value={name} onChange={e=>setName(e.target.value)} style={S.input}/>}
          <input type="email" placeholder="E-Mail" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} style={S.input}/>
          {mode!=="reset"&&<input type="password" placeholder="Passwort" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} style={S.input}/>}
          {msg&&<div style={{padding:"10px 12px",borderRadius:8,fontSize:13,background:msg.type==="error"?"#FEE2E2":"#DCFCE7",color:msg.type==="error"?"#991B1B":"#166534"}}>{msg.text}</div>}
          <button style={{...S.primaryBtn,marginTop:4,opacity:loading?.6:1}} onClick={handle} disabled={loading}>{loading?"…":mode==="login"?"Anmelden":mode==="register"?"Registrieren":"Link senden"}</button>
          {mode==="login"&&<button style={{background:"none",border:"none",color:"#6B7280",cursor:"pointer",fontSize:12}} onClick={()=>{setMode("reset");setMsg(null);}}>Passwort vergessen?</button>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS & STYLES
// ═══════════════════════════════════════════════════════════════════════════
function TennisBall({size=32}){return(<svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{display:"block",margin:"0 auto"}}><circle cx="16" cy="16" r="15" stroke="#22C55E" strokeWidth="2"/><ellipse cx="16" cy="16" rx="5" ry="14" stroke="#22C55E" strokeWidth="1.5"/><line x1="1" y1="16" x2="31" y2="16" stroke="#22C55E" strokeWidth="1.5"/></svg>);}
function Av({name}){return(<div style={{width:34,height:34,borderRadius:"50%",background:"#22C55E",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{name?.[0]||"?"}</div>);}
function Loading({msg="Laden…"}){return(<div style={{display:"flex",justifyContent:"center",alignItems:"center",height:"100vh",background:"#F9FAFB"}}><div style={{textAlign:"center"}}><div style={{fontSize:36,marginBottom:12}}>🎾</div><div style={{color:"#6B7280"}}>{msg}</div></div></div>);}
function SectTitle({children}){return <div style={{fontSize:13,fontWeight:800,color:"#374151",textTransform:"uppercase",letterSpacing:.6,marginBottom:10}}>{children}</div>;}
function Em({msg}){return <div style={{color:"#9CA3AF",padding:"18px 0",fontSize:14}}>– {msg}</div>;}
function Lbl({children}){return <div style={{fontSize:12,fontWeight:700,color:"#374151",marginBottom:6,textTransform:"uppercase",letterSpacing:.5}}>{children}</div>;}

const K={
  sidebar:    {width:210,background:"#0F172A",display:"flex",flexDirection:"column",padding:"16px 0",flexShrink:0},
  backBtn:    {margin:"0 12px 14px",padding:"6px 12px",background:"none",border:"1px solid #334155",borderRadius:7,color:"#94A3B8",cursor:"pointer",fontSize:12,fontWeight:600,textAlign:"left"},
  logo:       {padding:"0 16px 14px",borderBottom:"1px solid #1E293B",marginBottom:12,display:"flex",flexDirection:"column",gap:4},
  openChip:   {margin:"0 12px 8px",background:"#1E293B",border:"1px solid #F59E0B44",borderRadius:10,padding:"10px 12px",textAlign:"center"},
  page:       {padding:"28px 32px",maxWidth:860},
  summaryBar: {background:"#0F172A",borderRadius:12,padding:"16px 20px",marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"center"},
  payBtn:     {padding:"10px 16px",background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:8,fontWeight:800,cursor:"pointer",fontSize:13,lineHeight:1.4,textAlign:"center"},
  drinkGrid:  {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12},
  drinkTile:  {background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:14,padding:"18px 10px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:5,textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,.06)",transition:"all .15s"},
  drinkTileDone:{background:"#DCFCE7",borderColor:"#22C55E"},
  drinkTilePend:{background:"#FFFBEB",borderColor:"#F59E0B"},
  qtyRow:     {display:"flex",alignItems:"center",border:"1.5px solid #E5E7EB",borderRadius:8,overflow:"hidden",marginTop:4,width:"100%"},
  qtyBtn:     {flex:"0 0 30px",height:28,border:"none",background:"#F9FAFB",color:"#374151",fontSize:16,fontWeight:700,cursor:"pointer"},
  qtyVal:     {flex:1,textAlign:"center",fontWeight:800,fontSize:14,color:"#111827"},
  notierBtn:  {marginTop:4,width:"100%",padding:"8px 0",background:"#0F172A",color:"#4ADE80",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:12},
};

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
  slotBtn:{width:"100%",padding:"5px 4px",border:"1px solid #E5E7EB",borderRadius:5,background:"#F9FAFB",cursor:"pointer",fontSize:11,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%",display:"block"},
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
