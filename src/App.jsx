import { useState, useEffect, useCallback, Fragment, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || "";
const sb = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_ANON) : null;

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
// Strukturelle Farben → CSS Custom Properties (aus index.html, theme-switchable)
// State-Farben → feste Hex-Werte (gleich in Dark & Light)
const T = {
  // Hintergründe (via CSS var → automatisch theme-aware)
  bgPage:   "var(--bg-page)",
  bgCard:   "var(--bg-card)",
  bgBorder: "var(--bg-border)",
  bgInput:  "var(--bg-input)",
  // Text (via CSS var)
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textMuted:     "var(--text-muted)",
  // Zustände (feste Hex — gleich in Dark & Light)
  success: "#22C55E",
  error:   "#EF4444",
  warning: "#F59E0B",
  info:    "#3B82F6",
  purple:  "#8B5CF6",
  orange:  "#F97316",
  // Border-Radien
  rSm:   8,
  rMd:   12,
  rLg:   16,
  rPill: 20,
  // Schriftgrößen
  fzH2:    20,
  fzH3:    16,
  fzBody:  14,
  fzSm:    12,
  fzLabel: 11,
  fzBadge: 10,
  // Padding-Presets
  pCard:    "16px",
  pCompact: "12px 14px",
  pBadge:   "4px 10px",
  pBtn:     "7px 16px",
};
// Theme umschalten: document.documentElement.classList.toggle('theme-light')
const accentBorder = (color) => `1.5px solid ${color}44`;
// Filter-Tab Stil-Generator: einheitlich für alle Screens
// color = Akzentfarbe (hex), active = boolean, solid = aktiv als Vollton (default: semi-transparent)
const ftab = (active, color = "#94A3B8", solid = false) => ({
  flexShrink: 0,
  fontSize: T.fzLabel,
  fontWeight: 700,
  padding: T.pBtn,
  borderRadius: T.rPill,
  border: active ? `1.5px solid ${color}` : `1.5px solid ${color}44`,
  background: active ? (solid ? color : color + "28") : "transparent",
  color: active ? (solid ? "#fff" : color) : T.textMuted,
  cursor: "pointer",
  transition: "all .15s",
  whiteSpace: "nowrap",
});
// ──────────────────────────────────────────────────────────────────────────────

const SLOTS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DE_DAYS  = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const DE_FULL  = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
const DE_MONTH = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const COURT_COLORS = ["#22C55E","#EF4444","#3B82F6","#F59E0B","#8B5CF6","#EC4899","#14B8A6","#F97316"];
const BOOKING_TYPE_COLORS = { regular:"#6B7280", training:"#3B82F6", match:"#EF4444" };
const BOOKING_TYPE_MAP = { regular:{icon:"🎾",color:"#22C55E"}, training:{icon:"🏋️",color:"#3B82F6"}, match:{icon:"🏆",color:"#EF4444"} };
const ROLE_LABELS = { admin:"Administrator", member2:"Mitglied Plus", member:"Mitglied", known:"Bekannt", pending:"Ausstehend" };
const ROLES = ["pending","known","member","member2","admin"];
const PERM_ROLES = ["public","pending","known","member","member2"]; // admin immer true
const MODULES = [
  {id:"booking",       label:"Platzbuchung",         icon:"📅"},
  {id:"kasse",         label:"Getränke",             icon:"🧾"},
  {id:"kassenbuch",    label:"Kassenbuch",           icon:"💰"},
  {id:"clubstream",    label:"Clubstream",           icon:"📰"},
  {id:"btv",           label:"BTV Links",            icon:"🔗"},
  {id:"heimspiel",     label:"Spielwoche",            icon:"📅"},
];
const SPECIAL_MODULES = [
  {id:"einstellungen", label:"Einstellungen",        icon:"⚙️"},
  {id:"massenbuchung", label:"Massenbuchung",        icon:"📆"},
  {id:"kasse_alle",    label:"Kasse: Alle Einträge", icon:"👁️"},
];
const DEFAULT_PERMISSIONS = {
  booking:       ["member","member2","admin"],
  kasse:         ["member","member2","admin"],
  kassenbuch:    ["admin"],
  clubstream:    ["public","pending","known","member","member2","admin"],
  btv:           ["public","pending","known","member","member2","admin"],
  heimspiel:     ["public","pending","known","member","member2","admin"],
  einstellungen: ["admin"],
  massenbuchung: ["member2","admin"],
  kasse_alle:    ["admin"],
};
const KASSE_EMOJIS = ["🍺","🥤","🍎","💧","🍊","☕","🧃","🍵","🥛","🍋","🫖","🧋","🍷","🥂","🫙"];

function fmt(d)      { return d.toISOString().slice(0,10); }
function today()     { return fmt(new Date()); }
function fmtDate(d)  { return `${d.getDate()}. ${DE_MONTH[d.getMonth()]} ${d.getFullYear()}`; }
function fmtDateShort(s) { const d=new Date(s+"T12:00:00"); return d.toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"short"}); }
function eur(n)      { return (n||0).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})+" €"; }
function dayOfWeek(s){ const d=new Date(s+"T12:00:00"); return d.getDay()===0?6:d.getDay()-1; }
function getWeekDays(base){ const m=new Date(base); const dw=m.getDay(); m.setDate(m.getDate()-(dw===0?6:dw-1)); return Array.from({length:7},(_,i)=>{ const d=new Date(m); d.setDate(m.getDate()+i); return d; }); }
function addDays(s,n){ const d=new Date(s+"T12:00:00"); d.setDate(d.getDate()+n); return fmt(d); }
function datesBetween(from,to){ const dates=[]; let cur=from; while(cur<=to){ dates.push(cur); cur=addDays(cur,1); } return dates; }
function daysUntil(s){ const diff=Math.round((new Date(s+"T12:00:00")-new Date())/86400000); if(diff===0)return"Heute"; if(diff===1)return"Morgen"; return`in ${diff} Tagen`; }

// ═══════════════════════════════════════════════════════════════════════════
// SHARED DISPLAY EDIT (share link, kein Login nötig)
// ═══════════════════════════════════════════════════════════════════════════
function SharedDisplayEdit() {
  const [toast, setToast] = useState(null);
  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),2800); };
  return (
    <div style={{minHeight:"100dvh",background:"#F1F5F9",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#0F172A",padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:18}}>🎾</span>
        <span style={{color:"#fff",fontWeight:700,fontSize:14}}>SG Herrieden – Display bearbeiten</span>
      </div>
      <div style={{flex:1,padding:"16px",maxWidth:700,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
        <HeimspieleEdit onToast={showToast} onSaved={()=>{}} reloadKey={0} hideShare/>
      </div>
      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
          background:toast.type==="error"?"#EF4444":"#059669",color:"#fff",
          padding:"10px 20px",borderRadius:8,fontSize:13,fontWeight:600,
          boxShadow:"0 4px 12px rgba(0,0,0,.25)",zIndex:9999}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  if(!SUPABASE_URL) return (
    <div style={{minHeight:"100vh",background:"#0F172A",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"system-ui,sans-serif"}}>
      <div style={{maxWidth:380,textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:16}}>🎾</div>
        <h1 style={{color:"#F1F5F9",fontSize:22,fontWeight:800,margin:"0 0 12px"}}>SG Herrieden Tennis</h1>
        <p style={{color:"#94A3B8",fontSize:15,lineHeight:1.6,margin:"0 0 24px"}}>
          Diese App wurde auf eine neue Plattform umgezogen.
          Bitte registriere dich dort neu — deine Daten sind sicher übertragen.
        </p>
        <a href="https://www.tennis-herrieden.de"
          style={{display:"inline-block",background:"#22C55E",color:"#fff",fontWeight:700,fontSize:15,padding:"13px 28px",borderRadius:12,textDecoration:"none"}}>
          → Zur neuen App
        </a>
        <p style={{color:"#475569",fontSize:12,marginTop:20}}>
          Bei Fragen wende dich an den Vereinsvorstand.
        </p>
      </div>
    </div>
  );

  const shareParam = useState(()=>new URLSearchParams(window.location.search).get("share"))[0];
  const isRecovery = useState(()=>window.location.hash.includes("type=recovery"))[0];
  const [shareValid, setShareValid] = useState(null); // null=prüft, true/false
  const [session,setSession]       = useState(undefined);
  const [profile,setProfile]       = useState(null);
  const [permissions,setPerms]         = useState(DEFAULT_PERMISSIONS);
  const [contentTypePerms,setContentTypePerms] = useState(DEFAULT_CONTENT_TYPE_PERMISSIONS);
  const [screen,setScreen]         = useState("home");
  const [showLogin,setShowLogin]   = useState(false);

  useEffect(()=>{
    if (!shareParam) { setShareValid(false); return; }
    sb.from("settings").select("value").eq("key","display_share_token").single()
      .then(({data})=>setShareValid(data?.value === shareParam));
  },[]);

  useEffect(()=>{
    sb.auth.getSession().then(({data:{session}})=>setSession(session));
    const {data:{subscription}}=sb.auth.onAuthStateChange((_,session)=>setSession(session));
    return ()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    let hiddenAt=null;
    const onVisibility=()=>{
      if(document.visibilityState==="hidden"){ hiddenAt=Date.now(); }
      else if(hiddenAt&&Date.now()-hiddenAt>5*60*1000){ window.location.reload(); }
    };
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>document.removeEventListener("visibilitychange",onVisibility);
  },[]);

  // Permissions immer laden (auch ohne Login, für öffentliche Module)
  useEffect(()=>{
    sb.from("settings").select("value").eq("key","role_permissions").single()
      .then(({data})=>{ try{ if(data?.value) setPerms({...DEFAULT_PERMISSIONS,...JSON.parse(data.value)}); }catch(_){} });
    sb.from("settings").select("value").eq("key","content_type_permissions").single()
      .then(({data})=>{ try{ if(data?.value) setContentTypePerms({...DEFAULT_CONTENT_TYPE_PERMISSIONS,...JSON.parse(data.value)}); }catch(_){} });
  },[]);

  useEffect(()=>{
    if(!session){ setProfile(null); return; }
    sb.from("profiles").select("*").eq("id",session.user.id).single().then(({data})=>setProfile(data));
  },[session]);

  const guestProfile = {role:"public", id:null, email:null, name:"Gast"};

  const canDo = (module) => {
    const role = profile?.role || "public";
    if(role === "admin") return true;
    return (permissions[module]||[]).includes(role);
  };

  const canDoPublic = (module) => (permissions[module]||[]).includes("public");

  if(shareParam && shareValid===null) return <Loading msg="Prüfe Link…"/>;
  if(shareParam && shareValid===true) return <SharedDisplayEdit/>;
  if(session===undefined) return <Loading msg="Verbinde mit Datenbank…"/>;
  if(isRecovery || (session && isRecovery)) return <ResetPasswordScreen/>;
  if(!session) {
    if(showLogin) return <LoginScreen onBack={()=>setShowLogin(false)}/>;
    const pubModules = MODULES.filter(m=>canDoPublic(m.id));
    if(pubModules.length===0) return <LoginScreen/>;
    // Öffentlich zugängliche Screens ohne Login
    if(screen==="clubstream" && canDoPublic("clubstream")) return <ClubstreamApp profile={guestProfile} onBack={()=>setScreen("home")} onLogin={()=>setShowLogin(true)} contentTypePerms={contentTypePerms}/>;
    if(screen==="btv"        && canDoPublic("btv"))        return <BtvLinksScreen onBack={()=>setScreen("home")}/>;
    if(screen==="heimspiel"  && canDoPublic("heimspiel"))  return <HeimspielwocheScreen onBack={()=>setScreen("home")} profile={guestProfile}/>;
    return <HomeScreen profile={guestProfile} canDo={canDoPublic} isGuest
      onGoBooking={()=>setShowLogin(true)} onGoKasse={()=>setShowLogin(true)}
      onGoSettings={()=>setShowLogin(true)} onGoKassenbuch={()=>setShowLogin(true)}
      onGoClubstream={()=>setScreen("clubstream")} onGoBtv={()=>setScreen("btv")}
      onGoHeimspiele={()=>setScreen("heimspiel")} onLogin={()=>setShowLogin(true)}/>;
  }
  if(!profile) return <Loading msg="Lade Profil…"/>;

  let el;
  if(screen==="booking"    && canDo("booking"))       el=<BookingApp     profile={profile} perms={permissions} onBack={()=>setScreen("home")}/>;
  else if(screen==="kasse"      && canDo("kasse"))         el=<KasseApp       profile={profile} perms={permissions} onBack={()=>setScreen("home")}/>;
  else if(screen==="settings"   && canDo("einstellungen")) el=<SettingsApp    profile={profile} onBack={()=>setScreen("home")}/>;
  else if(screen==="kassenbuch" && canDo("kassenbuch"))    el=<KassenbuchApp  profile={profile} onBack={()=>setScreen("home")}/>;
  else if(screen==="clubstream" && canDo("clubstream"))    el=<ClubstreamApp  profile={profile} onBack={()=>setScreen("home")} contentTypePerms={contentTypePerms}/>;
  else if(screen==="btv"        && canDo("btv"))           el=<BtvLinksScreen onBack={()=>setScreen("home")}/>;
  else if(screen==="heimspiel"  && canDo("heimspiel"))     el=<HeimspielwocheScreen onBack={()=>setScreen("home")} profile={profile}/>;
  else el=<HomeScreen profile={profile} canDo={canDo}
    onGoBooking={()=>setScreen("booking")} onGoKasse={()=>setScreen("kasse")}
    onGoSettings={()=>setScreen("settings")} onGoKassenbuch={()=>setScreen("kassenbuch")}
    onGoClubstream={()=>setScreen("clubstream")} onGoBtv={()=>setScreen("btv")}
    onGoHeimspiele={()=>setScreen("heimspiel")}/>;
  return <>{el}<UserWidget profile={profile}/></>;
}

// ═══════════════════════════════════════════════════════════════════════════
// USER WIDGET — Theme & Layout
// ═══════════════════════════════════════════════════════════════════════════
const THEMES = [
  { id:"dark",            label:"Dark",          bg:"#0F172A", card:"#1E293B", cls:""                      },
  { id:"light",           label:"Hell",          bg:"#F1F5F9", card:"#FFFFFF", cls:"theme-light"           },
  { id:"frenchopen",      label:"French Open",   bg:"#1A0700", card:"#2D1005", cls:"theme-frenchopen"      },
  { id:"australianopen",  label:"Australian Open",bg:"#021018", card:"#082535", cls:"theme-australianopen" },
  { id:"usopen",          label:"US Open",       bg:"#020B1A", card:"#0A1E3D", cls:"theme-usopen"         },
  { id:"wimbledon",       label:"Wimbledon",     bg:"#021209", card:"#0A2B17", cls:"theme-wimbledon"       },
];

function applyTheme(id) {
  document.documentElement.classList.remove("theme-light","theme-frenchopen","theme-australianopen","theme-usopen","theme-wimbledon");
  const t = THEMES.find(t=>t.id===id);
  if(t?.cls) document.documentElement.classList.add(t.cls);
  localStorage.setItem("app-theme", id);
}

function UserWidget({profile}) {
  const [open, setOpen]             = useState(false);
  const [theme, setTheme]           = useState(()=>localStorage.getItem("app-theme")||"dark");
  const [forceMobile, setForceMobile] = useState(()=>document.documentElement.classList.contains("force-mobile"));
  const [anonBookings, setAnonBookings] = useState(!!profile?.anonymous_bookings);
  const isDesktop                   = window.innerWidth >= 768;
  const initials = profile?.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase() || "🎨";

  useEffect(()=>{ applyTheme(theme); }, []);

  const handleTheme = (id) => { setTheme(id); applyTheme(id); };
  const handleLayout = () => {
    const next = !forceMobile;
    setForceMobile(next);
    document.documentElement.classList.toggle("force-mobile", next);
  };
  const toggleAnon = async () => {
    const next = !anonBookings;
    setAnonBookings(next);
    await sb.rpc("update_own_anonymous_bookings", { p_value: next });
  };

  return (
    <>
      {open&&<div style={{position:"fixed",inset:0,zIndex:9990}} onClick={()=>setOpen(false)}/>}
      <div style={{position:"fixed",bottom:24,right:20,zIndex:9999,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
        {open&&(
          <div style={{background:T.bgCard,border:`1px solid ${T.bgBorder}`,borderRadius:T.rLg,padding:16,width:220,boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
            {profile?.name&&<div style={{fontSize:12,fontWeight:700,color:T.textMuted,marginBottom:12,paddingBottom:10,borderBottom:`1px solid ${T.bgBorder}`}}>👤 {profile.name}</div>}

            <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Design</div>
            <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:14}}>
              {THEMES.map(t=>(
                <button key={t.id} onClick={()=>handleTheme(t.id)} style={{
                  display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
                  borderRadius:T.rSm,cursor:"pointer",textAlign:"left",width:"100%",
                  border:theme===t.id?`1.5px solid ${T.success}`:`1px solid ${T.bgBorder}`,
                  background:theme===t.id?T.success+"18":"transparent",
                }}>
                  <div style={{width:32,height:20,borderRadius:4,overflow:"hidden",display:"flex",flexShrink:0,border:`1px solid ${T.bgBorder}`}}>
                    <div style={{flex:1,background:t.bg}}/>
                    <div style={{width:10,background:t.card}}/>
                  </div>
                  <span style={{fontSize:13,fontWeight:600,color:T.textPrimary,flex:1}}>{t.label}</span>
                  {theme===t.id&&<span style={{fontSize:11,color:T.success}}>✓</span>}
                </button>
              ))}
            </div>

            {isDesktop&&(
              <div style={{borderTop:`1px solid ${T.bgBorder}`,paddingTop:12}}>
                <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Ansicht</div>
                <button onClick={handleLayout} style={{
                  width:"100%",padding:"8px 10px",borderRadius:T.rSm,cursor:"pointer",
                  border:`1px solid ${T.bgBorder}`,background:"transparent",
                  color:T.textSecondary,fontSize:13,fontWeight:600,
                  display:"flex",alignItems:"center",gap:8,
                }}>
                  <span>{forceMobile?"📱":"🖥️"}</span>
                  <span style={{flex:1,textAlign:"left"}}>{forceMobile?"Mobile Ansicht":"System-Ansicht"}</span>
                  {forceMobile&&<span style={{fontSize:10,color:T.warning}}>temp.</span>}
                </button>
                {forceMobile&&<div style={{fontSize:10,color:T.textMuted,marginTop:4,paddingLeft:2}}>Wird beim Neuladen zurückgesetzt</div>}
              </div>
            )}

            {profile?.role!=="admin"&&(
              <div style={{borderTop:`1px solid ${T.bgBorder}`,paddingTop:12,marginTop:4}}>
                <div style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Buchungen</div>
                <button onClick={toggleAnon} style={{
                  width:"100%",padding:"8px 10px",borderRadius:T.rSm,cursor:"pointer",
                  border:anonBookings?`1.5px solid ${T.info}`:`1px solid ${T.bgBorder}`,
                  background:anonBookings?T.info+"18":"transparent",
                  color:anonBookings?T.info:T.textSecondary,fontSize:13,fontWeight:600,
                  display:"flex",alignItems:"center",gap:8,
                }}>
                  <span>{anonBookings?"🕵️":"👤"}</span>
                  <span style={{flex:1,textAlign:"left"}}>Anonym buchen</span>
                  {anonBookings&&<span style={{fontSize:10,color:T.info}}>✓</span>}
                </button>
                {anonBookings&&<div style={{fontSize:10,color:T.textMuted,marginTop:4,paddingLeft:2}}>Andere sehen nur deine Initialen</div>}
              </div>
            )}

            <div style={{borderTop:`1px solid ${T.bgBorder}`,paddingTop:12,marginTop:4}}>
              <button onClick={()=>sb.auth.signOut()} style={{
                width:"100%",padding:"8px 10px",borderRadius:T.rSm,cursor:"pointer",
                border:`1px solid #EF444430`,background:"#EF444410",
                color:"#EF4444",fontSize:13,fontWeight:600,
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              }}>
                <span>⏏</span> Abmelden
              </button>
            </div>
          </div>
        )}
        <button onClick={()=>setOpen(o=>!o)} style={{
          width:40,height:40,borderRadius:"50%",background:T.success,border:"none",
          color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",
          boxShadow:"0 2px 12px rgba(0,0,0,.4)",letterSpacing:-.5,
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>
          {initials}
        </button>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HEIMSPIELWOCHE SCREEN
function EventsCalendarCopyButton() {
  const [copied, setCopied] = useState(false);
  const url = "webcal://www.tennis-herrieden.de/api/events.ics";
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{marginTop:8,marginBottom:4,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <button onClick={copy}
        style={{display:"flex",alignItems:"center",gap:8,padding:"8px 18px",borderRadius:10,border:"1.5px solid #8B5CF644",background:copied?"#F5F3FF":"#8B5CF610",color:copied?"#7C3AED":"#A78BFA",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .2s"}}>
        <span>{copied ? "✓" : "📅"}</span>
        {copied ? "Link kopiert!" : "Termine als Kalenderabo"}
      </button>
    </div>
  );
}

function CalendarCopyButton() {
  const [copied, setCopied] = useState(false);
  const url = "webcal://www.tennis-herrieden.de/api/calendar.ics";
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{marginTop:24,paddingTop:16,borderTop:"1px solid #E2E8F0",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <button onClick={copy}
        style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",borderRadius:10,border:"1.5px solid #CBD5E1",background:copied?"#F0FDF4":"#F8FAFC",color:copied?"#16A34A":"#475569",fontWeight:700,fontSize:13,cursor:"pointer",transition:"all .2s"}}>
        <span>{copied ? "✓" : "📅"}</span>
        {copied ? "Link kopiert!" : "Kalenderabo-Link kopieren"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
function HeimspielwocheScreen({onBack, profile}) {
  const [allGames,setAllGames]           = useState([]);
  const [allSeasonGames,setAllSeasonGames] = useState([]);
  const [ergebnisMap,setErgebnisMap]     = useState({});
  const [loading,setLoading]             = useState(true);
  const [scrapedAt,setScrapedAt]         = useState(null);
  const [ligaMap,setLigaMap]             = useState({});
  const [filter,setFilter]               = useState("alle");
  const isAdmin = profile?.role === "admin";

  useEffect(()=>{
    sb.from("settings").select("value").eq("key","btv_teams_config").single()
      .then(({data})=>{
        try {
          const cfg = JSON.parse(data?.value)||[];
          const m = {};
          cfg.forEach(t=>{ if(t.name && t.liga) m[t.name]=t.liga; });
          setLigaMap(m);
        } catch(_){}
      });
    sb.from("settings").select("value").eq("key","btv_club_teams_ergebnisse").single()
      .then(({data})=>{
        try {
          const er = JSON.parse(data?.value);
          const map = {};
          (er?.groups||[]).forEach(grp=>{
            (grp.games||[]).forEach(g=>{
              if(!g.played || g.homeScore==null) return;
              const key = `${grp.name}|${g.date}`;
              map[key] = { homeScore: g.homeScore, awayScore: g.awayScore };
            });
          });
          setErgebnisMap(map);
        } catch(_){}
      });
    sb.from("settings").select("value").eq("key","btv_club_teams").single()
      .then(({data})=>{
        try {
          const ct = JSON.parse(data?.value);
          setScrapedAt(ct?.scrapedAt || null);
          const now = new Date(); now.setHours(0,0,0,0);
          const end = new Date(now); end.setDate(end.getDate()+7);
          const week7 = [];
          const season = [];
          (ct?.groups||[]).forEach(g=>{
            (g.homeGames||[]).forEach(game=>{
              if(!game.date) return;
              const d = new Date(game.date+"T12:00:00");
              const entry = { team: g.name||g.teamName, isHome:true, ...game };
              season.push(entry);
              if(d>=now && d<end) week7.push(entry);
            });
            (g.awayGames||[]).forEach(game=>{
              if(!game.date) return;
              const d = new Date(game.date+"T12:00:00");
              const entry = { team: g.name||g.teamName, isHome:false, ...game };
              season.push(entry);
              if(d>=now && d<end) week7.push(entry);
            });
          });
          setAllGames(week7);
          setAllSeasonGames(season);
        } catch(_){}
        setLoading(false);
      });
  },[]);

  const DE_WEEKDAY = ["So","Mo","Di","Mi","Do","Fr","Sa"];
  function fmtGameDate(s) {
    const d = new Date(s+"T12:00:00");
    return `${DE_WEEKDAY[d.getDay()]}, ${d.getDate()}. ${DE_MONTH[d.getMonth()]}`;
  }
  function getISOWeek(dateStr) {
    const d = new Date(Date.UTC(...dateStr.split("-").map((v,i)=>i===1?+v-1:+v)));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const y0 = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil(((d-y0)/86400000+1)/7);
  }
  function getISOWeekYear(dateStr) {
    const d = new Date(Date.UTC(...dateStr.split("-").map((v,i)=>i===1?+v-1:+v)));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    return d.getUTCFullYear();
  }
  function kwMonday(dateStr) {
    const d = new Date(dateStr+"T12:00:00");
    const day = d.getDay()||7;
    d.setDate(d.getDate()-day+1);
    return `${d.getDate()}. ${DE_MONTH[d.getMonth()]}`;
  }
  function kwSunday(dateStr) {
    const d = new Date(dateStr+"T12:00:00");
    const day = d.getDay()||7;
    d.setDate(d.getDate()-day+7);
    return `${d.getDate()}. ${DE_MONTH[d.getMonth()]}`;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const todayKW = getISOWeek(today.toISOString().slice(0,10));
  const todayKWY = getISOWeekYear(today.toISOString().slice(0,10));

  const filtered = allGames.filter(g=>
    filter==="alle" ? true : filter==="heim" ? g.isHome : !g.isHome
  );

  // Gruppieren nach Datum (7-Tage-Tabs)
  const byDate = {};
  filtered.forEach(g=>{
    if(!byDate[g.date]) byDate[g.date]=[];
    byDate[g.date].push(g);
  });
  const groups = Object.keys(byDate).sort().map(date=>({ date, games: byDate[date] }));

  // Gesamt: alle Saisonspiele nach KW gruppieren
  const byKW = {};
  allSeasonGames.forEach(g=>{
    const kw = getISOWeek(g.date);
    const kwy = getISOWeekYear(g.date);
    const key = `${kwy}-${String(kw).padStart(2,"0")}`;
    if(!byKW[key]) byKW[key]={ kw, kwy, firstDate: g.date, games:[] };
    byKW[key].games.push(g);
  });
  const kwGroups = Object.keys(byKW).sort().map(k=>byKW[k]);
  kwGroups.forEach(grp=>{ grp.games.sort((a,b)=>a.date.localeCompare(b.date)||(b.isHome?1:-1)-(a.isHome?1:-1)); });

  const TABS = [
    {key:"alle",      label:"Alle"},
    {key:"heim",      label:"🏠 Heim"},
    {key:"auswaerts", label:"✈️ Auswärts"},
    {key:"gesamt",    label:"Saison"},
  ];

  return (
    <div style={H.wrap}>
      <div style={H.glow}/>
      <div style={H.inner} className="h-inner">
        {/* Header-Card */}
        <div style={{background:T.bgCard,padding:"16px 20px 20px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={onBack}>←</button>
          </div>
          <div style={{...H.header,paddingTop:12}}>
            <h1 style={{...H.title,fontSize:22}}>📅 Spielwoche</h1>
            <p style={H.greeting}>{filter==="gesamt"?"Alle Spiele der Saison":"Heim- & Auswärtsspiele der nächsten 7 Tage"}</p>
          </div>
        </div>

        <div className="h-cols">
        {/* Filter-Card */}
        <div className="h-filter" style={{background:T.bgCard,padding:"12px 20px",border:`1px solid ${T.bgBorder}`,borderRadius:T.rLg,display:"flex",gap:6,overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setFilter(t.key)}
              style={ftab(filter===t.key, T.warning, true)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="h-content">
        {isAdmin && scrapedAt && (()=>{
          const age = (Date.now() - new Date(scrapedAt)) / 86400000;
          const stale = age > 1.5;
          const d = new Date(scrapedAt);
          const label = d.toLocaleDateString("de-DE",{day:"numeric",month:"short"}) + ", " + d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}) + " Uhr";
          return (
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,
              background: stale?"#431407":"#0F2A1A", border:`1px solid ${stale?"#C2410C44":"#16A34A44"}`,
              borderRadius:8, padding:"6px 10px"}}>
              <span style={{fontSize:13}}>{stale?"⚠️":"✅"}</span>
              <span style={{fontSize:11,color: stale?"#FB923C":"#4ADE80"}}>
                Aktualisiert: {label}{stale?" – veraltet!":""}
              </span>
            </div>
          );
        })()}

        {loading && <div style={{textAlign:"center",color:"#64748B",padding:32}}>Lade…</div>}

        {/* ── Gesamt-Ansicht ── */}
        {!loading && filter==="gesamt" && (
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {kwGroups.length===0 && (
              <div style={{textAlign:"center",color:"#64748B",padding:32,fontSize:15}}>Keine Spiele gefunden</div>
            )}
            {kwGroups.map((grp,gi)=>{
              const isCurrentKW = grp.kw===todayKW && grp.kwy===todayKWY;
              return (
                <div key={gi}>
                  {gi>0 && <div style={{height:1,background:"#ffffff10",margin:"8px 0"}}/>}
                  <div style={{fontSize:10,fontWeight:700,color: isCurrentKW?T.warning:T.textMuted,
                    textTransform:"uppercase",letterSpacing:.9,padding:"6px 0 4px"}}>
                    KW {grp.kw} · {kwMonday(grp.firstDate)} – {kwSunday(grp.firstDate)}
                    {isCurrentKW && <span style={{marginLeft:6,fontSize:9,color:T.warning}}>← diese Woche</span>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {grp.games.map((g,i)=>{
                      const played = new Date(g.date+"T23:59:59") < today;
                      const erKey = `${g.team}|${g.date}`;
                      const score = played ? ergebnisMap[erKey] : null;
                      return (
                        <div key={i} style={{background:T.bgCard,borderRadius:T.rSm,
                          border: isCurrentKW&&!played ? `1px solid ${T.warning}44` : `1px solid ${T.bgBorder}`,
                          padding:"8px 12px", opacity: played?0.5:1}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
                            <div style={{fontSize:13,fontWeight:700,color:T.textPrimary,flex:1,minWidth:0,
                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              <span style={{color:T.textMuted,fontWeight:400}}>{g.isHome?"(H)":"(A)"} </span>{g.team}
                            </div>
                            {played
                              ? score
                                ? <span style={{fontSize:13,fontWeight:700,color:T.textPrimary,flexShrink:0}}>{score.homeScore}:{score.awayScore}</span>
                                : <span style={{fontSize:10,color:T.textMuted,fontStyle:"italic",flexShrink:0}}>Gespielt</span>
                              : g.time && <span style={{fontSize:11,color:T.warning,flexShrink:0}}>{g.time} Uhr</span>
                            }
                          </div>
                          <div style={{fontSize:12,color:T.textSecondary,marginTop:2}}>
                            {g.isHome?"vs.":"@"} {g.opponent}
                            <span style={{marginLeft:8,fontSize:11,color:T.textMuted}}>
                              {fmtGameDate(g.date)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Kalenderabo-Button (nur in Saison-Tab) ── */}
        {!loading && filter==="gesamt" && (
          <CalendarCopyButton/>
        )}

        {/* ── 7-Tage-Ansicht (Alle / Heim / Auswärts) ── */}
        {!loading && filter!=="gesamt" && (
          <>
          {groups.length===0 && (
            <div style={{textAlign:"center",color:"#64748B",padding:32,fontSize:15}}>
              Keine {filter==="heim"?"Heim":filter==="auswaerts"?"Auswärts":""}spiele in den nächsten 7 Tagen
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {groups.map(({date,games})=>(
              <div key={date}>
                <div style={{fontSize:T.fzLabel,fontWeight:700,color:T.warning,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>
                  {fmtGameDate(date)}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {games.map((g,i)=>{
                    const accentColor = g.isHome ? T.warning : T.info;
                    return (
                      <div key={i} style={{background:T.bgCard,border:accentBorder(accentColor),borderRadius:T.rMd,padding:T.pCompact}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                          <span style={{fontSize:T.fzBadge,fontWeight:800,color:accentColor,background:accentColor+"22",
                            borderRadius:T.rPill,padding:T.pBadge,letterSpacing:.5,flexShrink:0}}>
                            {g.isHome ? "🏠 HEIM" : "✈️ AUSWÄRTS"}
                          </span>
                          <span style={{fontSize:T.fzLabel,fontWeight:700,color:T.textSecondary,textTransform:"uppercase",letterSpacing:.6,
                            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {g.team}
                          </span>
                          {ligaMap[g.team] && (
                            <span style={{fontSize:T.fzBadge,color:T.textMuted,fontStyle:"italic",flexShrink:0}}>{ligaMap[g.team]}</span>
                          )}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          {g.opponentLogo && (
                            <img src={g.opponentLogo} alt="" style={{width:38,height:38,objectFit:"contain",borderRadius:T.rSm,background:"#F8FAFC18",padding:2,flexShrink:0}}
                              onError={e=>{e.target.style.display="none"}}/>
                          )}
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:T.fzBody,fontWeight:700,color:T.textPrimary,lineHeight:1.3}}>
                              {g.isHome ? "vs." : "@"} {g.opponent}
                            </div>
                            {g.time && <div style={{fontSize:T.fzSm,color:T.warning,marginTop:2}}>⏰ {g.time} Uhr</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </>
        )}

        </div>{/* h-content */}
        </div>{/* h-cols */}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BTV LINKS SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function BtvLinksScreen({onBack}) {
  const [teams,setTeams] = useState([]);
  useEffect(()=>{
    sb.from("settings").select("value").eq("key","btv_teams_config").single()
      .then(({data})=>{ try { setTeams(JSON.parse(data?.value)||[]); } catch(_){} });
  },[]);
  return (
    <div style={H.wrap}>
      <div style={H.glow}/>
      <div style={H.inner} className="h-inner">
        {/* Header-Card */}
        <div style={{background:T.bgCard,padding:"16px 20px 20px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={onBack}>←</button>
          </div>
          <div style={{...H.header,paddingTop:12}}>
            <h1 style={{...H.title,fontSize:22}}>🔗 BTV Links</h1>
            <p style={H.greeting}>Direktlinks zu den BTV-Seiten der Mannschaften</p>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {teams.filter(t=>t.url).map((t,i)=>(
            <div key={i} onClick={()=>window.open(t.url,"_blank")}
              style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                background:T.bgCard,border:accentBorder(T.info),borderRadius:T.rMd,
                padding:"14px 16px",cursor:"pointer"}}>
              <span style={{fontSize:T.fzBody,fontWeight:600,color:T.textPrimary}}>{t.name}</span>
              <span style={{fontSize:T.fzSm,color:T.info}}>BTV →</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOME SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function HomeScreen({profile,canDo,onGoBooking,onGoKasse,onGoSettings,onGoKassenbuch,onGoClubstream,onGoBtv,onGoHeimspiele,isGuest=false,onLogin}) {
  const [nextBookings,setNextBookings] = useState([]);
  const [openLog,setOpenLog]           = useState([]);
  const [openTotal,setOpenTotal]       = useState(0);
  const [btvTeams,setBtvTeams]         = useState([]);
  const [heimspielCount,setHeimspielCount] = useState(0);
  useEffect(()=>{
    // next 2 bookings – nur reguläre Einzelbuchungen
    if(profile.id) sb.from("bookings").select("*,courts(name,surface)").eq("user_id",profile.id).eq("type","regular").gte("date",today()).order("date").order("slot").limit(1)
      .then(({data})=>setNextBookings(data||[]));
    // open kasse items
    if(profile.id) sb.from("kasse_log").select("*").eq("user_id",profile.id).eq("paid",false)
      .then(({data})=>{ setOpenLog(data||[]); setOpenTotal((data||[]).reduce((s,l)=>s+l.price,0)); });
    // btv team links
    sb.from("settings").select("value").eq("key","btv_teams_config").single()
      .then(({data})=>{ try { setBtvTeams(JSON.parse(data?.value)||[]); } catch(_){} });
    // spiele diese woche zählen (heim + auswärts)
    sb.from("settings").select("value").eq("key","btv_club_teams").single()
      .then(({data})=>{
        try {
          const ct = JSON.parse(data?.value);
          const now = new Date(); now.setHours(0,0,0,0);
          const end = new Date(now); end.setDate(end.getDate()+7);
          let count = 0;
          (ct?.groups||[]).forEach(g=>{
            [...(g.homeGames||[]), ...(g.awayGames||[])].forEach(game=>{
              if(!game.date) return;
              const d = new Date(game.date+"T12:00:00");
              if(d>=now && d<end) count++;
            });
          });
          setHeimspielCount(count);
        } catch(_){}
      });
  },[profile.id]);

  return (
    <div style={H.wrap}>
      <div style={H.glow}/>
      <div style={H.inner} className="h-inner">
        {/* Header */}
        <div style={H.header}>
          <TennisBall size={52}/>
          <h1 style={H.title}>Tennis Herrieden</h1>
          <p style={H.greeting}>Hallo, {profile.name} 👋</p>
          {(()=>{
            const badges={admin:{icon:"👑",label:"Administrator",color:"#8B5CF6",bg:"#8B5CF618"},member2:{icon:"⭐",label:"Mitglied Plus",color:"#3B82F6",bg:"#3B82F618"},member:{icon:"🎾",label:"Mitglied",color:"#22C55E",bg:"#22C55E18"},known:{icon:"🤝",label:"Tennisfreund",color:"#F59E0B",bg:"#F59E0B18"},pending:{icon:"🤝",label:"Tennisfreund",color:"#F59E0B",bg:"#F59E0B18"},public:{icon:"👋",label:"Gast",color:"#64748B",bg:"#64748B18"}};
            const b=badges[profile.role]||badges.pending;
            return <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:6,marginTop:6}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:b.bg,border:`1px solid ${b.color}44`}}>
                <span style={{fontSize:12}}>{b.icon}</span>
                <span style={{fontSize:11,fontWeight:700,color:b.color,letterSpacing:.4}}>{b.label}</span>
              </div>
              {isGuest&&<button onClick={onLogin} style={{fontSize:12,fontWeight:700,padding:"5px 14px",borderRadius:20,border:"1px solid #22C55E44",background:"#22C55E18",color:"#4ADE80",cursor:"pointer"}}>→ Anmelden / Registrieren</button>}
            </div>;
          })()}
        </div>

        {/* ── Widgets ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Next bookings */}
          {canDo("booking")&&<div style={H.widget} onClick={onGoBooking}>
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
          </div>}

          {/* Clubstream */}
          {canDo("clubstream")&&<div style={{...H.widgetCompact, borderColor:`${T.success}55`}}
               onClick={onGoClubstream}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>📰</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.7}}>Clubstream</div>
                <div style={{fontSize:13,fontWeight:600,color:"#4ADE80"}}>News & Termine</div>
              </div>
              <span style={{color:"#4ADE80",fontSize:16}}>→</span>
            </div>
          </div>}

          {/* BTV Links */}
          {canDo("btv")&&<div style={{...H.widgetCompact, borderColor:`${T.info}55`}} onClick={onGoBtv}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🔗</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.7}}>BTV Links</div>
                <div style={{fontSize:13,fontWeight:600,color:"#93C5FD"}}>{btvTeams.length} Mannschaften</div>
              </div>
              <span style={{color:"#93C5FD",fontSize:16}}>→</span>
            </div>
          </div>}

          {/* Spielwoche */}
          {canDo("heimspiel")&&<div style={{...H.widgetCompact, borderColor:`${T.warning}55`}} onClick={onGoHeimspiele}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>📅</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.7}}>Spielwoche</div>
                <div style={{fontSize:13,fontWeight:600,color:"#FCD34D"}}>
                  {heimspielCount>0 ? `${heimspielCount} Spiel${heimspielCount!==1?"e":""} in den nächsten 7 Tagen` : "Keine Spiele diese Woche"}
                </div>
              </div>
              <span style={{color:"#FCD34D",fontSize:16}}>→</span>
            </div>
          </div>}

          {/* Open drinks – compact */}
          {canDo("kasse")&&<div style={{...H.widgetCompact,...(openLog.length>0?H.widgetWarn:H.widgetOk)}} onClick={onGoKasse}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18}}>🧾</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.7}}>Offene Getränke</div>
                {openLog.length===0
                  ? <span style={{fontSize:13,fontWeight:700,color:"#4ADE80"}}>✅ Alles bezahlt</span>
                  : <span style={{fontSize:18,fontWeight:800,color:"#F59E0B"}}>{eur(openTotal)} <span style={{fontSize:12,fontWeight:500,color:"#92400E"}}>({openLog.length})</span></span>
                }
              </div>
              <span style={{fontSize:12,color:openLog.length>0?"#D97706":"#475569"}}>→</span>
            </div>
          </div>}
        </div>

        {/* ── Nav tiles ── */}
        <div style={H.navGrid}>
          {canDo("kassenbuch")&&(
            <button style={{...H.navTile,borderColor:"#22C55E33",gridColumn:"1 / -1"}} onClick={onGoKassenbuch}>
              <span style={{fontSize:28}}>💰</span>
              <span style={H.navTileLabel}>Kassenbuch</span>
              <span style={H.navTileSub}>Einnahmen & Ausgaben</span>
            </button>
          )}
          {profile.role==="admin"&&(
            <button style={{...H.navTile,borderColor:"#8B5CF633",gridColumn:"1 / -1"}} onClick={onGoSettings}>
              <span style={{fontSize:28}}>⚙️</span>
              <span style={H.navTileLabel}>Einstellungen</span>
              <span style={H.navTileSub}>Systemkonfiguration</span>
            </button>
          )}
        </div>

      </div>

    </div>
  );
}

const H={
  wrap:         {minHeight:"100vh",background:T.bgPage,fontFamily:"'DM Sans',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",position:"relative",overflowX:"hidden"},
  glow:         {position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:600,height:300,background:"radial-gradient(ellipse at 50% 0%, #22C55E14, transparent 70%)",pointerEvents:"none"},
  inner:        {width:"100%",maxWidth:480,padding:"52px 0 32px",display:"flex",flexDirection:"column",gap:16},
  header:       {textAlign:"center",paddingTop:16},
  title:        {fontSize:T.fzH2+6,fontWeight:800,color:T.textPrimary,letterSpacing:-.8,margin:"12px 0 4px"},
  greeting:     {color:T.textMuted,fontSize:T.fzBody,margin:0},
  widget:       {background:T.bgCard,border:`1.5px solid ${T.bgBorder}`,borderRadius:T.rMd,padding:T.pCard,cursor:"pointer",display:"flex",flexDirection:"column",gap:0},
  widgetCompact:{background:T.bgCard,border:`1.5px solid ${T.bgBorder}`,borderRadius:T.rMd,padding:T.pCompact,cursor:"pointer"},
  widgetWarn:   {borderColor:`${T.warning}55`,background:T.bgCard},
  widgetOk:     {borderColor:`${T.success}33`},
  widgetLabel:  {fontSize:T.fzLabel,fontWeight:700,color:T.textSecondary,textTransform:"uppercase",letterSpacing:.8,marginBottom:6},
  widgetLink:   {fontSize:T.fzSm,color:T.textMuted,marginTop:10,textAlign:"right"},
  bookingRow:   {display:"flex",alignItems:"center",gap:10,marginBottom:4},
  bookingDot:   {width:34,height:34,borderRadius:T.rSm,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  navGrid:      {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  navTile:      {background:T.bgCard,border:`1.5px solid ${T.bgBorder}`,borderRadius:T.rMd,padding:"18px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6},
  navTileLabel: {fontSize:T.fzBody,fontWeight:700,color:T.textSecondary},
  navTileSub:   {fontSize:T.fzLabel,color:T.textMuted},
  backBtn:      {background:"none",border:"none",color:T.textSecondary,fontSize:22,cursor:"pointer",padding:"0 4px",lineHeight:1,flexShrink:0},
};

// Einheitlicher Screen-Header mit Back-Button + Titel
function ScreenHeader({onBack, title, children}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
      <button onClick={onBack} style={H.backBtn}>←</button>
      <h2 style={{color:T.textPrimary,fontSize:T.fzH2,fontWeight:800,margin:0,flex:1}}>{title}</h2>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLUBSTREAM APP  (admin-only, reads from news_items in same Supabase project)
// ═══════════════════════════════════════════════════════════════════════════
const CS_ICONS  = {club_news:"📢",important_notice:"⚠️",social_post:"📱",event:"🗓",match_result:"🎾",court_notice:"🏟️",discussion:"💬",document:"📄",training_notice:"🏃",team_news:"👥",external_article:"🔗"};
const CS_LABELS = {club_news:"Vereinsnews",important_notice:"Wichtig",social_post:"Social",event:"Termin",match_result:"Ergebnis",court_notice:"Platz",discussion:"Diskussion",document:"Dokument",training_notice:"Training",team_news:"Mannschaft",external_article:"Artikel"};
const CS_COLORS = {club_news:"#3B82F6",important_notice:"#EF4444",social_post:"#6B7280",event:"#8B5CF6",match_result:"#22C55E",court_notice:"#F97316",discussion:"#6366F1",document:"#64748B",training_notice:"#06B6D4",team_news:"#EAB308",external_article:"#94A3B8"};
const DEFAULT_CONTENT_TYPE_PERMISSIONS = {photos:[], ...Object.fromEntries(Object.keys(CS_ICONS).map(k=>[k,[]]))};

function csTimeAgo(s) {
  if(!s) return "";
  const diff = Math.floor((Date.now()-new Date(s))/1000);
  if(diff<60) return "gerade eben";
  if(diff<3600) return `vor ${Math.floor(diff/60)} Min.`;
  if(diff<86400) return `vor ${Math.floor(diff/3600)} Std.`;
  const d = new Date(s);
  return `${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
}

function csStripHtml(html) {
  if(!html) return "";
  return html
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/p>/gi,"\n\n")
    .replace(/<[^>]+>/g,"")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ")
    .replace(/\n{3,}/g,"\n\n").trim();
}

function ClubstreamDetail({item,onBack}) {
  const color   = CS_COLORS[item.type]||"#94A3B8";
  const icon    = CS_ICONS[item.type]||"📰";
  const label   = CS_LABELS[item.type]||item.type;
  const isRueckblick = item.age_group === "wochenrueckblick";
  const bodyText = isRueckblick ? "" : (csStripHtml(item.content) || item.summary || "");
  return (
    <div style={H.wrap}>
      <div style={H.inner} className="h-inner">
        <ScreenHeader onBack={onBack} title="Beitrag"/>

        <div style={{background:T.bgCard,border:`1.5px solid ${color}44`,borderRadius:14,padding:"16px 14px",display:"flex",flexDirection:"column",gap:10}}>
          {/* Typ-Badge */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:22}}>{icon}</span>
            <span style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase",letterSpacing:.8}}>{label}</span>
            {item.is_pinned&&<span style={{fontSize:11,color:"#EAB308"}}>📌 Angeheftet</span>}
            {item.priority==="urgent"&&<span style={{fontSize:11,color:"#EF4444",fontWeight:800}}>DRINGEND</span>}
          </div>

          {/* Titel */}
          <h2 style={{fontSize:18,fontWeight:800,color:"#F1F5F9",margin:0,lineHeight:1.3}}>{item.title}</h2>

          {/* Termin-Infos */}
          {item.event_start&&(()=>{
            const fmt=(iso,withTime)=>{
              const d=new Date(iso);
              const t=d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit",timeZone:"UTC"});
              const day=d.toLocaleDateString("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});
              return withTime&&t!=="00:00"?`${day}, ${t} Uhr`:day;
            };
            const sHasTime=new Date(item.event_start).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit",timeZone:"UTC"})!=="00:00";
            const eHasTime=item.event_end&&new Date(item.event_end).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit",timeZone:"UTC"})!=="00:00";
            return(
              <p style={{fontSize:13,color:"#8B5CF6",margin:0,fontWeight:600}}>
                {fmt(item.event_start,sHasTime)}
                {item.event_end&&<span style={{color:"#64748B",fontWeight:400}}> – {fmt(item.event_end,eHasTime)}</span>}
              </p>
            );
          })()}
          {item.event_location&&<p style={{fontSize:13,color:"#64748B",margin:0}}>📍 {item.event_location}</p>}

          {/* Spielergebnis */}
          {item.result_home!=null&&item.result_away!=null&&(
            <div style={{textAlign:"center",padding:"12px 10px",background:"#0F172A",borderRadius:10}}>
              <span style={{fontSize:32,fontWeight:900,color:item.result_home>item.result_away?"#22C55E":"#EF4444"}}>
                {item.result_home} : {item.result_away}
              </span>
              {(item.team_name||item.opponent)&&(
                <p style={{fontSize:12,color:"#64748B",margin:"6px 0 0"}}>{item.team_name||"SG Herrieden"} vs. {item.opponent||"?"}</p>
              )}
              {item.league&&<p style={{fontSize:11,color:"#475569",margin:"2px 0 0"}}>{item.league}{item.age_group?` · ${item.age_group}`:""}</p>}
            </div>
          )}

          {/* Wochenrückblick Ergebnisliste */}
          {isRueckblick&&(()=>{
            let games=[];
            try{games=JSON.parse(item.content||"[]");}catch(_){}
            return games.length>0?(
              <div style={{display:"flex",flexDirection:"column",gap:1,borderRadius:10,overflow:"hidden"}}>
                {games.map((g,i)=>{
                  const won=g.homeScore>g.awayScore, lost=g.homeScore<g.awayScore;
                  const clr=won?"#22C55E":lost?"#EF4444":"#F59E0B";
                  const lbl=won?"Sieg":lost?"Niederlage":"Unentschieden";
                  return(
                    <div key={i} style={{background:"#0F172A",padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:3,height:36,borderRadius:2,background:clr,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:700,color:"#F1F5F9"}}>{g.team}</div>
                        <div style={{fontSize:11,color:"#64748B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.isHome?"vs.":"@"} {g.opponent}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:18,fontWeight:900,color:clr,letterSpacing:1}}>{g.homeScore}:{g.awayScore}</div>
                        <div style={{fontSize:10,color:clr}}>{lbl}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ):null;
          })()}

          {/* Bild */}
          {item.image_url&&(
            <img src={item.image_url} alt="" style={{width:"100%",borderRadius:10,objectFit:"contain"}}/>
          )}

          {/* Haupttext */}
          {bodyText&&(
            <p style={{fontSize:14,color:"#94A3B8",lineHeight:1.7,margin:0,whiteSpace:"pre-line"}}>{bodyText}</p>
          )}

          {/* Gültigkeitszeitraum */}
          {(item.valid_from||item.valid_until)&&(
            <div style={{display:"flex",gap:12,fontSize:12,color:"#F97316"}}>
              {item.valid_from&&<span>Ab: {new Date(item.valid_from).toLocaleDateString("de-DE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})} Uhr</span>}
              {item.valid_until&&<span>Bis: {new Date(item.valid_until).toLocaleDateString("de-DE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})} Uhr</span>}
            </div>
          )}

          {/* Zeitstempel */}
          <p style={{fontSize:11,color:"#475569",margin:0,borderTop:"1px solid #334155",paddingTop:8}}>{csTimeAgo(item.published_at)}</p>
        </div>

      </div>
    </div>
  );
}

function ClubstreamApp({profile,onBack,onLogin,contentTypePerms=DEFAULT_CONTENT_TYPE_PERMISSIONS}) {
  const [items,setItems]         = useState([]);
  const [photos,setPhotos]       = useState([]);
  const [pending,setPending]     = useState(0);
  const [loading,setLoading]     = useState(true);
  const [detail,setDetail]       = useState(null);
  const [typeFilter,setTypeFilter] = useState(null);
  const [lbPhotos,setLbPhotos]       = useState([]);
  const [lbIdx,setLbIdx]             = useState(0);
  const [kwIdxMap,setKwIdxMap]       = useState({});
  const [uploading,setUploading]     = useState(false);
  const [uploadErr,setUploadErr]     = useState(null);
  const [pendingFile,setPendingFile] = useState(null);
  const [pendingCaption,setPendingCaption] = useState("");
  const lbTouchX                     = useRef(null);
  const lbSwiped                     = useRef(false);
  const kwTouchX                     = useRef(null);
  const allTouchX                    = useRef(null);
  const allSwiped                    = useRef(false);
  const [allIdxMap,setAllIdxMap]     = useState({});
  const fileInputRef                 = useRef(null);

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sb.from("news_items")
        .select("id,title,type,summary,content,published_at,is_pinned,priority,event_start,event_end,event_location,result_home,result_away,team_name,opponent,league,age_group,valid_until,valid_from,image_url")
        .eq("status","published")
        .is("deleted_at",null)
        .order("is_pinned",{ascending:false})
        .order("published_at",{ascending:false})
        .limit(60),
      sb.from("news_items").select("*",{count:"exact",head:true}).eq("status","pending_review").is("deleted_at",null),
      sb.from("club_photos").select("id,url,image_url,caption,created_at,user_id").order("created_at",{ascending:false}).limit(200),
    ]).then(([{data:news,error},{count},{data:pics}])=>{
      if(!error) setItems(news||[]);
      setPending(count||0);
      setPhotos(pics||[]);
      setLoading(false);
    });
  },[]);

  if(detail) return <ClubstreamDetail item={detail} onBack={()=>setDetail(null)}/>;

  const uploadPhoto = async (file, caption) => {
    setUploading(true); setUploadErr(null);
    try {
      const ext  = file.name.split(".").pop();
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const {error:upErr} = await sb.storage.from("club-photos").upload(path, file, {contentType: file.type});
      if(upErr) throw upErr;
      const {data:{publicUrl}} = sb.storage.from("club-photos").getPublicUrl(path);
      const {error:insErr} = await sb.from("club_photos").insert({image_url: publicUrl, caption: caption||null, user_id: profile.id});
      if(insErr) throw insErr;
      const {data:newPhotos} = await sb.from("club_photos").select("id,url,image_url,caption,created_at,user_id").order("created_at",{ascending:false}).limit(200);
      setPhotos(newPhotos||[]); setPendingFile(null); setPendingCaption("");
    } catch(e) { setUploadErr(e.message||"Fehler beim Upload"); }
    setUploading(false);
  };

  const deletePhoto = async (photo) => {
    if(!window.confirm("Dieses Foto löschen?")) return;
    const path = (photo.image_url||"").split("/club-photos/")[1];
    if(path) await sb.storage.from("club-photos").remove([path]);
    await sb.from("club_photos").delete().eq("id", photo.id);
    const {data} = await sb.from("club_photos").select("id,url,image_url,caption,created_at,user_id").order("created_at",{ascending:false}).limit(200);
    setPhotos(data||[]);
    setKwIdxMap({});
  };

  const getKWLabel = (dateStr) => {
    const d = new Date(dateStr);
    const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    tmp.setDate(tmp.getDate() + 3 - (tmp.getDay()+6)%7);
    const w1 = new Date(tmp.getFullYear(),0,4);
    const kw = 1+Math.round(((tmp-w1)/86400000-3+(w1.getDay()+6)%7)/7);
    return `KW ${kw} / ${tmp.getFullYear()}`;
  };

  const canSeeType = (type) => profile.role==="admin" || (contentTypePerms[type]||[]).includes(profile.role);
  const canSeePhotos = canSeeType("photos");
  const visibleItems = items.filter(i=>canSeeType(i.type));

  // Typen die tatsächlich in den Daten vorkommen, für Filter-Pills
  const availableTypes = [...new Set(visibleItems.map(i=>i.type))];
  const allPhotos = canSeePhotos ? photos.filter(p=>{const u=p.image_url||p.url||""; return u&&!u.includes("irszeiamvwyrntyauury");}) : [];
  const kwGroups = (()=>{
    const map = {}; const order = [];
    allPhotos.forEach(p=>{ const k=getKWLabel(p.created_at); if(!map[k]){map[k]=[];order.push(k);} map[k].push(p); });
    return order.map(k=>({label:k, photos:map[k]}));
  })();
  // Pro KW nur eine Karte in Alle (neueste pro Woche als Repräsentant)
  const kwCards = kwGroups.map(g=>({...g.photos[0], _isPhoto:true, _kwLabel:g.label, _kwPhotos:g.photos, published_at:g.photos[0].created_at}));
  const filtered = typeFilter && typeFilter!=="__fotos__"
    ? typeFilter==="event"
      ? (()=>{
          const now = new Date();
          const ev = visibleItems.filter(i=>i.type==="event");
          const future = ev.filter(i=>new Date(i.event_start||i.published_at)>=now)
            .sort((a,b)=>new Date(a.event_start||a.published_at)-new Date(b.event_start||b.published_at));
          const past = ev.filter(i=>new Date(i.event_start||i.published_at)<now)
            .sort((a,b)=>new Date(a.event_start||a.published_at)-new Date(b.event_start||b.published_at))
            .map(i=>({...i,_isPast:true}));
          return [...future,...past];
        })()
      : visibleItems.filter(i=>i.type===typeFilter)
    : typeFilter===null
      ? [...visibleItems, ...kwCards].sort((a,b)=>new Date(b.published_at)-new Date(a.published_at))
      : visibleItems;

  return (
    <div style={H.wrap}>
      <div style={H.inner} className="h-inner">
        {/* Header-Card */}
        <div style={{background:T.bgCard,padding:"16px 20px 20px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={onBack}>←</button>
            <div style={{flex:1}}/>
            {pending>0&&(
              <span style={{fontSize:11,fontWeight:700,color:"#F59E0B",background:"#F59E0B18",border:"1px solid #F59E0B44",borderRadius:20,padding:"3px 10px"}}>
                ⏳ {pending} ausstehend
              </span>
            )}
            {profile.role==="admin"&&(
              <button onClick={async()=>{
                const {data:{session}}=await sb.auth.getSession();
                const base="https://clubstream-hub.vercel.app/admin";
                const url=session?.access_token
                  ?`${base}/#access_token=${session.access_token}&refresh_token=${session.refresh_token}&token_type=bearer`
                  :base;
                window.open(url,"_blank");
              }} style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:20,border:"1px solid #8B5CF644",background:"#8B5CF618",color:"#A78BFA",cursor:"pointer"}}>
                ⚙️ Admin
              </button>
            )}
          </div>
          <div style={{...H.header,paddingTop:12}}>
            <h1 style={{...H.title,fontSize:22}}>📰 Clubstream</h1>
            <p style={H.greeting}>SG Herrieden · News & Vereinsmeldungen</p>
          </div>
        </div>

        <div className="h-cols">
        {/* Filter-Card */}
        {!loading&&(
          <div className="h-filter" style={{background:T.bgCard,padding:"12px 20px",border:`1px solid ${T.bgBorder}`,borderRadius:T.rLg,display:"flex",gap:6,overflowX:"auto"}}>
            <button onClick={()=>setTypeFilter(null)} style={ftab(typeFilter===null, T.textSecondary, true)}>
              Alle
            </button>
            {availableTypes.map(t=>{
              const color = CS_COLORS[t]||"#94A3B8";
              return (
                <button key={t} onClick={()=>setTypeFilter(typeFilter===t?null:t)}
                  style={ftab(typeFilter===t, color)}>
                  {CS_ICONS[t]} {CS_LABELS[t]||t}
                </button>
              );
            })}
            {canSeePhotos&&photos.filter(p=>p.image_url||p.url).length>0&&(
              <button onClick={()=>setTypeFilter(typeFilter==="__fotos__"?null:"__fotos__")}
                style={ftab(typeFilter==="__fotos__","#EC4899")}>
                🖼️ Fotos ({photos.length})
              </button>
            )}
          </div>
        )}

        {/* Kalenderabo-Button für Termine */}
        {typeFilter==="event"&&<EventsCalendarCopyButton/>}

        <div className="h-content">

        {/* Lightbox mit Swipe + Navigation */}
        {lbPhotos.length>0&&(
          <div
            style={{position:"fixed",inset:0,background:"#000000EE",zIndex:1000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}
            onClick={()=>{if(!lbSwiped.current)setLbPhotos([]);}}
            onTouchStart={e=>{lbTouchX.current=e.touches[0].clientX;lbSwiped.current=false;}}
            onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-(lbTouchX.current||0);if(Math.abs(dx)>30){lbSwiped.current=true;if(dx>0&&lbIdx>0)setLbIdx(i=>i-1);else if(dx<0&&lbIdx<lbPhotos.length-1)setLbIdx(i=>i+1);}}}
          >
            <img src={lbPhotos[lbIdx]?.image_url||lbPhotos[lbIdx]?.url} alt={lbPhotos[lbIdx]?.caption||""}
              style={{maxWidth:"100%",maxHeight:"78vh",borderRadius:10,objectFit:"contain"}}
              onClick={e=>e.stopPropagation()}/>
            {lbPhotos[lbIdx]?.caption&&<p style={{color:"#F1F5F9",fontSize:13,marginTop:10,textAlign:"center",maxWidth:400,padding:"0 8px"}}>{lbPhotos[lbIdx].caption}</p>}
            <div style={{display:"flex",alignItems:"center",gap:16,marginTop:12}}>
              <button onClick={e=>{e.stopPropagation();setLbIdx(i=>Math.max(0,i-1));}} disabled={lbIdx===0}
                style={{background:"#ffffff22",border:"none",color:"#fff",fontSize:22,borderRadius:"50%",width:40,height:40,cursor:lbIdx===0?"default":"pointer",opacity:lbIdx===0?.3:1}}>‹</button>
              <span style={{color:"#94A3B8",fontSize:12}}>{lbIdx+1} / {lbPhotos.length}</span>
              <button onClick={e=>{e.stopPropagation();setLbIdx(i=>Math.min(lbPhotos.length-1,i+1));}} disabled={lbIdx===lbPhotos.length-1}
                style={{background:"#ffffff22",border:"none",color:"#fff",fontSize:22,borderRadius:"50%",width:40,height:40,cursor:lbIdx===lbPhotos.length-1?"default":"pointer",opacity:lbIdx===lbPhotos.length-1?.3:1}}>›</button>
            </div>
            <button onClick={()=>setLbPhotos([])} style={{marginTop:10,color:"#64748B",fontSize:12,background:"none",border:"none",cursor:"pointer"}}>✕ Schließen</button>
          </div>
        )}

        {/* Upload-Modal mit Caption */}
        {pendingFile&&(
          <div style={{position:"fixed",inset:0,background:"#000000CC",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"#1E293B",borderRadius:16,padding:20,width:"100%",maxWidth:380,border:"1.5px solid #EC489944"}} onClick={e=>e.stopPropagation()}>
              <img src={URL.createObjectURL(pendingFile)} alt="" style={{width:"100%",height:200,objectFit:"cover",borderRadius:10,display:"block",marginBottom:14}}/>
              <input
                value={pendingCaption} onChange={e=>setPendingCaption(e.target.value)}
                placeholder="Kommentar zum Foto (optional)"
                style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #334155",background:"#0F172A",color:"#F1F5F9",fontSize:13,boxSizing:"border-box",marginBottom:10}}
              />
              {uploadErr&&<div style={{fontSize:12,color:"#EF4444",marginBottom:8}}>{uploadErr}</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setPendingFile(null);setPendingCaption("");setUploadErr(null);}}
                  style={{flex:1,padding:"10px",borderRadius:10,border:"1.5px solid #334155",background:"transparent",color:"#94A3B8",fontSize:13,cursor:"pointer"}}>
                  Abbrechen
                </button>
                <button onClick={()=>uploadPhoto(pendingFile,pendingCaption)} disabled={uploading}
                  style={{flex:2,padding:"10px",borderRadius:10,border:"none",background:"#EC4899",color:"#fff",fontSize:13,fontWeight:700,cursor:uploading?"wait":"pointer"}}>
                  {uploading?"⏳ Hochladen…":"📤 Hochladen"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fotos nach KW gruppiert */}
        {typeFilter==="__fotos__"?(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {kwGroups.length===0&&(
              <div style={{background:"#1E293B",border:"1.5px solid #334155",borderRadius:14,padding:"32px 14px",textAlign:"center"}}>
                <span style={{fontSize:32}}>🖼️</span>
                <p style={{color:"#475569",fontSize:13,marginTop:8}}>Noch keine Fotos hochgeladen</p>
              </div>
            )}
            {kwGroups.map(({label,photos:kphotos})=>{
              const idx = kwIdxMap[label]||0;
              const cur = kphotos[idx];
              const prev = ()=>setKwIdxMap(m=>({...m,[label]:Math.max(0,(m[label]||0)-1)}));
              const next = ()=>setKwIdxMap(m=>({...m,[label]:Math.min(kphotos.length-1,(m[label]||0)+1)}));
              return (
                <div key={label}>
                  <div style={{fontSize:12,fontWeight:700,color:"#EC4899",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>
                    🗓 {label} · {kphotos.length} {kphotos.length===1?"Foto":"Fotos"}
                  </div>
                  <div style={{position:"relative",borderRadius:14,overflow:"hidden",background:"#0F172A",border:"1.5px solid #EC489933"}}
                    onTouchStart={e=>kwTouchX.current=e.touches[0].clientX}
                    onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-(kwTouchX.current||0);if(dx>50)prev();else if(dx<-50)next();}}>
                    <img src={cur.image_url||cur.url} alt={cur.caption||""}
                      style={{width:"100%",height:240,objectFit:"cover",display:"block",cursor:"pointer"}}
                      onClick={()=>{setLbPhotos(kphotos);setLbIdx(idx);}}/>
                    {idx>0&&<button onClick={prev} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",background:"#00000088",border:"none",color:"#fff",fontSize:20,borderRadius:"50%",width:34,height:34,cursor:"pointer"}}>‹</button>}
                    {idx<kphotos.length-1&&<button onClick={next} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"#00000088",border:"none",color:"#fff",fontSize:20,borderRadius:"50%",width:34,height:34,cursor:"pointer"}}>›</button>}
                    <div style={{position:"absolute",bottom:8,right:10,background:"#00000088",borderRadius:20,padding:"2px 8px",fontSize:11,color:"#fff",fontWeight:700}}>{idx+1}/{kphotos.length}</div>
                    {(cur.user_id===profile.id||profile.role==="admin")&&(
                      <button onClick={e=>{e.stopPropagation();deletePhoto(cur);}}
                        style={{position:"absolute",top:8,right:8,background:"#EF444488",border:"none",color:"#fff",fontSize:14,borderRadius:"50%",width:30,height:30,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        🗑
                      </button>
                    )}
                  </div>
                  {cur.caption&&<div style={{marginTop:6,fontSize:13,color:"#94A3B8",padding:"0 2px"}}>{cur.caption}</div>}
                  <div style={{marginTop:3,fontSize:11,color:"#475569"}}>{new Date(cur.created_at).toLocaleDateString("de-DE",{day:"numeric",month:"long",year:"numeric"})}</div>
                  <div style={{display:"flex",gap:4,marginTop:8,overflowX:"auto",paddingBottom:2}}>
                    {kphotos.map((p,i)=>(
                      <div key={p.id} onClick={()=>setKwIdxMap(m=>({...m,[label]:i}))}
                        style={{flexShrink:0,width:52,height:52,borderRadius:6,overflow:"hidden",cursor:"pointer",border:`2px solid ${i===idx?"#EC4899":"transparent"}`,opacity:i===idx?1:.55,transition:"all .15s"}}>
                        <img src={p.image_url||p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <input ref={fileInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0]){setPendingFile(e.target.files[0]);e.target.value="";}}}/>
            <button onClick={()=>fileInputRef.current.click()}
              style={{width:"100%",padding:"12px",borderRadius:12,border:"1.5px dashed #EC489966",background:"#EC489908",color:"#F472B6",fontSize:13,fontWeight:700,cursor:"pointer"}}>
              📷 Foto hochladen
            </button>
          </div>
        ):(

        /* Liste */
        loading?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[1,2,3].map(i=>(
              <div key={i} style={{background:T.bgCard,border:`1.5px solid ${T.bgBorder}`,borderRadius:T.rMd,height:72,opacity:.4}}/>
            ))}
          </div>
        ):filtered.length===0?(
          <div style={{background:T.bgCard,border:`1.5px solid ${T.bgBorder}`,borderRadius:T.rMd,padding:"32px 14px",textAlign:"center"}}>
            <span style={{fontSize:32}}>📭</span>
            <p style={{color:T.textMuted,fontSize:T.fzBody,marginTop:8}}>{typeFilter?"Keine Beiträge in dieser Kategorie":"Noch keine veröffentlichten News"}</p>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {filtered.map(item=>{
              if(item._isPhoto) {
                const kwPhotos = item._kwPhotos||[item];
                const idx = allIdxMap[item._kwLabel]||0;
                const cur = kwPhotos[idx]||kwPhotos[0];
                const src = cur.image_url||cur.url;
                const goPrev = e=>{ e.stopPropagation(); setAllIdxMap(m=>({...m,[item._kwLabel]:Math.max(0,(m[item._kwLabel]||0)-1)})); };
                const goNext = e=>{ e.stopPropagation(); setAllIdxMap(m=>({...m,[item._kwLabel]:Math.min(kwPhotos.length-1,(m[item._kwLabel]||0)+1)})); };
                return (
                  <div key={item._kwLabel||item.id} style={{background:T.bgCard,border:"1.5px solid #EC489933",borderRadius:T.rMd,overflow:"hidden"}}>
                    {/* Bild mit Swipe */}
                    <div style={{position:"relative"}}
                      onTouchStart={e=>{allTouchX.current=e.touches[0].clientX;allSwiped.current=false;}}
                      onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-(allTouchX.current||0);if(Math.abs(dx)>30){allSwiped.current=true;if(dx>0&&idx>0)setAllIdxMap(m=>({...m,[item._kwLabel]:idx-1}));else if(dx<0&&idx<kwPhotos.length-1)setAllIdxMap(m=>({...m,[item._kwLabel]:idx+1}));}}}
                      onClick={()=>{if(!allSwiped.current){setLbPhotos(kwPhotos);setLbIdx(idx);}}}
                    >
                      {src&&<img src={src} alt={cur.caption||""} style={{width:"100%",height:220,objectFit:"cover",display:"block",cursor:"pointer"}}/>}
                      {idx>0&&<button onMouseDown={goPrev} style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",background:"#00000077",border:"none",color:"#fff",fontSize:20,borderRadius:"50%",width:32,height:32,cursor:"pointer",lineHeight:"32px",textAlign:"center"}}>‹</button>}
                      {idx<kwPhotos.length-1&&<button onMouseDown={goNext} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"#00000077",border:"none",color:"#fff",fontSize:20,borderRadius:"50%",width:32,height:32,cursor:"pointer",lineHeight:"32px",textAlign:"center"}}>›</button>}
                    </div>
                    {/* Instagram-Punkte */}
                    {kwPhotos.length>1&&(
                      <div style={{display:"flex",justifyContent:"center",gap:5,padding:"8px 0 2px"}}>
                        {kwPhotos.map((_,i)=>(
                          <div key={i} style={{width:i===idx?16:6,height:6,borderRadius:3,background:i===idx?"#EC4899":"#334155",transition:"width .2s"}}/>
                        ))}
                      </div>
                    )}
                    {/* Info-Zeile */}
                    <div style={{padding:"8px 14px 12px",display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:10,fontWeight:700,color:"#EC4899",textTransform:"uppercase",letterSpacing:.7,marginBottom:2}}>📸 {item._kwLabel}</div>
                        {cur.caption&&<div style={{fontSize:13,color:"#CBD5E1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur.caption}</div>}
                      </div>
                      <div style={{fontSize:11,color:"#475569",flexShrink:0}}>{csTimeAgo(cur.created_at)}</div>
                    </div>
                  </div>
                );
              }
              const color = CS_COLORS[item.type]||"#94A3B8";
              const icon  = CS_ICONS[item.type]||"📰";
              const label = CS_LABELS[item.type]||item.type;
              return (
                <div key={item.id}
                  style={{background:T.bgCard,border:`1.5px solid ${color}33`,borderRadius:T.rMd,overflow:"hidden",cursor:"pointer",opacity:item._isPast?0.45:1,filter:item._isPast?"grayscale(60%)":"none"}}
                  onClick={()=>setDetail(item)}
                >
                  {item.image_url&&!item._isPhoto&&(
                    <img src={item.image_url} alt="" style={{width:"100%",height:160,objectFit:"cover",display:"block"}}/>
                  )}
                  <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    <span style={{fontSize:20,lineHeight:1.2,flexShrink:0}}>{icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                        <span style={{fontSize:10,fontWeight:700,color,textTransform:"uppercase",letterSpacing:.7}}>{label}</span>
                        {item.is_pinned&&<span style={{fontSize:10,color:"#EAB308"}}>📌</span>}
                        {item.priority==="urgent"&&<span style={{fontSize:10,color:"#EF4444",fontWeight:700}}>DRINGEND</span>}
                      </div>
                      <div style={{fontWeight:700,fontSize:T.fzBody,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                      {item.summary&&<div style={{fontSize:T.fzSm,color:T.textMuted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.summary}</div>}
                    </div>
                    <div style={{fontSize:T.fzLabel,color:T.textMuted,flexShrink:0,marginTop:2}}>{csTimeAgo(item.published_at)}</div>
                  </div>
                  {item.type==="match_result"&&item.result_home!=null&&(
                    <div style={{marginTop:8,padding:"6px 10px",background:T.bgPage,borderRadius:T.rSm,textAlign:"center"}}>
                      <span style={{fontSize:18,fontWeight:900,color:item.result_home>item.result_away?"#22C55E":"#EF4444"}}>
                        {item.result_home} : {item.result_away}
                      </span>
                      {item.opponent&&<span style={{fontSize:11,color:"#64748B",marginLeft:8}}>vs. {item.opponent}</span>}
                    </div>
                  )}
                  {item.type==="event"&&item.event_start&&(
                    <div style={{marginTop:6,fontSize:12,color:"#8B5CF6",fontWeight:600}}>
                      {new Date(item.event_start).toLocaleDateString("de-DE",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"})}
                      {item.event_location&&<span style={{color:"#64748B",fontWeight:400}}> · 📍 {item.event_location}</span>}
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Pending-Hinweis */}
        {pending>0&&(
          <div style={{background:T.bgCard,border:accentBorder(T.warning),borderRadius:T.rMd,padding:T.pCompact,textAlign:"center"}}>
            <p style={{fontSize:T.fzBody,color:T.warning,margin:0}}>
              ⚠️ <strong>{pending}</strong> {pending===1?"Beitrag wartet":"Beiträge warten"} auf Freigabe
            </p>
            <p style={{fontSize:T.fzLabel,color:T.textMuted,margin:"4px 0 0"}}>Im Clubstream Hub unter /admin/approval freigeben</p>
          </div>
        )}
        </div>{/* h-content */}
        </div>{/* h-cols */}

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOKING APP  (existing logic, wrapped with a back button)
// ═══════════════════════════════════════════════════════════════════════════
function BookingApp({profile,perms={},onBack}) {
  const [courts,setCourts]     = useState([]);
  const [bookings,setBookings] = useState([]);
  const [guestFee,setGuestFee] = useState(5.00);
  const [view,setView]         = useState("calendar");
  const [dayBase,setDayBase]   = useState(today());
  const [selCourt,setSelCourt] = useState(null);
  const [toast,setToast]       = useState(null);
  const [modal,setModal]       = useState(null);

  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3200); };

  useEffect(()=>{
    sb.from("courts").select("*").order("sort_order").then(({data})=>{ setCourts(data||[]); setSelCourt(s=>s||(data?.[0]?.id||null)); });
    sb.from("settings").select("*").eq("key","guest_fee").single().then(({data})=>{ if(data) setGuestFee(parseFloat(data.value)||5); });
  },[]);

  const [anonUserIds,setAnonUserIds]=useState(new Set());

  const loadBookings=useCallback(async()=>{
    const from=addDays(today(),-30);
    const [bRes,aRes]=await Promise.all([
      sb.from("bookings").select("*").gte("date",from).order("date").order("slot"),
      sb.from("profiles").select("id").eq("anonymous_bookings",true),
    ]);
    setBookings(bRes.data||[]);
    setAnonUserIds(new Set((aRes.data||[]).map(p=>p.id)));
  },[]);

  useEffect(()=>{ loadBookings(); },[loadBookings]);

  useEffect(()=>{
    const ch=sb.channel("bookings-live").on("postgres_changes",{event:"*",schema:"public",table:"bookings"},()=>loadBookings()).subscribe();
    return ()=>sb.removeChannel(ch);
  },[loadBookings]);

  const localCanDo=(m)=>{ if(profile.role==="admin")return true; return ({...DEFAULT_PERMISSIONS,...perms}[m]||[]).includes(profile.role); };
  const canMassBook=localCanDo("massenbuchung");
  const adaptedBookings=bookings.map(b=>({...b,courtId:b.court_id,userId:b.user_id,userName:b.user_name}));
  const adaptedData={bookings:adaptedBookings,courts};
  const toInitials=name=>(name||"?").split(" ").filter(Boolean).map(n=>n[0]+".").join("");
  const displayName=b=>{
    if(b.userId===profile.id) return b.userName;
    if(profile.role==="admin") return b.userName;
    if(anonUserIds.has(b.userId)) return toInitials(b.userName);
    return b.userName;
  };

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

  const navItems=[
    {id:"calendar",  icon:"📅",label:"Kalender"},
    {id:"myBookings",icon:"📋",label:"Meine"},
    ...(canMassBook?[{id:"massbook",icon:"📆",label:"Serien"}]:[]),
    ...(profile.role==="admin"?[{id:"admin",icon:"⚙️",label:"Admin"}]:[]),
  ];

  return (
    <div style={H.wrap}>
      <div style={H.inner} className="h-inner">
        {/* Header-Card */}
        <div style={{background:T.bgCard,padding:"16px 20px 20px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={onBack}>←</button>
          </div>
          <div style={{...H.header,paddingTop:12}}>
            <h1 style={{...H.title,fontSize:22}}>📅 Buchung</h1>
            <p style={H.greeting}>Plätze buchen · Reservierungen verwalten</p>
          </div>
        </div>

        <div className="h-cols">
        {/* Filter-Card */}
        <div className="h-filter" style={{background:T.bgCard,padding:"12px 20px",border:`1px solid ${T.bgBorder}`,borderRadius:T.rLg,display:"flex",gap:6,overflowX:"auto"}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>setView(item.id)}
              style={ftab(view===item.id, T.info, true)}>
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        <div className="h-content">
        {view==="calendar"  &&<CalendarView data={adaptedData} user={profile} dayBase={dayBase} setDayBase={setDayBase} selCourt={selCourt||courts[0]?.id} setSelCourt={setSelCourt} displayName={displayName} onSlotClick={(courtId,date,slot,existing)=>setModal({type:"slot",courtId,date,slot,existing})}/>}
        {view==="myBookings"&&<MyBookings data={adaptedData} user={profile} onCancel={cancel} guestFee={guestFee} onMarkPaid={()=>markGuestPaid(profile.id)}/>}
        {view==="massbook"  &&canMassBook&&<MassBookView data={adaptedData} user={profile} onMassBook={massBook} onCancelMany={cancelMany}/>}
        {view==="admin"     &&profile.role==="admin"&&<AdminView data={adaptedData} allBookings={bookings} guestFee={guestFee} onSaveGuestFee={saveGuestFee} onAddCourt={addCourt} onUpdateCourt={updateCourt} onDeleteCourt={deleteCourt} onDeleteUser={deleteUser} onCancelBooking={cancel} onMarkPaid={markGuestPaid}/>}

        {modal?.type==="slot"&&<SlotModal modal={modal} data={adaptedData} user={profile} guestFee={guestFee} displayName={displayName} onBook={bookSingle} onCancel={cancel} onClose={()=>setModal(null)}/>}
        {toast&&<div style={{...S.toast,background:toast.type==="error"?"#EF4444":"#10B981"}}>{toast.msg}</div>}
        </div>{/* h-content */}
        </div>{/* h-cols */}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KASSE APP
// ═══════════════════════════════════════════════════════════════════════════
function KasseApp({profile,perms={},onBack}) {
  const [tab,setTab]       = useState("drinks");
  const [favs,setFavs]     = useState([]);
  const [log,setLog]       = useState([]);
  const [toast,setToast]   = useState(null);

  const localCanDo=(m)=>{ if(profile.role==="admin")return true; return ({...DEFAULT_PERMISSIONS,...perms}[m]||[]).includes(profile.role); };
  const isAdmin = localCanDo("kasse_alle");
  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  const loadFavs = useCallback(async()=>{
    const {data}=await sb.from("kasse_favorites").select("*").eq("user_id",profile.id).order("sort_order");
    setFavs(data||[]);
  },[profile.id]);

  const loadLog = useCallback(async()=>{
    const q = isAdmin
      ? sb.from("kasse_log").select("*").order("created_at",{ascending:false})
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
    const {data,error}=await sb.from("kasse_log").insert(rows).select("id");
    if(error){ showToast(`Fehler: ${error.message}`,"error"); return null; }
    await loadLog();
    return data?.[0]?.id||null;
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
    {id:"drinks",  label:"Getränke", icon:"🥤"},
    {id:"log",     label:"Mein Tab", icon:"📋", badge:myOpen.length||0},
    {id:"settings",label:"Verwalten",icon:"⚙️"},
    ...(isAdmin?[{id:"admin",label:"Übersicht",icon:"👁️"}]:[]),
  ];

  return (
    <div style={H.wrap}>
      <div style={H.inner} className="h-inner">
        {/* Header-Card */}
        <div style={{background:T.bgCard,padding:"16px 20px 20px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={onBack}>←</button>
            <div style={{flex:1}}/>
            {myOpen.length>0&&(
              <span style={{fontSize:11,fontWeight:700,color:"#F59E0B",background:"#F59E0B18",border:"1px solid #F59E0B44",borderRadius:20,padding:"3px 10px"}}>
                ⚠️ {eur(myTotal)} offen
              </span>
            )}
          </div>
          <div style={{...H.header,paddingTop:12}}>
            <h1 style={{...H.title,fontSize:22}}>🧾 Getränke</h1>
            <p style={H.greeting}>Getränke buchen · offene Beträge verwalten</p>
          </div>
        </div>

        <div className="h-cols">
        {/* Filter-Card */}
        <div className="h-filter" style={{background:T.bgCard,padding:"12px 20px",border:`1px solid ${T.bgBorder}`,borderRadius:T.rLg,display:"flex",gap:6,overflowX:"auto"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{...ftab(tab===t.id, T.success, true),position:"relative"}}>
              {t.icon} {t.label}
              {t.badge>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#EF4444",borderRadius:10,fontSize:9,fontWeight:700,color:"#fff",padding:"1px 5px",minWidth:14,textAlign:"center"}}>{t.badge}</span>}
            </button>
          ))}
        </div>

        <div className="h-content">
        {tab==="drinks"  &&<KasseDrinksTab  favs={favs} onLogDrink={logDrink} onDeleteEntry={deleteEntry} onGoSettings={()=>setTab("settings")}/>}
        {tab==="log"     &&<KasseLogTab     myLog={myLog} myOpen={myOpen} myTotal={myTotal} onMarkPaid={()=>markPaid(profile.id)} onDeleteEntry={deleteEntry}/>}
        {tab==="settings"&&<KasseSettingsTab favs={favs} onAddFav={addFav} onUpdateFav={updateFav} onDeleteFav={deleteFav}/>}
        {tab==="admin"&&isAdmin&&<KasseAdminTab log={log} onMarkPaid={markPaid}/>}
        </div>{/* h-content */}
        </div>{/* h-cols */}

        {toast&&<div style={{...S.toast,background:toast.type==="error"?"#EF4444":"#10B981"}}>{toast.msg}</div>}
      </div>
    </div>
  );
}

// ── DRINKS TAB ────────────────────────────────────────────────────────────
function KasseDrinksTab({favs,onLogDrink,onDeleteEntry,onGoSettings}) {
  const [quickModal,setQuickModal]   = useState(false);
  const [confirmed,setConfirmed]     = useState(null);
  const [undoEntry,setUndoEntry]     = useState(null);
  const [confirmDrink,setConfirmDrink] = useState(null);
  const undoTimer = useRef(null);

  const handleTap=(f)=>{
    if(confirmed===f.id) return;
    setConfirmDrink(f);
  };

  const handleConfirm=async()=>{
    const f=confirmDrink;
    setConfirmDrink(null);
    const id = await onLogDrink(f.name,f.price,f.emoji,1);
    if(!id) return;
    setConfirmed(f.id);
    setUndoEntry({id,name:f.name,emoji:f.emoji});
    if(undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current=setTimeout(()=>{ setConfirmed(null); setUndoEntry(null); },3000);
  };

  const handleUndo=()=>{
    if(undoTimer.current) clearTimeout(undoTimer.current);
    if(undoEntry) onDeleteEntry(undoEntry.id);
    setUndoEntry(null); setConfirmed(null);
  };

  return (
    <div style={K.page}>
      <div style={{marginBottom:16}}>
        <h1 style={S.pageTitle}>Getränke</h1>
        <p style={S.pageSub}>Getränk antippen und bestätigen</p>
      </div>

      {undoEntry&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
          background:"#1E293B",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
          <span style={{color:"#E2E8F0",fontSize:13}}>{undoEntry.emoji} {undoEntry.name} eingetragen</span>
          <button onClick={handleUndo}
            style={{background:"none",border:"none",color:"#4ADE80",fontWeight:700,fontSize:13,cursor:"pointer",padding:0}}>
            Rückgängig
          </button>
        </div>
      )}

      {favs.length===0?(
        <div style={{...S.card,textAlign:"center",padding:"40px 20px",borderStyle:"dashed"}}>
          <div style={{fontSize:40,marginBottom:12}}>🥤</div>
          <div style={{fontWeight:700,marginBottom:6}}>Noch keine Getränke</div>
          <div style={{fontSize:13,color:"#9CA3AF",marginBottom:16}}>Lege deine Getränke unter „Verwalten" an.</div>
          <button style={S.primaryBtn} onClick={onGoSettings}>Getränke anlegen →</button>
        </div>
      ):(
        <div style={K.drinkGrid}>
          {favs.map(f=>{
            const done=confirmed===f.id;
            return (
              <div key={f.id} onClick={()=>handleTap(f)}
                style={{...K.drinkTile,...(done?K.drinkTileDone:{}),cursor:"pointer",userSelect:"none"}}>
                <span style={{fontSize:40,lineHeight:1}}>{done?"✓":f.emoji}</span>
                <span style={{fontWeight:700,fontSize:13,color:done?"#16A34A":"#111827",marginTop:6}}>{f.name}</span>
                <span style={{fontSize:13,fontWeight:700,color:done?"#16A34A":"#22C55E"}}>{eur(f.price)}</span>
              </div>
            );
          })}
          <div style={{...K.drinkTile,borderStyle:"dashed",borderColor:"#D1D5DB",background:"#FAFAFA",cursor:"pointer",justifyContent:"center"}}
            onClick={()=>setQuickModal(true)}>
            <span style={{fontSize:28,color:"#CBD5E1"}}>+</span>
            <span style={{fontSize:12,color:"#9CA3AF",marginTop:4}}>Weiteres</span>
          </div>
        </div>
      )}

      {confirmDrink&&(
        <div style={S.overlay} onClick={()=>setConfirmDrink(null)}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div style={S.modalTitle}>Getränk notieren</div>
              <button style={S.closeBtn} onClick={()=>setConfirmDrink(null)}>✕</button>
            </div>
            <div style={{textAlign:"center",padding:"20px 0 24px"}}>
              <div style={{fontSize:56,lineHeight:1,marginBottom:10}}>{confirmDrink.emoji}</div>
              <div style={{fontWeight:800,fontSize:20,color:"#111827",marginBottom:4}}>{confirmDrink.name}</div>
              <div style={{fontSize:28,fontWeight:800,color:"#22C55E"}}>{eur(confirmDrink.price)}</div>
            </div>
            <button style={{...S.primaryBtn,width:"100%",background:"#22C55E",color:"#fff",marginBottom:8,fontSize:15,padding:"14px"}}
              onClick={handleConfirm}>✓ Ja, notieren</button>
            <button style={{...S.ghostBtn,width:"100%"}} onClick={()=>setConfirmDrink(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {quickModal&&<KasseQuickModal onLog={async(n,p,e,q)=>{await onLogDrink(n,p,e,q);setQuickModal(false);}} onClose={()=>setQuickModal(false)}/>}
    </div>
  );
}

// ── LOG TAB ────────────────────────────────────────────────────────────────
function KasseLogTab({myLog,myOpen,myTotal,onMarkPaid,onDeleteEntry}) {
  const [showPaid,setShowPaid]       = useState(false);
  const [showConfirm,setShowConfirm] = useState(false);

  const paid=myLog.filter(l=>l.paid);
  const byDate={};
  for(const l of myOpen){ if(!byDate[l.date])byDate[l.date]=[]; byDate[l.date].push(l); }
  const sortedDates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));

  return (
    <div style={K.page}>
      <div style={{marginBottom:20}}>
        <h1 style={S.pageTitle}>Mein Tab</h1>
        <p style={S.pageSub}>Deine offenen Getränke</p>
      </div>

      {myOpen.length>0&&(
        <div style={K.summaryBar}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8"}}>OFFEN</div>
            <div style={{fontSize:28,fontWeight:800,color:"#F59E0B"}}>{eur(myTotal)}</div>
            <div style={{fontSize:12,color:"#64748B"}}>{myOpen.length} {myOpen.length===1?"Getränk":"Getränke"}</div>
          </div>
          <button style={K.payBtn} onClick={()=>setShowConfirm(true)}>✓ Bezahlen</button>
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
        <div><h1 style={S.pageTitle}>Getränke verwalten</h1><p style={S.pageSub}>Erscheinen als Kacheln unter Getränke</p></div>
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
  const [tab,setTab]       = useState("betrieb");
  const [toast,setToast]   = useState(null);
  const showToast=(msg,type="success")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),2800); };

  const [betriebTab,setBetriebTab] = useState(()=>localStorage.getItem("betrieb_tab")||"booking");
  const setBetriebTabP=(k)=>{ setBetriebTab(k); localStorage.setItem("betrieb_tab",k); };

  const tabs=[
    {id:"betrieb",      label:"Betrieb",    icon:"⚙️"},
    {id:"members",      label:"Mitglieder", icon:"👤"},
    {id:"permissions",  label:"Rechte",     icon:"🔐"},
    {id:"display",      label:"Display",    icon:"🖥️"},
    {id:"mannschaften", label:"Teams",      icon:"🏆"},
  ];

  return (
    <div style={H.wrap}>
      <div style={H.inner} className="h-inner">
        {/* Header-Card */}
        <div style={{background:T.bgCard,padding:"16px 20px 20px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={onBack}>←</button>
          </div>
          <div style={{...H.header,paddingTop:12}}>
            <h1 style={{...H.title,fontSize:22}}>⚙️ Einstellungen</h1>
            <p style={H.greeting}>Betrieb · Mitglieder · Berechtigungen</p>
          </div>
        </div>

        <div className="h-cols">
        {/* Filter-Card */}
        <div className="h-filter" style={{background:T.bgCard,padding:"12px 20px",border:`1px solid ${T.bgBorder}`,borderRadius:T.rLg,display:"flex",gap:6,overflowX:"auto"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={ftab(tab===t.id, T.purple, true)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="h-content">
        {tab==="betrieb"&&(
          <>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[{id:"booking",icon:"📅",label:"Buchung"},{id:"courts",icon:"🎾",label:"Plätze"},{id:"jobs",icon:"⚡",label:"Hintergrund"}].map(t=>(
                <button key={t.id} onClick={()=>setBetriebTabP(t.id)}
                  style={ftab(betriebTab===t.id, T.purple)}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {betriebTab==="booking"&&<SettingsBookingTab onToast={showToast}/>}
            {betriebTab==="courts" &&<SettingsCourtsTab  onToast={showToast}/>}
            {betriebTab==="jobs"   &&<SettingsJobsTab/>}
          </>
        )}
        {tab==="members"      &&<SettingsMembersTab      onToast={showToast}/>}
        {tab==="permissions"  &&<SettingsPermissionsTab  onToast={showToast}/>}
        {tab==="display"      &&<SettingsDisplayTab      onToast={showToast}/>}
        {tab==="mannschaften" &&<SettingsMannschaftenTab onToast={showToast}/>}
        </div>{/* h-content */}
        </div>{/* h-cols */}

        {toast&&<div style={{...S.toast,background:toast.type==="error"?"#EF4444":"#10B981"}}>{toast.msg}</div>}
      </div>
    </div>
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
      <div style={{...S.card,borderLeft:"4px solid #8B5CF6",marginTop:4}}>
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
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
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
  const [members,setMembers]     = useState([]);
  const [saving,setSaving]       = useState(null);
  const [search,setSearch]       = useState("");
  const [roleFilter,setRoleFilter] = useState("all");
  const [sort,setSort]           = useState({col:"vorname",dir:1});

  const load=async()=>{ const {data}=await sb.from("profiles").select("*").order("name"); setMembers(data||[]); };
  useEffect(()=>{ load(); },[]);

  const changeRole=async(uid,role)=>{
    setSaving(uid);
    const {error}=await sb.rpc("admin_set_role",{target_user_id:uid,new_role:role});
    setSaving(null);
    if(error) onToast("Fehler: "+error.message,"error");
    else { onToast("Rolle aktualisiert ✓"); load(); }
  };
  const deleteMember=async(uid,mname)=>{
    if(!window.confirm(`Mitglied „${mname}" wirklich löschen?`)) return;
    await sb.from("bookings").delete().eq("user_id",uid);
    await sb.from("profiles").delete().eq("id",uid);
    onToast("Mitglied gelöscht."); load();
  };

  const withSplit = members.map(m=>{
    const parts=(m.name||"").split(" ");
    return {...m, firstName:parts[0]||"", lastName:parts.slice(1).join(" ")||""};
  });

  const filtered = withSplit.filter(m=>{
    const q=search.toLowerCase();
    const matchSearch=!q||m.name.toLowerCase().includes(q)||(m.email||"").toLowerCase().includes(q);
    const matchRole=roleFilter==="all"||m.role===roleFilter;
    return matchSearch&&matchRole;
  });

  const sorted=[...filtered].sort((a,b)=>{
    const vals={vorname:[a.firstName,b.firstName],nachname:[a.lastName,b.lastName],email:[a.email||"",b.email||""],rolle:[a.role||"",b.role||""]};
    const [av,bv]=vals[sort.col]||[a.firstName,b.firstName];
    return av.localeCompare(bv)*sort.dir;
  });

  const toggleSort=(col)=>setSort(prev=>prev.col===col?{col,dir:prev.dir*-1}:{col,dir:1});

  const RC={pending:{bg:"#FEF3C7",color:"#92400E",border:"#F59E0B"},known:{bg:"#FFF7ED",color:"#C2410C",border:"#FB923C"},member:{bg:"#DCFCE7",color:"#166534",border:"#22C55E"},member2:{bg:"#DBEAFE",color:"#1E40AF",border:"#3B82F6"},admin:{bg:"#F3E8FF",color:"#6B21A8",border:"#8B5CF6"}};
  const rc=(role)=>RC[role]||{bg:"#F3F4F6",color:"#6B7280",border:"#D1D5DB"};

  const Arrow=({col})=>sort.col!==col?<span style={{color:"#D1D5DB"}}>⇅</span>:<span style={{color:"#6B7280"}}>{sort.dir===1?"↑":"↓"}</span>;
  const Th=({col,label,w})=>(
    <th onClick={()=>toggleSort(col)} style={{textAlign:"left",padding:"9px 10px",fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",letterSpacing:.6,cursor:"pointer",userSelect:"none",whiteSpace:"nowrap",width:w}}>
      {label} <Arrow col={col}/>
    </th>
  );

  const ROLE_FILTER_LABELS={all:"Alle",...ROLE_LABELS};

  return (
    <div style={K.page}>
      <h1 style={S.pageTitle}>Mitgliederverwaltung</h1>
      <p style={S.pageSub}>{members.length} Mitglieder gesamt</p>

      <div style={{display:"flex",gap:10,marginTop:20,flexWrap:"wrap",alignItems:"center"}}>
        <input placeholder="Name oder E-Mail suchen…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{...S.input,flex:1,minWidth:160,maxWidth:280}}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["all","pending","known","member","member2","admin"].map(r=>(
            <button key={r} onClick={()=>setRoleFilter(r)}
              style={{padding:"6px 12px",borderRadius:20,border:`1.5px solid ${roleFilter===r?"#374151":"#E5E7EB"}`,background:roleFilter===r?"#374151":"#fff",color:roleFilter===r?"#fff":"#374151",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
              {ROLE_FILTER_LABELS[r]}{r!=="all"&&<span style={{marginLeft:4,opacity:.65}}>({members.filter(m=>m.role===r).length})</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{marginTop:14,overflowX:"auto",border:"1.5px solid #E5E7EB",borderRadius:10}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead style={{background:"#F9FAFB",borderBottom:"1.5px solid #E5E7EB"}}>
            <tr>
              <Th col="vorname"  label="Vorname"  w="16%"/>
              <Th col="nachname" label="Nachname" w="18%"/>
              <Th col="email"    label="E-Mail"   w="28%"/>
              <Th col="rolle"    label="Rolle"    w="22%"/>
              <th style={{width:"16%"}}/>
            </tr>
          </thead>
          <tbody>
            {sorted.length===0&&(
              <tr><td colSpan={5} style={{textAlign:"center",padding:"32px 0",color:"#9CA3AF"}}>Keine Einträge gefunden</td></tr>
            )}
            {sorted.map((m,i)=>{
              const c=rc(m.role);
              return (
                <tr key={m.id} style={{background:i%2===0?"#fff":"#F9FAFB",borderBottom:"1px solid #F3F4F6"}}>
                  <td style={{padding:"10px 10px",fontWeight:600,color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.firstName}</td>
                  <td style={{padding:"10px 10px",color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.lastName||"–"}</td>
                  <td style={{padding:"10px 10px",color:"#6B7280",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.email||"–"}</td>
                  <td style={{padding:"10px 10px"}}>
                    <select value={m.role||"pending"} disabled={saving===m.id} onChange={e=>changeRole(m.id,e.target.value)}
                      style={{border:`1.5px solid ${c.border}`,borderRadius:20,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer",background:c.bg,color:c.color,width:"100%",maxWidth:140}}>
                      <option value="pending">⏳ Ausstehend</option>
                      <option value="known">🤝 Bekannt</option>
                      <option value="member">Mitglied</option>
                      <option value="member2">Mitglied Plus</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </td>
                  <td style={{padding:"10px 10px",textAlign:"right"}}>
                    <button style={{...S.cancelBtn,padding:"4px 10px",fontSize:12}} onClick={()=>deleteMember(m.id,m.name)}>Löschen</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── SETTINGS: BERECHTIGUNGEN ──────────────────────────────────────────────
function SettingsPermissionsTab({onToast}) {
  const [perms, setPerms]               = useState(DEFAULT_PERMISSIONS);
  const [ctPerms, setCtPerms]           = useState(DEFAULT_CONTENT_TYPE_PERMISSIONS);
  const [saving, setSaving]             = useState(false);

  useEffect(()=>{
    sb.from("settings").select("value").eq("key","role_permissions").single()
      .then(({data})=>{ try{ if(data?.value) setPerms({...DEFAULT_PERMISSIONS,...JSON.parse(data.value)}); }catch(_){} });
    sb.from("settings").select("value").eq("key","content_type_permissions").single()
      .then(({data})=>{ try{ if(data?.value) setCtPerms({...DEFAULT_CONTENT_TYPE_PERMISSIONS,...JSON.parse(data.value)}); }catch(_){} });
  },[]);

  const toggle=(module,role)=>{
    setPerms(prev=>{
      const cur = prev[module]||[];
      const next = cur.includes(role) ? cur.filter(r=>r!==role) : [...cur,role];
      return {...prev,[module]:next};
    });
  };

  const toggleCt=(type,role)=>{
    setCtPerms(prev=>{
      const cur = prev[type]||[];
      const next = cur.includes(role) ? cur.filter(r=>r!==role) : [...cur,role];
      return {...prev,[type]:next};
    });
  };

  const save=async()=>{
    setSaving(true);
    const [r1,r2] = await Promise.all([
      sb.from("settings").upsert({key:"role_permissions",value:JSON.stringify(perms)},{onConflict:"key"}),
      sb.from("settings").upsert({key:"content_type_permissions",value:JSON.stringify(ctPerms)},{onConflict:"key"}),
    ]);
    setSaving(false);
    if(r1.error||r2.error) onToast("Fehler beim Speichern","error");
    else onToast("Berechtigungen gespeichert ✓");
  };

  const roleColors={public:"#94A3B8",pending:"#F59E0B",known:"#F59E0B",member:"#22C55E",member2:"#3B82F6",admin:"#8B5CF6"};
  const roleLabels={public:"Öffentlich",pending:"Ausstehend",known:"Bekannt",member:"Mitglied",member2:"Mitglied+",admin:"Admin"};

  const PermTable = ({title, rows, getValue, onToggle, rowLabel}) => (
    <div style={{overflowX:"auto",marginTop:20}}>
      <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.7,marginBottom:6}}>{title}</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr>
            <th style={{textAlign:"left",padding:"8px 10px",color:"#94A3B8",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:.7}}>{rowLabel}</th>
            {PERM_ROLES.map(r=>(
              <th key={r} style={{padding:"6px 8px",color:roleColors[r],fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:.5,textAlign:"center",whiteSpace:"nowrap"}}>
                {roleLabels[r]}
              </th>
            ))}
            <th style={{padding:"6px 8px",color:"#8B5CF6",fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:.5,textAlign:"center"}}>Admin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({id,icon,label},i)=>(
            <tr key={id} style={{background:i%2===0?"#1E293B":"#162032"}}>
              <td style={{padding:"10px 10px",fontWeight:600,color:"#F1F5F9",whiteSpace:"nowrap"}}>
                <span style={{marginRight:5}}>{icon}</span>{label}
              </td>
              {PERM_ROLES.map(role=>(
                <td key={role} style={{textAlign:"center",padding:"10px 8px"}}>
                  <input type="checkbox" checked={getValue(id,role)} onChange={()=>onToggle(id,role)}
                    style={{width:15,height:15,accentColor:roleColors[role],cursor:"pointer"}}/>
                </td>
              ))}
              <td style={{textAlign:"center",padding:"10px 8px"}}>
                <input type="checkbox" checked disabled style={{width:15,height:15,accentColor:"#8B5CF6"}}/>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const ctRows = [
    {id:"photos", icon:"🖼️", label:"Fotos"},
    ...Object.keys(CS_ICONS).map(k=>({id:k, icon:CS_ICONS[k], label:CS_LABELS[k]})),
  ];

  return (
    <div style={K.page}>
      <h1 style={S.pageTitle}>Berechtigungen</h1>
      <p style={S.pageSub}>Welche Rollen dürfen welche Module / Inhaltstypen sehen? Admin hat immer Zugriff.</p>

      <PermTable title="Hauptmodule" rows={MODULES} rowLabel="Modul"
        getValue={(id,role)=>(perms[id]||[]).includes(role)} onToggle={toggle}/>
      <PermTable title="Spezielle Berechtigungen" rows={SPECIAL_MODULES} rowLabel="Modul"
        getValue={(id,role)=>(perms[id]||[]).includes(role)} onToggle={toggle}/>
      <PermTable title="Clubstream · Inhaltstypen" rows={ctRows} rowLabel="Typ"
        getValue={(id,role)=>(ctPerms[id]||[]).includes(role)} onToggle={toggleCt}/>

      <div style={{marginTop:24,textAlign:"right"}}>
        <button onClick={save} disabled={saving}
          style={{background:"#22C55E",color:"#fff",border:"none",borderRadius:8,padding:"10px 24px",fontWeight:700,fontSize:14,cursor:"pointer",opacity:saving?.6:1}}>
          {saving?"Wird gespeichert…":"Speichern"}
        </button>
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

function RubberModal({rubber, homePlayers, awayPlayers, onSave, onClose}) {
  const isD = rubber.id.startsWith("D");

  const parseScore = (score) => {
    const parts = (score||"").split(" ").filter(s=>s.includes(":")).slice(0,3);
    return [0,1,2].map(i => {
      if(parts[i]){ const [h,a]=parts[i].split(":"); return {home:h||"",away:a||""}; }
      return {home:"",away:""};
    });
  };

  // Tennis: wer gewinnt einen Satz?
  const setWinner = (h, a, isTb=false) => {
    h = parseInt(h)||0; a = parseInt(a)||0;
    if(h===0&&a===0) return null;
    if(isTb){ // Match-Tiebreak bis 10
      if(h>=10&&h-a>=2) return "home";
      if(a>=10&&a-h>=2) return "away";
      return null;
    }
    if(h>=6&&h-a>=2) return "home";
    if(a>=6&&a-h>=2) return "away";
    if(h===7&&a===6) return "home";
    if(a===7&&h===6) return "away";
    return null;
  };

  const calcResult = (s) => {
    const w0 = setWinner(s[0].home, s[0].away);
    const w1 = setWinner(s[1].home, s[1].away);
    const w2 = setWinner(s[2].home, s[2].away, true);
    const homeW = [w0,w1,w2].filter(w=>w==="home").length;
    const awayW = [w0,w1,w2].filter(w=>w==="away").length;
    if(homeW>=2) return "win";
    if(awayW>=2) return "loss";
    const hasData = s.some(x=>x.home!==""||x.away!=="");
    return hasData ? "live" : "open";
  };

  const initSets = parseScore(rubber.score);
  const [sets,   setSets]   = useState(initSets);
  const [result, setResult] = useState(rubber.result||"open");
  const [manualResult, setManualResult] = useState(false);

  const initDouble = () => {
    if(isD){
      const hp=(rubber.home||"").split("/").map(s=>s.trim());
      const ap=(rubber.away||"").split("/").map(s=>s.trim());
      return {h1:hp[0]||"",h2:hp[1]||"",a1:ap[0]||"",a2:ap[1]||""};
    }
    return {h1:rubber.home||"",h2:"",a1:rubber.away||"",a2:""};
  };
  const init = initDouble();
  const [h1,setH1]=useState(init.h1);
  const [h2,setH2]=useState(init.h2);
  const [a1,setA1]=useState(init.a1);
  const [a2,setA2]=useState(init.a2);

  const updSet = (i, side, val) => {
    const next = sets.map((s,j)=>j===i?{...s,[side]:val}:s);
    setSets(next);
    if(!manualResult) setResult(calcResult(next));
  };

  const buildScore = () =>
    sets.filter(s=>s.home!==""||s.away!=="").map(s=>`${s.home}:${s.away}`).join(" ");

  const handleSave = () => {
    const homeVal = isD ? [h1,h2].filter(Boolean).join(" / ") : h1;
    const awayVal = isD ? [a1,a2].filter(Boolean).join(" / ") : a1;
    onSave({...rubber, home:homeVal, away:awayVal, score:buildScore(), result});
  };

  const RESULTS = [
    {v:"open", label:"Offen",        color:"#6B7280", bg:"#F3F4F6", border:"#E5E7EB"},
    {v:"live", label:"● Läuft",      color:"#D97706", bg:"#FFFBEB", border:"#FDE68A"},
    {v:"win",  label:"✓ Heimsieg",   color:"#059669", bg:"#F0FDF4", border:"#BBF7D0"},
    {v:"loss", label:"✗ Niederlage", color:"#DC2626", bg:"#FEF2F2", border:"#FECACA"},
  ];
  const curR = RESULTS.find(r=>r.v===result)||RESULTS[0];

  const selStyle = {width:"100%",fontSize:12,border:"1.5px solid #E5E7EB",borderRadius:6,
    padding:"5px 6px",boxSizing:"border-box",background:"#fff"};

  const renderSel = (val, setVal, players, placeholder) => {
    if(players.length>0)
      return (
        <select value={val} onChange={e=>setVal(e.target.value)} style={selStyle}>
          <option value="">— {placeholder} —</option>
          {players.map((p,i)=><option key={p} value={`[${i+1}] ${p}`}>{i+1}. {p}</option>)}
        </select>
      );
    return <input value={val} onChange={e=>setVal(e.target.value)} placeholder={placeholder} style={selStyle}/>;
  };

  const NumBtns = ({max, val, onChange, color}) => (
    <div style={{display:"flex",gap:3,flexWrap:"wrap",justifyContent:"center"}}>
      {Array.from({length:max+1},(_,n)=>{
        const sel = String(val)===String(n);
        return (
          <button key={n} onClick={()=>onChange(String(n))}
            style={{width:32,height:32,borderRadius:6,border:`2px solid ${sel?color:"#E5E7EB"}`,
              background:sel?color:"#fff",color:sel?"#fff":"#374151",
              fontSize:13,fontWeight:800,cursor:"pointer",padding:0,transition:"all .1s"}}>
            {n}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{...S.modal,maxWidth:380,width:"94%",maxHeight:"90vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        <div style={S.modalHeader}>
          <div style={{...S.modalTitle,display:"flex",alignItems:"center",gap:8}}>
            <span style={{background:"#1D4ED8",color:"#fff",borderRadius:6,
              padding:"2px 8px",fontSize:13,fontWeight:800}}>{rubber.id}</span>
            <span>{isD?"Doppel":"Einzel"}</span>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Spieler */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:6}}>SPIELER</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,fontWeight:700,color:"#1D4ED8",width:30,flexShrink:0}}>Heim</span>
              {isD?<div style={{display:"flex",gap:4,flex:1}}>
                {renderSel(h1,setH1,homePlayers,"H1")}
                {renderSel(h2,setH2,homePlayers,"H2")}
              </div>:renderSel(h1,setH1,homePlayers,"Heim-Spieler")}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,fontWeight:700,color:"#6B7280",width:30,flexShrink:0}}>Gast</span>
              {isD?<div style={{display:"flex",gap:4,flex:1}}>
                {renderSel(a1,setA1,awayPlayers,"G1")}
                {renderSel(a2,setA2,awayPlayers,"G2")}
              </div>:renderSel(a1,setA1,awayPlayers,"Gast-Spieler")}
            </div>
          </div>
        </div>

        {/* Sätze */}
        {[0,1,2].map(i=>{
          const isTb = i===2;
          const sw   = setWinner(sets[i].home, sets[i].away, isTb);
          return (
            <div key={i} style={{marginBottom:14,padding:"10px 12px",borderRadius:10,
              background:isTb?"#F8FAFC":"#fff",
              border:`1.5px solid ${sw==="home"?"#BBF7D0":sw==="away"?"#FECACA":"#E5E7EB"}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:isTb?8:10}}>
                <span style={{fontSize:11,fontWeight:700,color:isTb?"#9CA3AF":"#374151"}}>
                  {isTb?"3. Satz · Super-Tiebreak (opt.)":`${i+1}. Satz`}
                </span>
                <span style={{fontSize:18,fontWeight:800,fontFamily:"monospace",
                  color:sw==="home"?"#059669":sw==="away"?"#DC2626":"#9CA3AF"}}>
                  {sets[i].home!==""||sets[i].away!==""
                    ? `${sets[i].home}:${sets[i].away}` : "–:–"}
                </span>
              </div>
              {isTb ? (
                <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"center"}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#1D4ED8",marginBottom:4}}>HEIM</div>
                    <input type="number" min={0} value={sets[i].home}
                      onChange={e=>updSet(i,"home",e.target.value)}
                      style={{width:60,textAlign:"center",fontSize:22,fontWeight:800,
                        border:"1.5px solid #E5E7EB",borderRadius:8,padding:"6px 0",background:"#F8FAFC"}}/>
                  </div>
                  <span style={{fontSize:22,color:"#D1D5DB",fontWeight:700,marginTop:18}}>:</span>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:4}}>GAST</div>
                    <input type="number" min={0} value={sets[i].away}
                      onChange={e=>updSet(i,"away",e.target.value)}
                      style={{width:60,textAlign:"center",fontSize:22,fontWeight:800,
                        border:"1.5px solid #E5E7EB",borderRadius:8,padding:"6px 0",background:"#F8FAFC"}}/>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"#1D4ED8",marginBottom:4}}>HEIM</div>
                    <NumBtns max={7} val={sets[i].home} color="#1D4ED8"
                      onChange={v=>updSet(i,"home",v)}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:4}}>GAST</div>
                    <NumBtns max={7} val={sets[i].away} color="#6B7280"
                      onChange={v=>updSet(i,"away",v)}/>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Status — auto + manuell überschreibbar */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6B7280"}}>ERGEBNIS</div>
            {manualResult&&(
              <button onClick={()=>{setManualResult(false);setResult(calcResult(sets));}}
                style={{fontSize:10,color:"#6366F1",background:"none",border:"none",
                  cursor:"pointer",textDecoration:"underline"}}>
                Auto-Erkennung
              </button>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {RESULTS.map(r=>(
              <button key={r.v} onClick={()=>{setResult(r.v);setManualResult(true);}}
                style={{padding:"11px 0",fontSize:12,fontWeight:700,borderRadius:8,cursor:"pointer",
                  border:`2px solid ${result===r.v?r.border:"#E5E7EB"}`,
                  background:result===r.v?r.bg:"#fff",
                  color:result===r.v?r.color:"#9CA3AF",transition:"all .12s"}}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSave}
          style={{...S.primaryBtn,width:"100%",background:curR.color,color:"#fff",
            fontSize:14,padding:"13px"}}>
          {curR.label === "Offen" || curR.label === "● Läuft" ? "Übernehmen" : `${curR.label} speichern`}
        </button>
      </div>
    </div>
  );
}

function HeimspieleEdit({onToast, onSaved, reloadKey, hideShare=false}) {
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [dirty,      setDirty]      = useState(false);
  const [savedAt,      setSavedAt]      = useState(null);
  const [rubberModal,  setRubberModal]  = useState(null);

  // Editierbare Felder
  const [format,    setFormat]    = useState("6er");
  const [homeTeam,  setHomeTeam]  = useState("");
  const [awayTeam,  setAwayTeam]  = useState("");
  const [league,    setLeague]    = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [rubbers,   setRubbers]   = useState(DEFAULT_RUBBERS("6er"));
  const [homeLogo,  setHomeLogo]  = useState(null);
  const [awayLogo,  setAwayLogo]  = useState(null);
  const [playersData,  setPlayersData]  = useState(null);
  const [shareToken,   setShareToken]   = useState(null);
  const [sharePanel,   setSharePanel]   = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  const applyCache = (m) => {
    setHomeLogo(m.homeLogo || null);
    setAwayLogo(m.awayLogo || null);
    setHomeTeam(m.homeTeam || "");
    setAwayTeam(m.awayTeam || "");
    setLeague(m.league || "");
    setMatchDate(m.matchDate || "");
    setMatchTime((m.time || "").replace(/\s*Uhr$/i, "").trim());
    const rubs = m.rubbers?.length > 0 ? m.rubbers.map(r=>({...r})) : [];
    const det = rubs.length > 0
      ? (rubs.filter(r=>r.id.startsWith("E")).length <= 4 ? "4er" : "6er")
      : (m.format || "6er");
    setFormat(det);
    setRubbers(rubs.length > 0 ? rubs : DEFAULT_RUBBERS(det));
    setSavedAt(m._savedAt || null);
    setDirty(false);
  };

  const load = async () => {
    const [cacheRes, playersRes, shareRes] = await Promise.all([
      sb.from("settings").select("value").eq("key","btv_match_cache").single(),
      sb.from("settings").select("value").eq("key","btv_players").single(),
      sb.from("settings").select("value").eq("key","display_share_token").single(),
    ]);
    if (cacheRes.data?.value) {
      let m = cacheRes.data.value;
      if (typeof m === "string") m = JSON.parse(m);
      applyCache(m);
    }
    if (playersRes.data?.value) {
      let v = playersRes.data.value;
      try { if (typeof v === "string") v = JSON.parse(v); setPlayersData(v); } catch(_){}
    }
    if (shareRes.data?.value) setShareToken(shareRes.data.value);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (reloadKey) load(); }, [reloadKey]);

  const mark = setter => val => { setter(val); setDirty(true); };
  const updRubber = (id, field, val) => {
    setRubbers(prev => prev.map(r => r.id===id ? {...r,[field]:val} : r));
    setDirty(true);
  };
  const switchFormat = newFmt => {
    const ids = RUBBER_IDS[newFmt];
    const rubberMap = Object.fromEntries(rubbers.map(r=>[r.id,r]));
    setRubbers(ids.map(id => rubberMap[id] || {id,home:"",away:"",score:"",result:"open"}));
    setFormat(newFmt);
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const hasPlayers = rubbers.some(r=>(r.home||"").trim()||(r.away||"").trim());
    const openCount  = rubbers.filter(r=>r.result==="open").length;
    const autoStatus = !hasPlayers ? "upcoming" : openCount===0 ? "done" : "live";
    const payload = {
      homeTeam, awayTeam, league, status: autoStatus,
      matchDate: matchDate||null, time: matchTime ? matchTime+" Uhr" : null,
      homeLogo: homeLogo||null, awayLogo: awayLogo||null,
      homeScore: rubbers.filter(r=>r.result==="win").length,
      awayScore: rubbers.filter(r=>r.result==="loss").length,
      rubbers, _source:"manual", _savedAt: now,
    };
    const {error} = await sb.from("settings")
      .upsert([{key:"btv_match_cache",value:JSON.stringify(payload)}],{onConflict:"key"});
    setSaving(false);
    if (error) { onToast(`Fehler: ${error.message}`,"error"); return; }
    setSavedAt(now); setDirty(false);
    onToast("💾 Gespeichert ✓");
    onSaved?.(payload);
  };

  const toggleShare = async () => {
    setShareLoading(true);
    if (shareToken) {
      await sb.from("settings").upsert({key:"display_share_token",value:crypto.randomUUID()},{onConflict:"key"});
      setShareToken(null);
    } else {
      const token = crypto.randomUUID();
      await sb.from("settings").upsert({key:"display_share_token",value:token},{onConflict:"key"});
      setShareToken(token);
    }
    setShareLoading(false);
  };

  const [homePlayers, awayPlayers] = (() => {
    if (!playersData?.config?.length || !homeTeam || !awayTeam) return [[],[]];
    const entry = playersData.config.find(e =>
      e.groupId && e.teamName === homeTeam && (e.opponents||[]).includes(awayTeam)
    );
    if (!entry) return [[],[]];
    return [
      playersData.teams?.[`${entry.groupId}:${entry.teamName}`] || [],
      playersData.teams?.[`${entry.groupId}:${awayTeam}`] || [],
    ];
  })();

  if (loading) return (
    <div style={{padding:"16px",fontSize:12,color:"#9CA3AF",textAlign:"center"}}>Lade Daten…</div>
  );

  const hasP = rubbers.some(r=>(r.home||"").trim()||(r.away||"").trim());
  const openCount = rubbers.filter(r=>r.result==="open").length;
  const currentStatus = !hasP ? "upcoming" : openCount===0 ? "done" : "live";
  const resColor = r => ({win:"#059669",loss:"#EF4444",live:"#F59E0B",open:"#9CA3AF"}[r]||"#9CA3AF");
  const statusLabel = s => ({upcoming:"geplant",live:"läuft 🔴",done:"fertig ✓"}[s]||"–");
  const statusColor = s => ({upcoming:"#6B7280",live:"#059669",done:"#1D4ED8"}[s]||"#6B7280");
  const inp = {width:"100%",fontSize:12,border:"1.5px solid #E5E7EB",borderRadius:6,padding:"4px 8px",boxSizing:"border-box"};
  const sel = {width:"100%",fontSize:11,border:"1.5px solid #E5E7EB",borderRadius:6,padding:"4px 6px",boxSizing:"border-box",background:"#fff",color:"#374151"};

  const renderSide = (r, side, players) => {
    const isD = r.id.startsWith("D");
    const val = r[side];
    if (isD && players.length > 0) {
      const parts = (val||"").split("/").map(s=>s.trim());
      return (
        <div style={{display:"flex",gap:3,flex:1}}>
          {[0,1].map(pi=>(
            <select key={pi} value={parts[pi]||""}
              onChange={e=>{const p=[...parts];p[pi]=e.target.value;updRubber(r.id,side,p.filter(Boolean).join(" / "));}}
              style={{...sel,flex:1}}>
              <option value="">{side==="home"?(pi===0?"H1":"H2"):(pi===0?"G1":"G2")}</option>
              {players.map((p,i)=><option key={p} value={`[${i+1}] ${p}`}>{i+1}. {p}</option>)}
            </select>
          ))}
        </div>
      );
    }
    if (!isD && players.length > 0) {
      return (
        <select value={val} onChange={e=>updRubber(r.id,side,e.target.value)} style={{...sel,flex:1}}>
          <option value="">— {side==="home"?"Heim":"Gast"} —</option>
          {players.map((p,i)=><option key={p} value={`[${i+1}] ${p}`}>{i+1}. {p}</option>)}
        </select>
      );
    }
    return (
      <input value={val} onChange={e=>updRubber(r.id,side,e.target.value)}
        placeholder={side==="home"?"Heim":"Gast"} style={{...sel,flex:1}}/>
    );
  };

  return (
    <div style={{border:`1.5px solid ${dirty?"#F59E0B":"#E2E8F0"}`,borderRadius:12,
      overflow:"hidden",marginBottom:20}}>

      {/* Dirty-Banner */}
      {dirty&&(
        <div style={{background:"#FFFBEB",borderBottom:"1px solid #FDE68A",
          padding:"8px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:11,color:"#92400E",fontWeight:600}}>● Ungespeicherte Änderungen</span>
          <button onClick={save} disabled={saving}
            style={{background:"#D97706",color:"#fff",border:"none",borderRadius:6,
              padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer",opacity:saving?0.6:1}}>
            {saving?"Speichern…":"📲 Auf Display übertragen"}
          </button>
        </div>
      )}

      {/* Spielinfos */}
      <div style={{padding:"12px",background:"#fff",borderBottom:"1px solid #E2E8F0"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>HEIMTEAM</div>
            <input value={homeTeam} onChange={e=>{setHomeTeam(e.target.value);setDirty(true);}} style={inp} placeholder="TC Herrieden I"/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>GASTTEAM</div>
            <input value={awayTeam} onChange={e=>{setAwayTeam(e.target.value);setDirty(true);}} style={inp} placeholder="TC Gegner"/>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>LIGA</div>
            <input value={league} onChange={e=>{setLeague(e.target.value);setDirty(true);}} style={inp} placeholder="Bezirksliga"/>
          </div>
          <div style={{display:"flex",gap:6}}>
            <div style={{flex:2}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>DATUM</div>
              <input type="date" value={matchDate} onChange={e=>{setMatchDate(e.target.value);setDirty(true);}} style={inp}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:700,color:"#6B7280",marginBottom:3}}>UHRZEIT</div>
              <input type="time" value={matchTime} onChange={e=>{setMatchTime(e.target.value);setDirty(true);}} style={inp}/>
            </div>
          </div>
        </div>

        {/* Format + Score + Status */}
        <div style={{display:"flex",alignItems:"center",gap:8,background:"#F8FAFC",
          borderRadius:8,padding:"8px 10px"}}>
          <div style={{display:"flex",gap:4}}>
            {["4er","6er"].map(f=>(
              <button key={f} onClick={()=>switchFormat(f)}
                style={{padding:"3px 10px",fontSize:11,fontWeight:700,borderRadius:5,cursor:"pointer",
                  background:format===f?"#1D4ED8":"#fff",color:format===f?"#fff":"#6B7280",
                  border:`1.5px solid ${format===f?"#1D4ED8":"#E5E7EB"}`}}>
                {f}
              </button>
            ))}
          </div>
          <div style={{flex:1}}/>
          <span style={{fontSize:11,fontWeight:700,color:statusColor(currentStatus)}}>
            {statusLabel(currentStatus)}
          </span>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:22,fontWeight:800,color:"#111827",fontFamily:"monospace",
              minWidth:20,textAlign:"center"}}>{rubbers.filter(r=>r.result==="win").length}</span>
            <span style={{fontSize:16,color:"#9CA3AF",fontWeight:700}}>:</span>
            <span style={{fontSize:22,fontWeight:800,color:"#111827",fontFamily:"monospace",
              minWidth:20,textAlign:"center"}}>{rubbers.filter(r=>r.result==="loss").length}</span>
          </div>
        </div>
      </div>

      {/* Rubber-Liste — antippen zum Bearbeiten */}
      <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
        {(()=>{
          const RC = {win:"#BBF7D0",loss:"#FECACA",live:"#FDE68A",open:"#E5E7EB"};
          const TC = {win:"#059669",loss:"#DC2626",live:"#D97706",open:"#9CA3AF"};
          const RL = {win:"✓ Sieg",loss:"✗ Niederlage",live:"● Läuft",open:"Offen"};
          return rubbers.map(r=>{
            const isD = r.id.startsWith("D");
            const borderCol = RC[r.result]||RC.open;
            const textCol   = TC[r.result]||TC.open;
            const shortName = v => {
              if(!v) return "";
              const clean = v.replace(/^\[\d+\]\s*/,"");
              return clean.split(" / ").map(p=>p.trim()).join(" / ");
            };
            return (
              <div key={r.id} onClick={()=>setRubberModal(r)}
                style={{display:"flex",alignItems:"center",gap:8,
                  background:isD?"#F8FAFC":"#fff",
                  border:`2px solid ${borderCol}`,
                  borderRadius:10,padding:"10px 12px",cursor:"pointer",
                  transition:"box-shadow .15s",userSelect:"none"}}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.08)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                {/* ID Badge */}
                <span style={{fontSize:12,fontWeight:800,color:"#fff",
                  background:textCol,borderRadius:5,padding:"2px 7px",
                  minWidth:28,textAlign:"center",flexShrink:0}}>
                  {r.id}
                </span>
                {/* Spieler */}
                <div style={{flex:1,minWidth:0}}>
                  {r.home||r.away ? (
                    <>
                      <div style={{fontSize:12,fontWeight:600,color:"#1D4ED8",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {shortName(r.home)||"—"}
                      </div>
                      <div style={{fontSize:11,color:"#6B7280",
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {shortName(r.away)||"—"}
                      </div>
                    </>
                  ):(
                    <div style={{fontSize:12,color:"#CBD5E1",fontStyle:"italic"}}>Tippen zum Eintragen</div>
                  )}
                </div>
                {/* Score + Status */}
                <div style={{textAlign:"right",flexShrink:0}}>
                  {r.score?(
                    <div style={{fontSize:13,fontWeight:800,color:"#111827",fontFamily:"monospace"}}>
                      {r.score}
                    </div>
                  ):<div style={{fontSize:12,color:"#E5E7EB"}}>–:–</div>}
                  <div style={{fontSize:10,fontWeight:700,color:textCol,marginTop:1}}>
                    {RL[r.result]||"Offen"}
                  </div>
                </div>
                <span style={{fontSize:14,color:"#D1D5DB",flexShrink:0}}>›</span>
              </div>
            );
          });
        })()}
      </div>

      {rubberModal&&(
        <RubberModal
          rubber={rubberModal}
          homePlayers={homePlayers}
          awayPlayers={awayPlayers}
          onSave={r=>{
            setRubbers(prev=>prev.map(x=>x.id===r.id?r:x));
            setDirty(true);
            setRubberModal(null);
          }}
          onClose={()=>setRubberModal(null)}
        />
      )}

      {/* Speichern-Button + Teilen */}
      <div style={{padding:"10px 12px",borderTop:"1px solid #E2E8F0",background:"#F8FAFC",
        display:"flex",gap:8,alignItems:"stretch"}}>
        <button onClick={save} disabled={saving||!dirty}
          style={{flex:1,background:dirty?"#D97706":"#059669",color:"#fff",border:"none",
            borderRadius:8,padding:"10px 0",fontSize:13,fontWeight:700,
            cursor:dirty?"pointer":"default",opacity:saving?0.6:1,transition:"background .2s"}}>
          {saving?"Speichern…":dirty?"📲 Auf Display übertragen":"✓ Aktuell auf Display"}
        </button>
        {!hideShare&&(
          <button onClick={()=>setSharePanel(p=>!p)}
            style={{background:sharePanel?"#1E293B":shareToken?"#F0FDF4":"#F3F4F6",
              border:`1px solid ${sharePanel?"#1E293B":shareToken?"#BBF7D0":"#E5E7EB"}`,
              borderRadius:8,cursor:"pointer",fontSize:11,padding:"0 14px",
              color:sharePanel?"#fff":shareToken?"#059669":"#6B7280",
              fontWeight:600,whiteSpace:"nowrap"}}>
            🔗 {shareToken?"Aktiv":"Teilen"}
          </button>
        )}
      </div>

      {/* Share-Panel */}
      {!hideShare&&sharePanel&&(
        <div style={{padding:"12px",borderTop:"1px solid #E2E8F0",background:"#F8FAFC"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>🔗 Zugriffs-Link</span>
            <ToggleSwitch on={!!shareToken} onToggle={toggleShare}/>
          </div>
          {shareToken ? (
            <>
              <div style={{fontSize:11,color:"#6B7280",marginBottom:6}}>
                Personen mit diesem Link können das Display bearbeiten — ohne Login.
                Toggle aus = Link sofort ungültig.
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input readOnly
                  value={`${window.location.origin}${window.location.pathname}?share=${shareToken}`}
                  onClick={e=>e.target.select()}
                  style={{flex:1,fontSize:10,fontFamily:"monospace",
                    border:"1px solid #BBF7D0",borderRadius:4,padding:"5px 7px",
                    background:"#fff",color:"#374151"}}/>
                <button
                  onClick={()=>navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?share=${shareToken}`).then(()=>onToast("Link kopiert ✓"))}
                  style={{background:"#059669",color:"#fff",border:"none",borderRadius:6,
                    padding:"5px 10px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap",fontWeight:600}}>
                  Kopieren
                </button>
              </div>
            </>
          ) : (
            <div style={{fontSize:11,color:"#9CA3AF"}}>
              Toggle aktivieren um einen neuen Link zu generieren.
            </div>
          )}
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
  const [picking, setPicking] = useState(null); // "from" | "to"
  const [tempVal, setTempVal] = useState("");

  const now = new Date();
  const isActive = sched.from && sched.to &&
    now >= new Date(sched.from) && now <= new Date(sched.to);

  const fmtDT = s => s ? new Date(s).toLocaleString("de-DE",{
    day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
  })+" Uhr" : null;

  const openPicker = field => { setTempVal(sched[field]||""); setPicking(field); };
  const confirm = () => { setSched(s=>({...s,[picking]:tempVal})); setPicking(null); };

  const btnStyle = set => ({
    flex:1,padding:"8px 10px",background:set?"#F0FDF4":"#F9FAFB",
    border:`1px solid ${set?"#86EFAC":"#D1D5DB"}`,borderRadius:8,cursor:"pointer",
    textAlign:"left",minWidth:0,
  });

  return (
    <div style={{marginBottom:16,padding:"12px 14px",background:"#F9FAFB",
      borderRadius:8,border:`1px solid ${isActive?"#86EFAC":"#E5E7EB"}`}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:10,
        display:"flex",alignItems:"center",gap:8}}>
        ⏰ ZEITSCHALTUNG <span style={{fontWeight:400}}>(optional)</span>
        {isActive&&<span style={{fontSize:10,background:"#DCFCE7",color:"#16A34A",
          padding:"1px 7px",borderRadius:10,fontWeight:700}}>AKTIV JETZT</span>}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
        <button style={btnStyle(!!sched.from)} onClick={()=>openPicker("from")}>
          <div style={{fontSize:10,color:"#9CA3AF",fontWeight:700,marginBottom:2}}>VON</div>
          <div style={{fontSize:12,fontWeight:sched.from?600:400,color:sched.from?"#374151":"#9CA3AF"}}>
            {fmtDT(sched.from)||"nicht gesetzt"}
          </div>
        </button>
        <button style={btnStyle(!!sched.to)} onClick={()=>openPicker("to")}>
          <div style={{fontSize:10,color:"#9CA3AF",fontWeight:700,marginBottom:2}}>BIS</div>
          <div style={{fontSize:12,fontWeight:sched.to?600:400,color:sched.to?"#374151":"#9CA3AF"}}>
            {fmtDT(sched.to)||"nicht gesetzt"}
          </div>
        </button>
        {(sched.from||sched.to)&&(
          <button onClick={()=>setSched({from:"",to:""})}
            style={{padding:"8px 10px",fontSize:13,color:"#EF4444",background:"none",
              border:"1px solid #FECACA",borderRadius:8,cursor:"pointer",alignSelf:"stretch"}}>
            ✕
          </button>
        )}
      </div>
      <div style={{fontSize:10,color:"#9CA3AF",marginTop:6}}>
        Innerhalb dieser Zeit wird dieser Modus automatisch aktiviert
      </div>

      {picking&&(
        <div style={S.overlay} onClick={()=>setPicking(null)}>
          <div style={{...S.modal,maxWidth:320,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div style={S.modalTitle}>{picking==="from"?"Von":"Bis"}-Zeitpunkt</div>
              <button style={S.closeBtn} onClick={()=>setPicking(null)}>✕</button>
            </div>
            <input type="datetime-local" value={tempVal} onChange={e=>setTempVal(e.target.value)}
              style={{...S.input,width:"100%",marginBottom:16,fontSize:15}}/>
            {tempVal&&<div style={{fontSize:12,color:"#6B7280",marginBottom:16,textAlign:"center"}}>
              {new Date(tempVal).toLocaleString("de-DE",{weekday:"long",day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})} Uhr
            </div>}
            <div style={{display:"flex",gap:8}}>
              <button style={{...S.ghostBtn,flex:1}} onClick={()=>setPicking(null)}>Abbrechen</button>
              <button style={{...S.primaryBtn,flex:1}} onClick={confirm}>Übernehmen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SETTINGS: DISPLAY ────────────────────────────────────────────────────
function SettingsMannschaftenTab({onToast}) {
  const [teamsConfig,   setTeamsConfig]   = useState([]);
  const [teamsSaving,   setTeamsSaving]   = useState(false);
  const [teamsStatus,   setTeamsStatus]   = useState(null);
  const [playersStatus, setPlayersStatus] = useState({}); // { [groupId]: "running" | {ok:bool} }
  const [playersPopup,  setPlayersPopup]  = useState(null); // Teamname dessen Spieler angezeigt werden
  const [githubPat,     setGithubPat_]    = useState("");
  const [scrapedAt,     setScrapedAt]     = useState(null);
  const [playersData,   setPlayersData]   = useState(null); // btv_players

  useEffect(()=>{
    sb.from("settings").select("value").eq("key","btv_teams_config").single()
      .then(({data})=>{ if(data?.value) try { setTeamsConfig(JSON.parse(data.value)); } catch(_){} });
    sb.from("settings").select("value").eq("key","github_pat").single()
      .then(({data})=>{ if(data?.value) setGithubPat_(data.value); });
    sb.from("settings").select("value").eq("key","btv_club_teams").single()
      .then(({data})=>{ try { setScrapedAt(JSON.parse(data?.value)?.scrapedAt||null); } catch(_){} });
    sb.from("settings").select("value").eq("key","btv_players").single()
      .then(({data})=>{ try { setPlayersData(JSON.parse(data?.value)||null); } catch(_){} });
  },[]);

  const saveTeamsConfig = async () => {
    setTeamsSaving(true);
    await sb.from("settings").upsert({key:"btv_teams_config", value:JSON.stringify(teamsConfig)},{onConflict:"key"});
    setTeamsSaving(false);
    onToast("Mannschaften gespeichert ✓");
  };

  const triggerTeamsLoad = async () => {
    if(!githubPat) { onToast("Kein GitHub PAT hinterlegt (Display-Tab → Speichern)","error"); return; }
    setTeamsStatus("running");
    try {
      const res = await fetch(
        "https://api.github.com/repos/MeierAndre130577/tennis-herrieden/actions/workflows/btv-fetch.yml/dispatches",
        { method:"POST",
          headers:{Authorization:`Bearer ${githubPat}`,Accept:"application/vnd.github+json","Content-Type":"application/json"},
          body: JSON.stringify({ref:"main", inputs:{teams_only:"true"}}) }
      );
      if(res.status===204){
        setTeamsStatus({ok:true, msg:"✅ Mannschaften-Fetch gestartet – dauert ~3 Min."});
        setTimeout(()=>setTeamsStatus(null), 8000);
      } else {
        const txt = await res.text();
        setTeamsStatus({ok:false, msg:`Fehler ${res.status}: ${txt}`});
      }
    } catch(e) {
      setTeamsStatus({ok:false, msg:`Netzwerkfehler: ${e.message}`});
    }
  };

  const triggerPlayersLoad = async (cfg) => {
    if(!githubPat) { onToast("Kein GitHub PAT hinterlegt (Display-Tab → Speichern)","error"); return; }
    const groupIdM = cfg.url?.match(/groupid=(\d+)/i);
    if(!groupIdM) { onToast("Keine groupId in URL für diese Mannschaft","error"); return; }
    const groupId = groupIdM[1];
    setPlayersStatus(s=>({...s, [groupId]:"running"}));
    try {
      const res = await fetch(
        "https://api.github.com/repos/MeierAndre130577/tennis-herrieden/actions/workflows/btv-fetch.yml/dispatches",
        { method:"POST",
          headers:{Authorization:`Bearer ${githubPat}`,Accept:"application/vnd.github+json","Content-Type":"application/json"},
          body: JSON.stringify({ref:"main", inputs:{
            players_only:"true",
            players_group_id: groupId,
            players_team_name: cfg.teamName||"",
            players_config_name: cfg.name||"",
          }}) }
      );
      if(res.status===204){
        setPlayersStatus(s=>({...s, [groupId]:{ok:true}}));
        onToast(`✅ Spieler-Fetch gestartet: ${cfg.name} – dauert ~3–5 Min.`);
        setTimeout(()=>setPlayersStatus(s=>{const n={...s};delete n[groupId];return n;}), 15000);
      } else {
        const txt = await res.text();
        setPlayersStatus(s=>({...s, [groupId]:{ok:false}}));
        onToast(`Fehler ${res.status}: ${txt}`,"error");
      }
    } catch(e) {
      setPlayersStatus(s=>({...s, [groupId]:{ok:false}}));
      onToast(`Netzwerkfehler: ${e.message}`,"error");
    }
  };

  return (
    <div style={K.page}>
      <h1 style={S.pageTitle}>Mannschaften</h1>
      <p style={S.pageSub}>Staffel-Konfiguration für Heimspielplan und BTV-Links</p>

      <div style={S.card}>
        <div style={{fontSize:12,color:"#6B7280",marginBottom:16,lineHeight:1.6,
          background:"#F8FAFC",borderRadius:8,padding:"10px 12px",border:"1px solid #E5E7EB"}}>
          Eine Zeile pro Mannschaft. Der BTV-Teamname muss exakt so stehen wie auf der Staffelseite (z.B. "SG Herrieden II").<br/>
          Format URL: <code style={{background:"#E5E7EB",padding:"0 3px",borderRadius:3,fontSize:11}}>
            https://www.btv.de/…?groupid=XXXXXXX
          </code>
        </div>

        {/* Spaltenköpfe */}
        <div style={{display:"grid",gridTemplateColumns:"130px 140px 1fr 28px",gap:6,marginBottom:4,paddingLeft:2}}>
          {["Bezeichnung","BTV-Teamname","Staffel-URL",""].map(h=>(
            <span key={h} style={{fontSize:10,fontWeight:700,color:"#9CA3AF",textTransform:"uppercase"}}>{h}</span>
          ))}
        </div>

        {/* Zeilen */}
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
          {teamsConfig.map((row,i)=>(
            <div key={i} style={{border:"1px solid #E5E7EB",borderRadius:8,padding:"8px",background:"#FAFAFA"}}>
              <div style={{display:"grid",gridTemplateColumns:"130px 140px 1fr 28px",gap:6,alignItems:"center",marginBottom:5}}>
                <input placeholder="z.B. Herren 1" value={row.name||""}
                  onChange={e=>{const c=[...teamsConfig];c[i]={...c[i],name:e.target.value};setTeamsConfig(c);}}
                  style={{padding:"6px 8px",border:"1px solid #D1D5DB",borderRadius:6,fontSize:12}}/>
                <input placeholder="z.B. SG Herrieden" value={row.teamName||""}
                  onChange={e=>{const c=[...teamsConfig];c[i]={...c[i],teamName:e.target.value};setTeamsConfig(c);}}
                  style={{padding:"6px 8px",border:"1px solid #D1D5DB",borderRadius:6,fontSize:12}}/>
                <input placeholder="https://www.btv.de/…?groupid=…" value={row.url||""}
                  onChange={e=>{const c=[...teamsConfig];c[i]={...c[i],url:e.target.value};setTeamsConfig(c);}}
                  style={{padding:"6px 8px",border:"1px solid #D1D5DB",borderRadius:6,fontSize:12}}/>
                <button onClick={()=>setTeamsConfig(teamsConfig.filter((_,j)=>j!==i))}
                  style={{background:"none",border:"1px solid #FECACA",borderRadius:6,
                    padding:"4px",cursor:"pointer",color:"#EF4444",fontSize:13,textAlign:"center"}}>✕</button>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",marginTop:5}}>
                <input placeholder="Liga / Staffel  z.B. Bezirksklasse Gruppe 3" value={row.liga||""}
                  onChange={e=>{const c=[...teamsConfig];c[i]={...c[i],liga:e.target.value};setTeamsConfig(c);}}
                  style={{flex:1,padding:"5px 8px",border:"1px solid #D1D5DB",borderRadius:6,fontSize:11,
                    color:"#6B7280"}}/>
                <select value={row.format||"6er"}
                  onChange={e=>{const c=[...teamsConfig];c[i]={...c[i],format:e.target.value};setTeamsConfig(c);}}
                  style={{padding:"5px 8px",border:"1px solid #D1D5DB",borderRadius:6,fontSize:11,color:"#374151",flexShrink:0,cursor:"pointer"}}>
                  <option value="6er">6er</option>
                  <option value="4er">4er</option>
                </select>
                {(()=>{
                  const gm = row.url?.match(/groupid=(\d+)/i);
                  const gid = gm?.[1];
                  if(!gid) return null;
                  const st = playersStatus[gid];
                  const pEntry = playersData?.config?.find(c=>c.groupId===gid);
                  const playerCount = pEntry
                    ? pEntry.opponents.reduce((s,o)=>(playersData.teams?.[`${gid}:${o}`]?.length||0)+s, playersData.teams?.[`${gid}:${row.teamName}`]?.length||0)
                    : 0;
                  return (
                    <button onClick={()=>triggerPlayersLoad(row)}
                      disabled={st==="running"}
                      title={playerCount>0?`${playerCount} Spieler geladen`:"Noch nicht geladen"}
                      style={{flexShrink:0,background:st==="running"?"#F3F4F6":playerCount>0?"#F0FDF4":"#F8FAFC",
                        border:`1px solid ${st==="running"?"#D1D5DB":playerCount>0?"#BBF7D0":"#E5E7EB"}`,
                        borderRadius:6,padding:"4px 10px",fontSize:11,cursor:st==="running"?"not-allowed":"pointer",
                        color:st==="running"?"#9CA3AF":playerCount>0?"#166534":"#6B7280",fontWeight:600,
                        whiteSpace:"nowrap"}}>
                      {st==="running"?"⏳ Lädt…":playerCount>0?`👤 ${playerCount} Spieler`:"👤 Spieler laden"}
                    </button>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>

        <button onClick={()=>setTeamsConfig([...teamsConfig,{name:"",teamName:"",url:"",liga:""}])}
          style={{background:"none",border:"1px dashed #D1D5DB",borderRadius:6,
            padding:"6px 14px",fontSize:12,cursor:"pointer",color:"#6B7280",width:"100%",marginBottom:16}}>
          + Mannschaft hinzufügen
        </button>

        {teamsStatus&&typeof teamsStatus==="object"&&(
          <div style={{marginBottom:12,padding:"8px 12px",borderRadius:6,fontSize:12,
            background:teamsStatus.ok?"#F0FDF4":"#FEF2F2",
            border:`1px solid ${teamsStatus.ok?"#BBF7D0":"#FECACA"}`,
            color:teamsStatus.ok?"#166534":"#DC2626"}}>
            {teamsStatus.msg}
          </div>
        )}

        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={saveTeamsConfig} disabled={teamsSaving}
            style={{background:"#8B5CF6",color:"#fff",border:"none",borderRadius:6,
              padding:"8px 16px",fontSize:12,cursor:"pointer",fontWeight:600,opacity:teamsSaving?0.6:1}}>
            {teamsSaving?"Speichern…":"💾 Speichern"}
          </button>
          <button onClick={triggerTeamsLoad} disabled={teamsSaving||teamsStatus==="running"}
            style={{background:"#2563EB",color:"#fff",border:"none",borderRadius:6,
              padding:"8px 16px",fontSize:12,cursor:"pointer",fontWeight:600,
              opacity:(teamsSaving||teamsStatus==="running")?0.6:1}}>
            {teamsStatus==="running"?"Lädt…":"▶ Mannschaften laden"}
          </button>
        </div>
        {scrapedAt&&(
          <div style={{marginTop:10,fontSize:11,color:"#9CA3AF"}}>
            Letzter Abruf: {new Date(scrapedAt).toLocaleDateString("de-DE",{day:"numeric",month:"long",year:"numeric"})} um {new Date(scrapedAt).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})} Uhr
          </div>
        )}
        <div style={{marginTop:12,padding:"10px 12px",background:"#F8FAFC",border:"1px solid #E5E7EB",
          borderRadius:8,fontSize:11,color:"#6B7280",lineHeight:1.7}}>
          <div style={{fontWeight:700,color:"#374151",marginBottom:4}}>Dieser Abruf aktualisiert:</div>
          <ul style={{margin:0,paddingLeft:16}}>
            <li><strong>Heimspielwoche-Widget</strong> — Spiele der nächsten 7 Tage auf dem Startbildschirm</li>
            <li><strong>BTV Links</strong> — Mannschaftsnamen und Verlinkungen</li>
            <li><strong>Display Schnellauswahl</strong> — Staffeln und Gegner für den Live-Anzeigebereich</li>
          </ul>
          <div style={{marginTop:6,fontStyle:"italic",color:"#9CA3AF"}}>
            Einmal pro Saison ausreichend, außer es kommen Mannschaften hinzu oder URLs ändern sich.
          </div>
        </div>
      </div>

      {/* ── Spieler-Popup ── */}
      {playersPopup&&(()=>{
        const players = playersData?.teams?.[playersPopup.key]||[];
        const label   = playersPopup.name;
        return (
          <div onClick={()=>setPlayersPopup(null)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div onClick={e=>e.stopPropagation()}
              style={{background:"#fff",borderRadius:12,padding:"20px 24px",width:360,
                maxHeight:"80vh",overflow:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.18)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#111827"}}>{label}</div>
                  <div style={{fontSize:11,color:"#9CA3AF"}}>{players.length} Spieler</div>
                </div>
                <button onClick={()=>setPlayersPopup(null)}
                  style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:"#9CA3AF",lineHeight:1}}>✕</button>
              </div>
              {players.length===0
                ? <div style={{fontSize:12,color:"#9CA3AF"}}>Keine Spieler geladen.</div>
                : players.map((p,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,
                    padding:"6px 0",borderBottom:"1px solid #F3F4F6"}}>
                    <span style={{fontSize:11,color:"#9CA3AF",minWidth:20,textAlign:"right"}}>{i+1}</span>
                    <span style={{fontSize:13,color:"#111827"}}>{p}</span>
                  </div>
                ))
              }
            </div>
          </div>
        );
      })()}

      {/* ── Spieler-Übersicht ── */}
      <div style={S.card}>
        <div style={{fontWeight:700,color:"#374151",fontSize:13,marginBottom:4}}>Meldelisten (Spieler)</div>
        <p style={{fontSize:12,color:"#6B7280",marginBottom:12,lineHeight:1.6}}>
          Pro Mannschaft "👤 Spieler laden" klicken — lädt Heimteam + alle Gegner dieser Staffel (ca. 3–5 Min.).
          Einmal pro Saison ausreichend.
        </p>

        {!playersData&&(
          <div style={{fontSize:11,color:"#9CA3AF",fontStyle:"italic",marginBottom:8}}>
            Noch keine Spielerdaten geladen — "👤 Spieler laden" bei einer Mannschaft klicken.
          </div>
        )}

        {/* Geladene Spieler anzeigen */}
        {playersData&&(()=>{
          const cfg = playersData.config||[];
          const teams = playersData.teams||{};
          const ts = playersData.scrapedAt ? new Date(playersData.scrapedAt) : null;
          return (
            <div>
              {ts&&(
                <div style={{fontSize:11,color:"#9CA3AF",marginBottom:10}}>
                  Geladen am {ts.toLocaleDateString("de-DE",{day:"numeric",month:"long",year:"numeric"})} um {ts.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})} Uhr
                </div>
              )}
              {cfg.map(entry=>{
                const homeKey   = `${entry.groupId}:${entry.teamName}`;
                const homeCount = teams[homeKey]?.length||0;
                const opponents = entry.opponents||[];
                return (
                  <div key={entry.name} style={{marginBottom:12,padding:"10px 12px",
                    background:"#F8FAFC",border:"1px solid #E5E7EB",borderRadius:8}}>
                    <div style={{fontWeight:600,color:"#374151",fontSize:12,marginBottom:6}}>
                      {entry.name}
                      <span style={{fontWeight:400,color:"#6B7280",marginLeft:6}}>({entry.teamName})</span>
                    </div>
                    {/* Heimteam */}
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span style={{fontSize:10,background:"#DBEAFE",color:"#1E40AF",
                        padding:"1px 6px",borderRadius:4,fontWeight:600}}>Heim</span>
                      <span
                        onClick={homeCount>0?()=>setPlayersPopup({key:homeKey,name:entry.teamName}):undefined}
                        style={{fontSize:11,color:"#374151",cursor:homeCount>0?"pointer":"default"}}>
                        {entry.teamName}
                      </span>
                      <span
                        onClick={homeCount>0?()=>setPlayersPopup({key:homeKey,name:entry.teamName}):undefined}
                        style={{fontSize:11,fontWeight:600,cursor:homeCount>0?"pointer":"default",
                          color:homeCount>0?"#059669":"#9CA3AF",
                          textDecoration:homeCount>0?"underline dotted":"none"}}>
                        {homeCount>0?`✓ ${homeCount} Spieler`:"nicht geladen"}
                      </span>
                    </div>
                    {/* Gegner */}
                    {opponents.length>0&&(
                      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>
                        {opponents.map(opp=>{
                          const oppKey = `${entry.groupId}:${opp}`;
                          const cnt = teams[oppKey]?.length||0;
                          return (
                            <span key={opp}
                              onClick={cnt>0?()=>setPlayersPopup({key:oppKey,name:opp}):undefined}
                              style={{fontSize:10,padding:"2px 7px",borderRadius:4,
                                cursor:cnt>0?"pointer":"default",
                                background:cnt>0?"#F0FDF4":"#F9FAFB",
                                border:`1px solid ${cnt>0?"#BBF7D0":"#E5E7EB"}`,
                                color:cnt>0?"#166534":"#9CA3AF"}}>
                              {opp}{cnt>0?` (${cnt})`:""}</span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {cfg.length===0&&Object.keys(teams).length>0&&(
                <div style={{fontSize:12,color:"#6B7280"}}>
                  {Object.keys(teams).length} Teams geladen (altes Format — einmal neu laden).
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ── SETTINGS: HINTERGRUND-JOBS ────────────────────────────────────────────
function SettingsJobsTab() {
  const [data, setData]         = useState({});
  const [githubPat, setGithubPat] = useState("");
  const [spielplanStatus, setSpielplanStatus] = useState(null); // null | "running" | "ok" | "error"

  useEffect(()=>{
    const keys = ["btv_club_teams","btv_club_teams_ergebnisse","btv_players","github_pat"];
    sb.from("settings").select("key,value").in("key", keys).then(({data:rows})=>{
      if (!rows) return;
      const m = {};
      rows.forEach(r=>{ try { m[r.key] = typeof r.value==="string" ? JSON.parse(r.value) : r.value; } catch(_){ m[r.key]=r.value; } });
      if (m.github_pat) setGithubPat(m.github_pat);
      setData(m);
    });
  },[]);

  const triggerSpielplan = async () => {
    if(!githubPat) { alert("Kein GitHub PAT hinterlegt – bitte unter Display-Einstellungen speichern."); return; }
    setSpielplanStatus("running");
    try {
      const res = await fetch(
        "https://api.github.com/repos/MeierAndre130577/tennis-herrieden/actions/workflows/btv-fetch.yml/dispatches",
        { method:"POST",
          headers:{Authorization:`Bearer ${githubPat}`,Accept:"application/vnd.github+json","Content-Type":"application/json"},
          body: JSON.stringify({ref:"main", inputs:{teams_only:"true"}}) }
      );
      if(res.status===204){
        setSpielplanStatus("ok");
        setTimeout(()=>setSpielplanStatus(null), 8000);
      } else {
        const txt = await res.text();
        console.error("GitHub Dispatch Fehler:", txt);
        setSpielplanStatus("error");
        setTimeout(()=>setSpielplanStatus(null), 6000);
      }
    } catch(e) {
      setSpielplanStatus("error");
      setTimeout(()=>setSpielplanStatus(null), 6000);
    }
  };

  const fmt = iso => {
    if (!iso) return null;
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"}) + " " +
           d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}) + " Uhr";
  };

  const lastPlan       = data.btv_club_teams?.scrapedAt;
  const lastErgebnisse = data.btv_club_teams_ergebnisse?.scrapedAt;
  const lastMelde      = data.btv_players?.scrapedAt;

  const jobs = [
    {
      icon: "📅",
      name: "BTV Spielplan",
      trigger: "Automatisch",
      schedule: "Täglich um 03:00 Uhr (MEZ)",
      desc: "Aktualisiert Spielplan, Tabelle und Ergebnisse aller Mannschaften. Läuft nachts damit tagsüber immer aktuelle Daten vorhanden sind.",
      lastRun: lastPlan,
      error: null,
      saves: ["btv_club_teams"],
      color: "#059669",
      bg: "#F0FDF4",
      border: "#BBF7D0",
    },
    {
      icon: "🏆",
      name: "BTV Ergebnisse",
      trigger: "Automatisch",
      schedule: "Täglich um 05:00 Uhr (MEZ)",
      desc: "Liest Spielergebnisse aller Mannschaften aus dem BTV-Widget. Läuft 2 Stunden nach dem Spielplan-Scraper.",
      lastRun: lastErgebnisse,
      error: null,
      saves: ["btv_club_teams_ergebnisse"],
      color: "#059669",
      bg: "#F0FDF4",
      border: "#BBF7D0",
    },
    {
      icon: "👤",
      name: "BTV Meldelisten",
      trigger: "Manuell",
      schedule: "Einmal pro Saison (in Mannschaften → Spieler laden)",
      desc: "Lädt die offiziellen Spieler-Meldelisten vom BTV für das Heimteam und alle Gegner einer Staffel. Pro Mannschaft ca. 3–5 Minuten.",
      lastRun: lastMelde,
      error: null,
      saves: ["btv_players"],
      color: "#D97706",
      bg: "#FFFBEB",
      border: "#FDE68A",
    },
  ];

  return (
    <div style={{padding:"24px 20px",maxWidth:680}}>

      {jobs.map(job=>(
        <div key={job.name} style={{marginBottom:16,padding:"14px 16px",background:"#fff",
          border:"1px solid #E5E7EB",borderRadius:10,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
            <div style={{fontSize:22,lineHeight:1}}>{job.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                <span style={{fontWeight:700,fontSize:14,color:"#111827"}}>{job.name}</span>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,
                  background:job.bg,color:job.color,border:`1px solid ${job.border}`}}>
                  {job.trigger}
                </span>
              </div>
              <div style={{fontSize:11,color:"#6B7280",marginBottom:6}}>🕐 {job.schedule}</div>
              <div style={{fontSize:12,color:"#374151",lineHeight:1.6,marginBottom:8}}>{job.desc}</div>

              {/* Letzter Lauf */}
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:"#9CA3AF"}}>Zuletzt:</span>
                {job.lastRun
                  ? <span style={{fontSize:11,fontWeight:600,color:"#059669"}}>✓ {fmt(job.lastRun)}</span>
                  : <span style={{fontSize:11,color:"#9CA3AF"}}>noch nie gelaufen</span>
                }
              </div>

              {/* Fehler */}
              {job.error&&(
                <div style={{marginTop:8,padding:"6px 10px",background:"#FEF2F2",
                  border:"1px solid #FECACA",borderRadius:6,fontSize:11,color:"#DC2626"}}>
                  ⚠ {job.error}
                </div>
              )}

              {/* Gespeicherte Keys */}
              <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
                {job.saves.map(k=>(
                  <span key={k} style={{fontSize:10,fontFamily:"monospace",
                    background:"#F3F4F6",color:"#6B7280",padding:"1px 6px",borderRadius:4,
                    border:"1px solid #E5E7EB"}}>{k}</span>
                ))}
              </div>

              {/* Manuell holen – nur für BTV Spielplan */}
              {job.name==="BTV Spielplan" && (
                <div style={{marginTop:10}}>
                  <button onClick={triggerSpielplan} disabled={spielplanStatus==="running"}
                    style={{fontSize:12,fontWeight:700,padding:"6px 14px",borderRadius:8,cursor:"pointer",
                      border:"1.5px solid #059669",
                      background: spielplanStatus==="running"?"#F0FDF4":"#059669",
                      color: spielplanStatus==="running"?"#059669":"#fff",
                      opacity: spielplanStatus==="running"?0.7:1,
                      transition:"all .15s"}}>
                    {spielplanStatus==="running" ? "⏳ Läuft…" : "▶ Jetzt holen"}
                  </button>
                  {spielplanStatus==="ok" && (
                    <span style={{marginLeft:10,fontSize:12,color:"#059669",fontWeight:600}}>
                      ✅ Gestartet – dauert ~3 Min.
                    </span>
                  )}
                  {spielplanStatus==="error" && (
                    <span style={{marginLeft:10,fontSize:12,color:"#DC2626",fontWeight:600}}>
                      ⚠ Fehler – PAT prüfen
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <p style={{fontSize:11,color:"#9CA3AF",marginTop:8,lineHeight:1.6}}>
        Alle Jobs laufen auf GitHub Actions. Logs und manuelle Starts unter{" "}
        <span style={{fontFamily:"monospace"}}>Actions → BTV Daten holen</span>.
      </p>
    </div>
  );
}

function SettingsDisplayTab({onToast}) {
  const [activeTab,      setActiveTab]      = useState("schedule");
  const [subTab,         setSubTab]         = useState("modus");
  const [mode,           setMode]           = useState("schedule"); // toggle-aktiver Modus
  const [theme,          setTheme]          = useState("dark");
  const [vereinsnr,      setVernr]          = useState("6085");
  const [saison,         setSaison]         = useState("2026");
  const [mannschaft,     setMannschaft]     = useState("");
  const [gegner,         setGegner]         = useState("");
  const [matchUrl,       setMatchUrl]       = useState("");
  const [bildUrl,        setBildUrl]        = useState("");
  const [githubPat,      setGithubPat]      = useState("");
  const [timeEntries,    setTimeEntries]    = useState([]);
  const [newEntry,       setNewEntry]       = useState({mode:"schedule",fromDate:"",fromTime:"08:00",toDate:"",toTime:"20:00"});
  const [matchCache,     setMatchCache]     = useState(null); // btv_match_cache
  const [revertKey,      setRevertKey]      = useState(0);
  const [fetchEnabled,   setFetchEnabled]   = useState(true); // btv_fetch_enabled
  const [uploading,      setUploading]      = useState(false);
  const [fotosInterval,  setFotosInterval]  = useState(8);
  const [affeMinuten,   setAffeMinuten]    = useState(10);
  const [affeSekunden,  setAffeSekunden]   = useState(10);
  const [affeModes,     setAffeModes]      = useState(["schedule","heimspiel","bild","fotos"]);
  const [saving,        setSaving]         = useState(false);
  const [fetchStatus,    setFetchStatus]    = useState(null);
  const [schedError,     setSchedError]     = useState(null);

  useEffect(()=>{
    sb.from("settings").select("*")
      .in("key",["display_mode","display_theme","display_vereinsnummer","display_saison",
                 "display_mannschaft","display_gegner","display_match_url",
                 "display_bild_url","github_pat",
                 "display_time_entries",
                 "btv_match_cache","btv_fetch_enabled",
                 "display_affe_minuten","display_affe_sekunden","display_affe_modes"])
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
        try { if(map.display_time_entries) setTimeEntries(JSON.parse(map.display_time_entries)); } catch(_){}
        try { if(map.btv_match_cache)         setMatchCache(JSON.parse(map.btv_match_cache)); } catch(_){}
        if(map.btv_fetch_enabled !== undefined) setFetchEnabled(map.btv_fetch_enabled !== "false");
        if(map.display_foto_interval)          setFotosInterval(Number(map.display_foto_interval)||8);
        if(map.display_affe_minuten)           setAffeMinuten(Number(map.display_affe_minuten)||10);
        if(map.display_affe_sekunden)          setAffeSekunden(Number(map.display_affe_sekunden)||10);
        try { if(map.display_affe_modes) setAffeModes(JSON.parse(map.display_affe_modes)); } catch(_){}
      });
  },[]);

  const checkOverlap = () => {
    const fmt = s => new Date(s).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    const valid = timeEntries.filter(e=>e.from&&e.to);
    for(let i=0;i<valid.length;i++) for(let j=i+1;j<valid.length;j++) {
      const a=valid[i], b=valid[j];
      if(new Date(a.from)<new Date(b.to) && new Date(b.from)<new Date(a.to)) {
        const overlapStart = new Date(a.from)>new Date(b.from)?a.from:b.from;
        const overlapEnd   = new Date(a.to)<new Date(b.to)?a.to:b.to;
        return `Zeitüberschneidung: „${a.mode}" (${fmt(a.from)}–${fmt(a.to)}) und „${b.mode}" (${fmt(b.from)}–${fmt(b.to)}) überlappen sich von ${fmt(overlapStart)} bis ${fmt(overlapEnd)}`;
      }
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
      {key:"display_time_entries",     value:JSON.stringify(timeEntries)},
      {key:"display_foto_interval",   value:String(fotosInterval)},
      {key:"display_affe_minuten",    value:String(affeMinuten)},
      {key:"display_affe_sekunden",   value:String(affeSekunden)},
      {key:"display_affe_modes",      value:JSON.stringify(affeModes)},
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
          if(data?.value) try { setMatchCache(JSON.parse(data.value)); setRevertKey(k=>k+1); } catch(_){}
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

  const toggleFetchEnabled = async () => {
    const next = !fetchEnabled;
    setFetchEnabled(next);
    await sb.from("settings").upsert({key:"btv_fetch_enabled", value: String(next)},{onConflict:"key"});
    onToast(next ? "✅ Automatischer Fetch aktiviert" : "⏸ Automatischer Fetch deaktiviert");
  };

  const [teamsConfig,     setTeamsConfig]     = useState([]); // für Schnellauswahl
  const [clubTeams,       setClubTeams]       = useState(null);
  const [selStaffel,      setSelStaffel]      = useState("");
  const [selGegner,       setSelGegner]       = useState("");

  useEffect(()=>{
    sb.from("settings").select("value").eq("key","btv_teams_config").single()
      .then(({data})=>{ if(data?.value) try { setTeamsConfig(JSON.parse(data.value)); } catch(_){} });
    sb.from("settings").select("value").eq("key","btv_club_teams").single()
      .then(({data})=>{ if(data?.value) try { setClubTeams(JSON.parse(data.value)); } catch(_){} });
  },[]);

  const quickFetch = async () => {
    if(!selStaffel || !selGegner) return;
    const staffelCfg = teamsConfig.find(t => t.name === selStaffel);
    const grp = clubTeams?.groups?.find(g => g.name === selStaffel);
    const game = grp?.homeGames?.find(g => g.opponent === selGegner);
    const homeTeam = staffelCfg?.teamName || selStaffel;
    const payload = {
      homeTeam,
      awayTeam:  selGegner,
      league:    grp?.liga || staffelCfg?.liga || "",
      matchDate: game?.date  || null,
      time:      game?.time  ? game.time + " Uhr" : null,
      homeLogo:  game?.homeLogo      || null,
      awayLogo:  game?.opponentLogo  || null,
      homeScore: 0, awayScore: 0,
      rubbers:   DEFAULT_RUBBERS("6er"),
      status:    "upcoming",
      _source:   "manual",
      _savedAt:  new Date().toISOString(),
    };
    const {error} = await sb.from("settings")
      .upsert([{key:"btv_match_cache", value:JSON.stringify(payload)}],{onConflict:"key"});
    if(error){ onToast(`Fehler: ${error.message}`,"error"); return; }
    setMatchCache(payload);
    setRevertKey(k=>k+1);
    setFetchStatus("ok");
    onToast(`✅ ${homeTeam} vs. ${selGegner} geladen`);
    setTimeout(()=>setFetchStatus(null), 3000);
  };

  const themes=[
    {id:"dark",     label:"Dunkel",        desc:"Navy-Blau Hintergrund (Standard)",       bg:"#0F172A",fg:"#F8FAFC"},
    {id:"light",    label:"Hell",          desc:"Weißer Hintergrund, dunkle Schrift",      bg:"#F8FAFC",fg:"#0F172A"},
    {id:"contrast", label:"Hoher Kontrast",desc:"Schwarz-Weiß für sehr helle Umgebungen", bg:"#FFFFFF",fg:"#000000"},
  ];

  const TABS = [
    {id:"einstellungen", icon:"⚙️", label:"Einstellungen"},
    {id:"schedule",      icon:"📅", label:"Tagesbelegung"},
    {id:"heimspiel",     icon:"🏆", label:"Heimspiel"},
    {id:"bild",          icon:"🖼️", label:"Bildanzeige"},
    {id:"fotos",         icon:"📸", label:"Fotos"},
  ];

  const SUB_TABS = {
    einstellungen: [
      {id:"modus",      label:"Anzeigemodus"},
      {id:"farbschema", label:"Farbschema"},
      {id:"easteregg",  label:"🐒 Easter Egg"},
    ],
  };

  const ModeRow = ({modeId, label}) => (
    <div onClick={()=>setMode(modeId)}
      style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"12px 14px",borderRadius:10,marginBottom:0,cursor:"pointer",
        background:mode===modeId?"#F5F3FF":"#F9FAFB",
        border:`1.5px solid ${mode===modeId?"#8B5CF6":"#E5E7EB"}`}}>
      <div>
        <div style={{fontWeight:700,fontSize:13,color:mode===modeId?"#7C3AED":"#374151"}}>
          {label || "Auf Display anzeigen"}
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

      {/* Tab-Navigation Level 1 */}
      <div style={{display:"flex",gap:6,marginTop:20,flexWrap:"wrap"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{flexShrink:0,fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:20,
              border:"1.5px solid #334155",cursor:"pointer",
              background:activeTab===t.id?"#334155":"transparent",
              color:activeTab===t.id?"#F1F5F9":"#64748B",
              display:"flex",alignItems:"center",gap:5}}>
            <span>{t.icon}</span>{t.label}
            {t.id!=="einstellungen"&&mode===t.id&&(
              <span style={{width:6,height:6,borderRadius:"50%",background:"#8B5CF6",display:"inline-block"}}/>
            )}
          </button>
        ))}
      </div>

      {/* Tab-Navigation Level 2 */}
      {SUB_TABS[activeTab]&&(
        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
          {SUB_TABS[activeTab].map(s=>(
            <button key={s.id} onClick={()=>setSubTab(s.id)}
              style={{flexShrink:0,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                border:"1.5px solid #1E293B",cursor:"pointer",
                background:subTab===s.id?"#1E293B":"transparent",
                color:subTab===s.id?"#CBD5E1":"#475569",
                display:"flex",alignItems:"center",gap:5}}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab-Inhalt */}
      <div style={{paddingTop:20,paddingBottom:8}}>

        {/* ── EINSTELLUNGEN: Anzeigemodus ── */}
        {activeTab==="einstellungen"&&subTab==="modus"&&(()=>{
          const MODES = [
            {id:"schedule",  icon:"📅", label:"Tagesbelegung"},
            {id:"heimspiel", icon:"🏆", label:"Heimspiel"},
            {id:"spielplan", icon:"🗓️", label:"Spielplan Saison"},
            {id:"bild",      icon:"🖼️", label:"Bildanzeige"},
            {id:"fotos",     icon:"📸", label:"Fotos-Slideshow"},
          ];
          const modeMap = Object.fromEntries(MODES.map(m=>[m.id,m]));
          const fmt = s => new Date(s).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})+" Uhr";
          const now = new Date();
          const entryStatus = e => {
            if(!e.from||!e.to) return "invalid";
            if(now < new Date(e.from)) return "future";
            if(now > new Date(e.to))   return "past";
            return "active";
          };
          const today    = new Date().toISOString().slice(0,10);
          const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
          const addEntry = () => {
            if(!newEntry.fromDate||!newEntry.fromTime||!newEntry.toDate||!newEntry.toTime) return;
            const from = `${newEntry.fromDate}T${newEntry.fromTime}`;
            const to   = `${newEntry.toDate}T${newEntry.toTime}`;
            if(new Date(from)>=new Date(to)) return;
            setTimeEntries(prev=>[...prev,{id:Date.now(),mode:newEntry.mode,from,to}]);
            setNewEntry(n=>({...n,fromDate:"",toDate:""}));
          };
          return (
            <div>
              {/* Aktiver Modus */}
              <p style={{fontSize:12,color:"#6B7280",marginBottom:10}}>Wähle, welcher Modus aktuell auf dem Display angezeigt wird.</p>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
                {MODES.map(m=><ModeRow key={m.id} modeId={m.id} label={`${m.icon} ${m.label}`}/>)}
              </div>

              {/* Zeitschaltung */}
              <div style={{borderTop:"1px solid #E5E7EB",paddingTop:16,marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:2}}>⏰ ZEITSCHALTUNG</div>
                <p style={{fontSize:12,color:"#9CA3AF",marginBottom:14}}>Schalte ein Display automatisch für einen bestimmten Zeitraum ein. Mehrere Einträge möglich.</p>

                {/* Formular */}
                <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:10,padding:"14px",marginBottom:14}}>
                  <div style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>DISPLAY</div>
                    <select value={newEntry.mode} onChange={e=>setNewEntry(n=>({...n,mode:e.target.value}))}
                      style={{...S.input,width:"100%"}}>
                      {MODES.map(m=><option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:10,marginBottom:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>VON</div>
                      <div style={{display:"flex",gap:4}}>
                        <input type="date" value={newEntry.fromDate}
                          onChange={e=>setNewEntry(n=>({...n,fromDate:e.target.value}))}
                          style={{...S.input,flex:1,minWidth:0}}/>
                        <input type="time" value={newEntry.fromTime}
                          onChange={e=>setNewEntry(n=>({...n,fromTime:e.target.value}))}
                          style={{...S.input,width:78,flexShrink:0}}/>
                      </div>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>BIS</div>
                      <div style={{display:"flex",gap:4}}>
                        <input type="date" value={newEntry.toDate}
                          onChange={e=>setNewEntry(n=>({...n,toDate:e.target.value}))}
                          style={{...S.input,flex:1,minWidth:0}}/>
                        <input type="time" value={newEntry.toTime}
                          onChange={e=>setNewEntry(n=>({...n,toTime:e.target.value}))}
                          style={{...S.input,width:78,flexShrink:0}}/>
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5,marginBottom:12,alignItems:"center"}}>
                    <span style={{fontSize:11,color:"#9CA3AF"}}>Schnell:</span>
                    {[{l:"Heute",d:today},{l:"Morgen",d:tomorrow}].map(p=>(
                      <button key={p.l} onClick={()=>setNewEntry(n=>({...n,fromDate:p.d,toDate:p.d}))}
                        style={{fontSize:11,padding:"2px 9px",borderRadius:12,border:"1px solid #D1D5DB",
                          background:"#fff",cursor:"pointer",color:"#374151"}}>
                        {p.l}
                      </button>
                    ))}
                  </div>
                  <button onClick={addEntry}
                    style={{...S.primaryBtn,width:"100%",opacity:(!newEntry.fromDate||!newEntry.toDate)?0.5:1}}>
                    + Eintrag hinzufügen
                  </button>
                </div>

                {/* Eintrags-Liste */}
                {timeEntries.length===0
                  ? <div style={{fontSize:12,color:"#9CA3AF",textAlign:"center",padding:"18px 0"}}>Noch keine Einträge gesetzt</div>
                  : <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {[...timeEntries].sort((a,b)=>new Date(a.from)-new Date(b.from)).map(e=>{
                        const st = entryStatus(e);
                        const m  = modeMap[e.mode];
                        const badge = st==="active"
                          ? {bg:"#DCFCE7",color:"#16A34A",text:"AKTIV"}
                          : st==="future"
                            ? {bg:"#EFF6FF",color:"#3B82F6",text:"KOMMT"}
                            : {bg:"#F3F4F6",color:"#9CA3AF",text:"ABGELAUFEN"};
                        return (
                          <div key={e.id} style={{display:"flex",alignItems:"center",gap:8,
                            padding:"9px 12px",borderRadius:8,
                            background:st==="active"?"#F0FDF4":st==="past"?"#F9FAFB":"#FAFBFF",
                            border:`1px solid ${st==="active"?"#86EFAC":st==="past"?"#E5E7EB":"#DBEAFE"}`}}>
                            <span style={{fontSize:15}}>{m?.icon}</span>
                            <span style={{fontSize:12,fontWeight:700,width:92,flexShrink:0,
                              color:st==="past"?"#9CA3AF":"#374151"}}>{m?.label}</span>
                            <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:10,
                              flexShrink:0,background:badge.bg,color:badge.color}}>
                              {badge.text}
                            </span>
                            <span style={{flex:1,fontSize:11,color:st==="past"?"#9CA3AF":"#64748B",
                              textAlign:"right",lineHeight:1.4}}>
                              {fmt(e.from)}<br/><span style={{color:"#94A3B8"}}>→</span> {fmt(e.to)}
                            </span>
                            <button onClick={()=>setTimeEntries(prev=>prev.filter(x=>x.id!==e.id))}
                              style={{fontSize:13,color:"#EF4444",background:"none",border:"none",
                                cursor:"pointer",padding:"2px 4px",flexShrink:0}}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                }
              </div>
            </div>
          );
        })()}

        {/* ── EINSTELLUNGEN: Farbschema ── */}
        {activeTab==="einstellungen"&&subTab==="farbschema"&&(
          <div>
            <p style={{fontSize:12,color:"#6B7280",marginBottom:12}}>Gilt übergreifend für alle Anzeigemodi.</p>
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

        {/* ── EINSTELLUNGEN: Easter Egg ── */}
        {activeTab==="einstellungen"&&subTab==="easteregg"&&(
          <div>
            <div style={{display:"flex",gap:12,marginBottom:16}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>TAKT (MINUTEN)</div>
                <select value={affeMinuten} onChange={e=>setAffeMinuten(Number(e.target.value))}
                  style={{...S.input,width:"100%"}}>
                  <option value={1}>Jede Minute (:01, :02, …)</option>
                  <option value={5}>Alle 5 Min (:00, :05, :10, …)</option>
                  <option value={10}>Alle 10 Min (:00, :10, :20, …)</option>
                </select>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:5}}>DAUER (SEKUNDEN)</div>
                <input type="number" min="5" max="60" value={affeSekunden}
                  onChange={e=>setAffeSekunden(Math.max(5,Number(e.target.value)))}
                  style={{...S.input,width:"100%"}}/>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#6B7280",marginBottom:8}}>AUF WELCHEN DISPLAYS ERSCHEINT DER AFFE?</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[
                {id:"schedule",  label:"Tagesbelegungsplan", icon:"📅"},
                {id:"heimspiel", label:"Heimspielmodus",     icon:"🏆"},
                {id:"bild",      label:"Bildanzeige",        icon:"🖼️"},
                {id:"fotos",     label:"Fotos-Slideshow",    icon:"📸"},
              ].map(m=>{
                const on = affeModes.includes(m.id);
                return (
                  <div key={m.id} onClick={()=>setAffeModes(prev=>on?prev.filter(x=>x!==m.id):[...prev,m.id])}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,cursor:"pointer",
                      background:on?"#F5F3FF":"#F9FAFB",border:`1.5px solid ${on?"#8B5CF6":"#E5E7EB"}`}}>
                    <span style={{fontSize:16}}>{m.icon}</span>
                    <span style={{flex:1,fontSize:13,fontWeight:600,color:on?"#7C3AED":"#374151"}}>{m.label}</span>
                    <span style={{fontSize:16}}>{on?"✓":""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAGESBELEGUNGSPLAN ── */}
        {activeTab==="schedule"&&(
          <div>
            <p style={{fontSize:12,color:"#9CA3AF"}}>Zeigt die heutigen Platzbuchungen in Echtzeit.</p>
          </div>
        )}

        {/* ── HEIMSPIELMODUS ── */}
        {activeTab==="heimspiel"&&(
          <div>
            {/* Schnellauswahl */}
            {teamsConfig.length>0&&clubTeams?.groups?.length>0?(
              <div style={{marginBottom:16,padding:"12px 14px",background:"#F0FDF4",
                border:"1px solid #BBF7D0",borderRadius:8}}>
                <div style={{fontSize:11,fontWeight:700,color:"#166534",marginBottom:10}}>
                  ⚡ SPIEL LADEN
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                  <div style={{flex:"1 1 160px"}}>
                    <div style={{fontSize:10,color:"#166534",fontWeight:600,marginBottom:3}}>Mannschaft</div>
                    <select value={selStaffel} onChange={e=>{setSelStaffel(e.target.value);setSelGegner("");}}
                      style={{width:"100%",padding:"7px 8px",border:"1px solid #BBF7D0",
                        borderRadius:6,fontSize:12,background:"#fff"}}>
                      <option value="">— auswählen —</option>
                      {teamsConfig.map(t=>(
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{flex:"1 1 180px"}}>
                    <div style={{fontSize:10,color:"#166534",fontWeight:600,marginBottom:3}}>Gegner</div>
                    <select value={selGegner} onChange={e=>setSelGegner(e.target.value)}
                      disabled={!selStaffel}
                      style={{width:"100%",padding:"7px 8px",border:"1px solid #BBF7D0",
                        borderRadius:6,fontSize:12,background:"#fff",opacity:selStaffel?1:0.5}}>
                      <option value="">— auswählen —</option>
                      {(()=>{
                        const grp = clubTeams.groups.find(g=>g.name===selStaffel);
                        return (grp?.homeGames||[]).map((g,i)=>(
                          <option key={i} value={g.opponent}>
                            {g.opponent}{g.date?" ("+new Date(g.date+"T12:00:00").toLocaleDateString("de-DE",{day:"numeric",month:"numeric"})+")" :""}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                  <button onClick={quickFetch} disabled={!selStaffel||!selGegner}
                    style={{padding:"7px 14px",fontSize:12,fontWeight:700,borderRadius:6,border:"none",
                      cursor:(!selStaffel||!selGegner)?"not-allowed":"pointer",
                      background:fetchStatus==="ok"?"#059669":"#15803D",
                      color:"#fff",opacity:(!selStaffel||!selGegner)?0.5:1,whiteSpace:"nowrap"}}>
                    {fetchStatus==="ok"?"✅ Geladen!":"📋 Spiel laden"}
                  </button>
                </div>
              </div>
            ):(
              <div style={{marginBottom:16,padding:"10px 12px",background:"#FEF3C7",
                border:"1px solid #FDE68A",borderRadius:8,fontSize:12,color:"#92400E"}}>
                ℹ️ BTV Spielplan noch nicht geladen — unter <strong>Mannschaften → Spielplan laden</strong> einmalig starten.
              </div>
            )}

            <HeimspieleEdit onToast={onToast} onSaved={setMatchCache} reloadKey={revertKey}/>
          </div>
        )}

        {/* ── BILDANZEIGE ── */}
        {activeTab==="bild"&&(
          <div>
            {/* Hinweis für KI-Bildgenerierung */}
            <div style={{marginBottom:14,padding:"10px 12px",background:"#F8FAFC",
              border:"1px solid #E2E8F0",borderRadius:8,fontSize:11,color:"#6B7280",lineHeight:1.6}}>
              <div style={{fontWeight:700,color:"#374151",marginBottom:4}}>📐 Ideales Format für KI-generierte Bilder</div>
              <div><strong>Querformat, mind. 1920 × 1080 px (16:9 oder breiter)</strong></div>
              <div style={{marginTop:4}}>Das Bild füllt immer den ganzen Bildschirm — Ränder werden automatisch beschnitten.</div>
              <div style={{marginTop:4}}>Das Bild erscheint unterhalb einer Kopfzeile (~85 px) — wichtige Inhalte nicht ganz oben platzieren.</div>
              <div style={{marginTop:4}}>Farbschema beachten: bei <strong>dunklem Theme</strong> dunklen Bildhintergrund wählen (<code style={{background:"#E5E7EB",padding:"0 3px",borderRadius:3}}>#0F172A</code>), bei <strong>hellem Theme</strong> hellen (<code style={{background:"#E5E7EB",padding:"0 3px",borderRadius:3}}>#F8FAFC</code>).</div>
            </div>

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
          </div>
        )}

        {/* ── FOTOS ── */}
        {activeTab==="fotos"&&(
          <div>
            <div style={{padding:"14px",background:"#F8FAFC",border:"1px solid #E2E8F0",
              borderRadius:8,fontSize:12,color:"#6B7280",lineHeight:1.6,marginBottom:16}}>
              <div style={{fontWeight:700,color:"#374151",marginBottom:4}}>📸 Fotos der aktuellen Woche</div>
              <div>Zeigt alle Fotos aus dem Clubstream die diese Woche (Mo–So) hochgeladen wurden.</div>
              <div style={{marginTop:4}}>Der Wechsel erfolgt automatisch — kein Tippen nötig.</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <label style={{fontSize:13,fontWeight:600,color:"#374151",whiteSpace:"nowrap"}}>
                Wechsel alle
              </label>
              <input type="number" min={3} max={120} value={fotosInterval}
                onChange={e=>setFotosInterval(Math.max(3,Number(e.target.value)))}
                style={{width:64,fontSize:14,fontWeight:700,textAlign:"center",
                  border:"1.5px solid #E5E7EB",borderRadius:6,padding:"5px 8px"}}/>
              <label style={{fontSize:13,color:"#6B7280"}}>Sekunden</label>
            </div>
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
function SlotModal({modal,data,user,guestFee,displayName,onBook,onCancel,onClose}) {
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
            <div style={{fontWeight:700,fontSize:16}}>{displayName(existing)}</div>
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

function CalendarView({data,user,dayBase,setDayBase,selCourt,setSelCourt,displayName,onSlotClick}) {
  const todayStr=today();
  const isToday=dayBase===todayStr;
  const isTomorrow=dayBase===addDays(todayStr,1);
  const d=new Date(dayBase+"T12:00:00");
  const dateLabel=isToday?"Heute":isTomorrow?"Morgen":`${DE_DAYS[dayOfWeek(dayBase)]}, ${d.getDate()}. ${DE_MONTH[d.getMonth()]}`;
  const isPastDay=dayBase<todayStr;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>

      {/* Platz-Tabs */}
      {data.courts.length>1&&(
        <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none",paddingBottom:2}}>
          {data.courts.map((c,i)=>(
            <button key={c.id} onClick={()=>setSelCourt(c.id)}
              style={ftab(selCourt===c.id, COURT_COLORS[i%COURT_COLORS.length], true)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Datum-Navigation */}
      <div style={{display:"flex",alignItems:"center",background:T.bgCard,borderRadius:T.rMd,border:`1px solid ${T.bgBorder}`,padding:"10px 14px"}}>
        <button onClick={()=>setDayBase(addDays(dayBase,-1))}
          style={{background:"none",border:"none",color:T.textSecondary,fontSize:22,cursor:"pointer",padding:"0 8px",lineHeight:1}}>‹</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontWeight:800,fontSize:15,color:isToday?T.success:T.textPrimary}}>{dateLabel}</div>
          {!isToday&&<div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{fmtDate(d)}</div>}
        </div>
        <button onClick={()=>setDayBase(addDays(dayBase,1))}
          style={{background:"none",border:"none",color:T.textSecondary,fontSize:22,cursor:"pointer",padding:"0 8px",lineHeight:1}}>›</button>
      </div>

      {!isToday&&(
        <button onClick={()=>setDayBase(todayStr)}
          style={{alignSelf:"center",background:"none",border:`1px solid ${T.bgBorder}`,borderRadius:T.rPill,color:T.textMuted,cursor:"pointer",fontSize:11,padding:"4px 14px"}}>
          Zurück zu Heute
        </button>
      )}

      {/* Slot-Liste */}
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {SLOTS.map(slot=>{
          const ci=data.courts.findIndex(c=>c.id===selCourt);
          const courtColor=COURT_COLORS[ci%COURT_COLORS.length]||T.success;
          const booking=data.bookings.find(b=>b.courtId===selCourt&&b.date===dayBase&&b.slot===slot);
          const isOwn=booking?.userId===user.id;
          const isPast=isPastDay;
          const disabled=isPast&&!booking;
          const bType=booking?.type||"regular";

          let bg,border,timeColor,label,labelColor,icon="";
          if(!booking&&isPast){
            bg="transparent"; border=`1px solid ${T.bgBorder}33`;
            timeColor=T.textMuted; label="—"; labelColor=T.textMuted;
          } else if(!booking){
            bg=T.bgCard; border=`1px solid ${T.bgBorder}`;
            timeColor=T.textPrimary; label="Frei"; labelColor=T.success;
          } else if(isOwn){
            bg=courtColor+"1A"; border=`1.5px solid ${courtColor}`;
            timeColor=courtColor; label=booking.with_guest?"✓ Du + Gast":"✓ Du"; labelColor=courtColor;
          } else {
            bg=T.bgCard; border=`1px solid ${T.bgBorder}`;
            timeColor=T.textMuted;
            icon=bType==="training"?"🏋️":bType==="match"?"🏆":booking.with_guest?"👥":"";
            const name=displayName(booking);
            label=`${icon} ${name}`.trim(); labelColor=T.textSecondary;
          }

          return (
            <button key={slot} disabled={disabled}
              onClick={()=>!disabled&&onSlotClick(selCourt,dayBase,slot,booking||null)}
              style={{display:"flex",alignItems:"center",gap:10,background:bg,border,borderRadius:T.rMd,
                padding:"13px 16px",cursor:disabled?"default":"pointer",opacity:disabled?.3:1,
                width:"100%",textAlign:"left",transition:"opacity .1s"}}>
              <span style={{fontSize:14,fontWeight:800,color:timeColor,flexShrink:0,minWidth:44}}>{slot}</span>
              <span style={{fontSize:11,color:T.textMuted,flexShrink:0}}>1 Std.</span>
              <span style={{flex:1,fontSize:13,fontWeight:600,color:labelColor,textAlign:"right"}}>{label}</span>
            </button>
          );
        })}
      </div>
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
  const [tab,setTab]=useState("guest");
  const [supaUsers,setSupaUsers]=useState([]);
  const [feeInput,setFeeInput]=useState(String(guestFee));
  const [confirmPay,setConfirmPay]=useState(null);
  useEffect(()=>{
    if(tab!=="guest") return;
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
        {[["guest","💶 Gastspieler"],["bookings","📅 Buchungen"]].map(([id,l])=>(<button key={id} style={{...S.tabBtn,...(tab===id?S.tabBtnActive:{})}} onClick={()=>setTab(id)}>{l}</button>))}
      </div>
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
            <div><div style={{fontWeight:600}}>{icon} {court?.name||"?"} · {b.slot} Uhr · {b.date}</div><div style={{fontSize:12,color:"#6B7280"}}>{displayName(b)}{b.with_guest?" · 👥 Gastspieler":""}{b.label?` · ${b.label}`:""}</div></div>
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

function ResetPasswordScreen() {
  const [password,setPassword]=useState("");const [msg,setMsg]=useState(null);const [loading,setLoading]=useState(false);
  const handle=async()=>{
    setLoading(true);setMsg(null);
    const {error}=await sb.auth.updateUser({password});
    if(error)setMsg({text:error.message,type:"error"});
    else{ setMsg({text:"Passwort gespeichert! Du wirst angemeldet…",type:"ok"}); setTimeout(()=>window.location.replace("/"),1500); }
    setLoading(false);
  };
  return (
    <div style={S.loginWrap}>
      <div style={S.loginCard}>
        <div style={{textAlign:"center",marginBottom:28}}><img src="/logo.png" alt="Tennis Herrieden" style={{width:64,height:64,objectFit:"contain",margin:"0 auto",display:"block"}}/><h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,marginTop:12}}>Neues Passwort</h1></div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <input type="password" placeholder="Neues Passwort" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} style={S.input}/>
          {msg&&<div style={{padding:"10px 12px",borderRadius:8,fontSize:13,background:msg.type==="error"?"#FEE2E2":"#DCFCE7",color:msg.type==="error"?"#991B1B":"#166534"}}>{msg.text}</div>}
          <button style={{...S.primaryBtn,marginTop:4,opacity:loading?.6:1}} onClick={handle} disabled={loading}>{loading?"…":"Passwort speichern"}</button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [mode,setMode]=useState("login");const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [firstName,setFirstName]=useState("");const [lastName,setLastName]=useState("");const [msg,setMsg]=useState(null);const [loading,setLoading]=useState(false);
  const handle=async()=>{
    setLoading(true);setMsg(null);
    if(mode==="login"){ const {error}=await sb.auth.signInWithPassword({email,password}); if(error)setMsg({text:error.message,type:"error"}); }
    else if(mode==="register"){ const name=`${firstName.trim()} ${lastName.trim()}`.trim(); const {error}=await sb.auth.signUp({email,password,options:{data:{name}}}); if(error)setMsg({text:error.message,type:"error"}); else setMsg({text:"Bitte bestätige deine E-Mail, dann kannst du dich anmelden.",type:"ok"}); }
    else { const {error}=await sb.auth.resetPasswordForEmail(email); if(error)setMsg({text:error.message,type:"error"}); else setMsg({text:"Passwort-Reset-Link gesendet.",type:"ok"}); }
    setLoading(false);
  };
  return (
    <div style={S.loginWrap}>
      <div style={S.loginCard}>
        <div style={{textAlign:"center",marginBottom:28}}><img src="/logo.png" alt="Tennis Herrieden" style={{width:72,height:72,objectFit:"contain",margin:"0 auto",display:"block"}}/><h1 style={{fontSize:22,fontWeight:800,letterSpacing:-.5,marginTop:12}}>Tennis Herrieden</h1><p style={{color:"#6B7280",fontSize:13,marginTop:4}}>Vereins-App</p></div>
        <div style={{display:"flex",gap:6,marginBottom:20}}>{[["login","Anmelden"],["register","Registrieren"]].map(([m,l])=>(<button key={m} style={{...S.tabBtn,flex:1,...(mode===m?S.tabBtnActive:{})}} onClick={()=>{setMode(m);setMsg(null);}}>{l}</button>))}</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="register"&&<input placeholder="Vorname" value={firstName} onChange={e=>setFirstName(e.target.value)} style={S.input}/>}
          {mode==="register"&&<input placeholder="Nachname" value={lastName} onChange={e=>setLastName(e.target.value)} style={S.input}/>}
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
  backBtn:    {margin:"0 12px 14px",padding:"6px 12px",background:"none",border:`1px solid ${T.bgBorder}`,borderRadius:7,color:T.textSecondary,cursor:"pointer",fontSize:12,fontWeight:600,textAlign:"left"},
  logo:       {padding:"0 16px 14px",borderBottom:"1px solid #1E293B",marginBottom:12,display:"flex",flexDirection:"column",gap:4},
  openChip:   {margin:"0 12px 8px",background:"#1E293B",border:"1px solid #F59E0B44",borderRadius:10,padding:"10px 12px",textAlign:"center"},
  page:       {padding:"28px 32px",maxWidth:860},
  summaryBar: {background:"#0F172A",borderRadius:12,padding:"16px 20px",marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"center"},
  payBtn:     {padding:"10px 16px",background:"#F59E0B",color:"#0F172A",border:"none",borderRadius:8,fontWeight:800,cursor:"pointer",fontSize:13,lineHeight:1.4,textAlign:"center"},
  drinkGrid:  {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12},
  drinkTile:  {background:"#fff",border:"1.5px solid #E5E7EB",borderRadius:14,padding:"22px 10px 16px",display:"flex",flexDirection:"column",alignItems:"center",gap:5,textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,.06)",transition:"all .15s"},
  drinkTileDone:{background:"#DCFCE7",borderColor:"#22C55E"},
};

// ═══════════════════════════════════════════════════════════════════════════
// KASSENBUCH APP
// ═══════════════════════════════════════════════════════════════════════════
const DE_MONTHS_LONG = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

function KassenbuchApp({profile, onBack}) {
  const [entries,     setEntries]     = useState([]);
  const [startbetrag, setStartbetrag] = useState(0);
  const [view,        setView]        = useState("list"); // "list" | "add" | "editstart" | "inventur"
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [viewYear,    setViewYear]    = useState(new Date().getFullYear());
  const [viewMonth,   setViewMonth]   = useState(new Date().getMonth());
  const [showAll,     setShowAll]     = useState(false);
  const [pendingDel,  setPendingDel]  = useState(null);
  const [swipedId,    setSwipedId]    = useState(null);
  const [toast,       setToast]       = useState(null);
  const [loading,     setLoading]     = useState(true);

  // form
  const [fType,   setFType]   = useState("in");
  const [fAmount, setFAmount] = useState("");
  const [fDesc,   setFDesc]   = useState("");
  const [fDate,   setFDate]   = useState(today());
  const [fStart,    setFStart]    = useState("");
  const [fInventur, setFInventur] = useState("");

  const swipeRef = useState({})[0];

  useEffect(()=>{ loadData(); },[profile.id]);

  async function loadData() {
    setLoading(true);
    const [{data:e},{data:s}] = await Promise.all([
      sb.from("kassenbuch").select("*").eq("user_id",profile.id).order("date",{ascending:false}).order("created_at",{ascending:false}),
      sb.from("kassenbuch_settings").select("*").eq("user_id",profile.id).single(),
    ]);
    setEntries(e||[]);
    if(s) setStartbetrag(parseFloat(s.startbetrag)||0);
    setLoading(false);
  }

  function showToast(msg,ok=true){ setToast({msg,ok}); setTimeout(()=>setToast(null),2500); }

  function filtered() {
    if(showAll) return entries;
    return entries.filter(e=>{ const d=new Date(e.date+"T12:00:00"); return d.getFullYear()===viewYear&&d.getMonth()===viewMonth; });
  }

  function balance() { return entries.reduce((s,e)=>e.type==="in"?s+parseFloat(e.amount):s-parseFloat(e.amount), startbetrag); }

  function shiftMonth(d) {
    setShowAll(false);
    let m=viewMonth+d, y=viewYear;
    if(m>11){m=0;y++;} if(m<0){m=11;y--;}
    setViewMonth(m); setViewYear(y);
  }

  async function saveEntry() {
    const amt = parseFloat(fAmount.replace(",","."));
    if(!amt||amt<=0||!fDesc.trim()||!fDate){ showToast("Bitte alle Felder ausfüllen.",false); return; }
    const {error} = await sb.from("kassenbuch").insert({
      user_id: profile.id, type: fType, amount: amt, description: fDesc.trim(), date: fDate,
    });
    if(error){ showToast("Fehler beim Speichern.",false); return; }
    showToast("Buchung gespeichert.");
    const d=new Date(fDate+"T12:00:00");
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); setShowAll(false);
    setFAmount(""); setFDesc(""); setFDate(today()); setFType("in");
    setView("list");
    loadData();
  }

  async function saveStart() {
    const val = parseFloat(fStart.replace(",","."));
    if(isNaN(val)){ showToast("Ungültiger Betrag.",false); return; }
    await sb.from("kassenbuch_settings").upsert({user_id:profile.id,startbetrag:val,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    setStartbetrag(val);
    showToast("Startbetrag gespeichert.");
    setView("list");
  }

  async function saveInventur() {
    const zielwert = parseFloat(fInventur.replace(",","."));
    if(isNaN(zielwert)||zielwert<0){ showToast("Ungültiger Betrag.",false); return; }
    const diff = zielwert - balance();
    if(Math.abs(diff) < 0.005){ showToast("Kein Unterschied – nichts gebucht."); setView("list"); return; }
    const type = diff > 0 ? "in" : "out";
    const {error} = await sb.from("kassenbuch").insert({
      user_id: profile.id,
      type,
      amount: Math.abs(diff),
      description: "Inventur",
      date: today(),
    });
    if(error){ showToast("Fehler beim Speichern.",false); return; }
    showToast(`Differenz ${type==="in"?"+":"−"}${eur(Math.abs(diff))} gebucht.`);
    setFInventur("");
    setView("list");
    loadData();
  }

  async function deleteEntry() {
    if(!pendingDel) return;
    const {error} = await sb.from("kassenbuch").delete().eq("id",pendingDel.id);
    if(error){ showToast("Fehler beim Löschen.",false); }
    else { showToast("Buchung gelöscht."); }
    setPendingDel(null); setSwipedId(null);
    loadData();
  }

  // touch/mouse swipe helpers
  function onSwipeStart(id,x){ swipeRef.id=id; swipeRef.x=x; swipeRef.active=true; }
  function onSwipeMove(id,x){
    if(!swipeRef.active||swipeRef.id!==id) return;
    if(x-swipeRef.x < -20) setSwipedId(id);
    else if(x-swipeRef.x > 10) setSwipedId(null);
  }
  function onSwipeEnd(id,x){
    if(!swipeRef.active||swipeRef.id!==id) return;
    swipeRef.active=false;
    if(x-swipeRef.x < -50){ const e=entries.find(e=>e.id===id); if(e) setPendingDel(e); }
    else setSwipedId(null);
  }

  const list      = filtered();
  const sumIn     = list.filter(e=>e.type==="in").reduce((s,e)=>s+parseFloat(e.amount),0);
  const sumOut    = list.filter(e=>e.type==="out").reduce((s,e)=>s+parseFloat(e.amount),0);
  const bal       = balance();
  const monthLabel= showAll ? "Alle Buchungen" : `${DE_MONTHS_LONG[viewMonth]} ${viewYear}`;

  const KB = {
    wrap:    {minHeight:"100vh",background:"#0F172A",fontFamily:"'DM Sans',system-ui,sans-serif",color:"#F1F5F9",display:"flex",flexDirection:"column",alignItems:"center"},
    inner:   {width:"100%",maxWidth:480,padding:"52px 20px 40px",display:"flex",flexDirection:"column",gap:14},
    header:  {display:"flex",alignItems:"center",gap:10,paddingBottom:4},
    backBtn: {background:"none",border:`1px solid ${T.bgBorder}`,borderRadius:8,color:T.textSecondary,cursor:"pointer",fontSize:13,padding:"6px 12px",display:"flex",alignItems:"center",gap:5},
    title:   {fontSize:20,fontWeight:800,letterSpacing:-.5,flex:1,color:T.textPrimary},
    addBtn:  {background:"#22C55E",color:"#052e16",border:"none",borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:5},
    balCard: {background:"#1E293B",border:"1.5px solid #334155",borderRadius:14,padding:"16px 18px"},
    balLabel:{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:.8,marginBottom:4},
    balAmt:  (pos)=>({fontSize:32,fontWeight:800,color:pos?"#4ADE80":"#F87171"}),
    startRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:10,borderTop:"1px solid #334155"},
    editBtn: {background:"none",border:"1px solid #334155",borderRadius:6,color:"#94A3B8",cursor:"pointer",fontSize:12,padding:"4px 10px",display:"flex",alignItems:"center",gap:4},
    menuWrap:{position:"relative"},
    menuBtn: {background:"none",border:"1px solid #334155",borderRadius:6,color:"#94A3B8",cursor:"pointer",fontSize:12,padding:"4px 10px",display:"flex",alignItems:"center",gap:4},
    menuDrop:{position:"absolute",right:0,top:"calc(100% + 4px)",background:"#1E293B",border:"1px solid #334155",borderRadius:8,overflow:"hidden",zIndex:10,minWidth:140},
    menuItem:{display:"block",width:"100%",padding:"10px 14px",background:"none",border:"none",color:"#E2E8F0",fontSize:13,cursor:"pointer",textAlign:"left"},
    statRow: {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
    stat:    {background:"#1E293B",border:"1.5px solid #334155",borderRadius:10,padding:"10px 14px"},
    statLbl: {fontSize:11,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:.6,marginBottom:3},
    statVal: (c)=>({fontSize:18,fontWeight:800,color:c}),
    monthRow:{display:"flex",alignItems:"center",gap:8},
    mBtn:    {background:"none",border:"1px solid #334155",borderRadius:6,color:"#94A3B8",cursor:"pointer",fontSize:18,lineHeight:1,padding:"5px 10px"},
    mLabel:  {flex:1,textAlign:"center",fontSize:14,fontWeight:700,color:"#CBD5E1"},
    allBtn:  (on)=>({background:on?"#14532D":"none",border:`1px solid ${on?"#22C55E":"#334155"}`,borderRadius:6,color:on?"#4ADE80":"#475569",cursor:"pointer",fontSize:12,padding:"4px 10px"}),
    hint:    {fontSize:11,color:"#334155",textAlign:"right",marginBottom:-4},
    entry:   (swiped)=>({background:"#1E293B",border:"1.5px solid #334155",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,transition:"transform .18s",transform:swiped?"translateX(-64px)":"translateX(0)",cursor:"pointer",userSelect:"none",touchAction:"pan-y"}),
    entryWrap:{position:"relative",overflow:"hidden",borderRadius:10,marginBottom:6},
    delBtn:  {position:"absolute",right:0,top:0,bottom:0,width:60,background:"#DC2626",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",borderRadius:"0 10px 10px 0",fontSize:18},
    icon:    (t)=>({width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,flexShrink:0,background:t==="in"?"#14532D":"#450A0A",color:t==="in"?"#4ADE80":"#F87171"}),
    eDesc:   {fontSize:14,color:"#E2E8F0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
    eDate:   {fontSize:12,color:"#475569"},
    eAmt:    (t)=>({fontSize:14,fontWeight:800,flexShrink:0,color:t==="in"?"#4ADE80":"#F87171"}),
    empty:   {textAlign:"center",color:"#475569",fontSize:14,padding:"2rem 0"},
    formCard:{background:"#1E293B",border:"1.5px solid #334155",borderRadius:14,padding:"18px",display:"flex",flexDirection:"column",gap:14},
    typeRow: {display:"grid",gridTemplateColumns:"1fr 1fr",gap:8},
    typeBtn: (t,sel)=>({border:`2px solid ${sel?(t==="in"?"#22C55E":"#EF4444"):"#334155"}`,borderRadius:10,padding:"12px 8px",cursor:"pointer",fontSize:22,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",background:sel?(t==="in"?"#14532D":"#450A0A"):"#0F172A",color:sel?(t==="in"?"#4ADE80":"#F87171"):"#475569",transition:"all .12s"}),
    lbl:     {fontSize:12,color:"#475569",fontWeight:600,marginBottom:-8},
    inp:     {background:"#0F172A",border:"1.5px solid #334155",borderRadius:8,color:"#F1F5F9",fontSize:14,padding:"9px 12px",outline:"none",width:"100%",boxSizing:"border-box"},
    saveBtn: {background:"#22C55E",color:"#052e16",border:"none",borderRadius:8,padding:"11px",fontWeight:800,fontSize:14,cursor:"pointer"},
    overlay: {position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:999},
    sheet:   {background:"#1E293B",borderRadius:"16px 16px 0 0",padding:"24px 20px",width:"100%",maxWidth:480,display:"flex",flexDirection:"column",gap:12},
    shTitle: {fontSize:16,fontWeight:800,color:"#F1F5F9"},
    shDesc:  {fontSize:14,color:"#94A3B8"},
    shBtns:  {display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4},
    shCancel:{background:"none",border:"1px solid #334155",borderRadius:8,padding:10,fontSize:14,color:"#94A3B8",cursor:"pointer"},
    shDel:   {background:"#DC2626",border:"none",borderRadius:8,padding:10,fontSize:14,fontWeight:700,color:"#fff",cursor:"pointer"},
  };

  if(loading) return <Loading msg="Lade Kassenbuch…"/>;

  // ── Formular: Startbetrag ──────────────────────────────────────────────
  if(view==="inventur") return (
    <div style={H.wrap}>
      <div style={H.inner} className="h-inner">
        <div style={{background:T.bgCard,padding:"16px 20px 16px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={()=>setView("list")}>←</button>
            <span style={{fontSize:T.fzH2,fontWeight:800,color:T.textPrimary}}>Inventur</span>
          </div>
        </div>
        <div style={KB.formCard}>
          <p style={{fontSize:14,color:"#64748B",margin:0}}>
            Trage den tatsächlich gezählten Kassenbestand ein. Die Differenz zum aktuellen Bestand wird automatisch als Buchung eingetragen.
          </p>
          <div style={{background:"#0F172A",borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:13,color:"#64748B"}}>Aktueller Bestand</span>
            <span style={{fontSize:13,fontWeight:700,color:bal>=0?"#4ADE80":"#F87171"}}>{eur(bal)}</span>
          </div>
          <div>
            <div style={KB.lbl}>Gezählter Bestand (€)</div>
            <input style={{...KB.inp,marginTop:6}} type="number" min="0" step="0.01" placeholder="0.00"
              value={fInventur} onChange={e=>setFInventur(e.target.value)}/>
          </div>
          {fInventur!=""&&!isNaN(parseFloat(fInventur.replace(",",".")))&&(()=>{
            const diff = parseFloat(fInventur.replace(",","."))-bal;
            if(Math.abs(diff)<0.005) return null;
            const pos = diff>0;
            return <div style={{background:pos?"#14532D":"#450A0A",borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:13,color:pos?"#86EFAC":"#FCA5A5"}}>Differenzbuchung</span>
              <span style={{fontSize:13,fontWeight:700,color:pos?"#4ADE80":"#F87171"}}>{pos?"+":"−"}{eur(Math.abs(diff))}</span>
            </div>;
          })()}
          <button style={KB.saveBtn} onClick={saveInventur}>Inventur buchen</button>
        </div>
      </div>
    </div>
  );

  if(view==="editstart") return (
    <div style={H.wrap}>
      <div style={H.inner} className="h-inner">
        <div style={{background:T.bgCard,padding:"16px 20px 16px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={()=>setView("list")}>←</button>
            <span style={{fontSize:T.fzH2,fontWeight:800,color:T.textPrimary}}>Startbetrag</span>
          </div>
        </div>
        <div style={KB.formCard}>
          <p style={{fontSize:14,color:"#64748B",margin:0}}>Der Startbetrag ist der Kassenbestand vor der ersten Buchung. Alle Buchungen werden dazu addiert bzw. subtrahiert.</p>
          <div>
            <div style={KB.lbl}>Startbetrag (€)</div>
            <input style={{...KB.inp,marginTop:6}} type="number" min="0" step="0.01" placeholder="0.00"
              value={fStart} onChange={e=>setFStart(e.target.value)}/>
          </div>
          <button style={KB.saveBtn} onClick={saveStart}>Speichern</button>
        </div>
      </div>
    </div>
  );

  // ── Formular: Buchung hinzufügen ───────────────────────────────────────
  if(view==="add") return (
    <div style={H.wrap}>
      <div style={H.inner} className="h-inner">
        <div style={{background:T.bgCard,padding:"16px 20px 16px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={()=>setView("list")}>←</button>
            <span style={{fontSize:T.fzH2,fontWeight:800,color:T.textPrimary}}>Buchung eintragen</span>
          </div>
        </div>
        <div style={KB.formCard}>
          <div>
            <div style={{...KB.lbl,marginBottom:6}}>Art der Buchung</div>
            <div style={KB.typeRow}>
              <button style={KB.typeBtn("in",fType==="in")} onClick={()=>setFType("in")} aria-label="Einnahme">+</button>
              <button style={KB.typeBtn("out",fType==="out")} onClick={()=>setFType("out")} aria-label="Ausgabe">−</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
              <div style={{textAlign:"center",fontSize:12,color:fType==="in"?"#4ADE80":"#475569"}}>Einnahme</div>
              <div style={{textAlign:"center",fontSize:12,color:fType==="out"?"#F87171":"#475569"}}>Ausgabe</div>
            </div>
          </div>
          <div>
            <div style={KB.lbl}>Betrag (€)</div>
            <input style={{...KB.inp,marginTop:6}} type="number" min="0" step="0.01" placeholder="0.00"
              value={fAmount} onChange={e=>setFAmount(e.target.value)}/>
          </div>
          <div>
            <div style={KB.lbl}>Beschreibung</div>
            <input style={{...KB.inp,marginTop:6}} type="text" placeholder="z.B. Getränkeverkauf Turnier"
              value={fDesc} onChange={e=>setFDesc(e.target.value)}/>
          </div>
          <div>
            <div style={KB.lbl}>Datum</div>
            <input style={{...KB.inp,marginTop:6}} type="date"
              value={fDate} onChange={e=>setFDate(e.target.value)}/>
          </div>
          <button style={KB.saveBtn} onClick={saveEntry}>Buchung speichern</button>
        </div>
      </div>
    </div>
  );

  // ── Hauptansicht ───────────────────────────────────────────────────────
  return (
    <div style={H.wrap} onClick={()=>setShowStartMenu(false)}>
      <div style={H.inner} className="h-inner">

        {/* Header-Card */}
        <div style={{background:T.bgCard,padding:"16px 20px 20px",borderRadius:T.rLg,border:`1px solid ${T.bgBorder}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button style={H.backBtn} onClick={onBack}>←</button>
            <div style={{flex:1}}/>
            <button style={KB.addBtn} onClick={()=>{ setFAmount(""); setFDesc(""); setFDate(today()); setFType("in"); setView("add"); }}>+ Neu</button>
          </div>
          <div style={{...H.header,paddingTop:12}}>
            <h1 style={{...H.title,fontSize:22}}>💰 Kassenbuch</h1>
            <p style={H.greeting}>Einnahmen & Ausgaben verwalten</p>
          </div>
        </div>

        {/* Saldo-Karte */}
        <div style={KB.balCard}>
          <div style={KB.balLabel}>Kassenbestand</div>
          <div style={KB.balAmt(bal>=0)}>{eur(bal)}</div>
          <div style={KB.startRow}>
            <span style={{fontSize:13,color:"#64748B"}}>Startbetrag: <strong style={{color:"#94A3B8"}}>{eur(startbetrag)}</strong></span>
            <div style={KB.menuWrap}>
              <button style={KB.menuBtn} onClick={e=>{ e.stopPropagation(); setShowStartMenu(v=>!v); }}>
                ⚙️ Optionen ▾
              </button>
              {showStartMenu&&(
                <div style={KB.menuDrop} onClick={e=>e.stopPropagation()}>
                  <button style={KB.menuItem} onMouseDown={()=>{ setShowStartMenu(false); setFStart(startbetrag.toFixed(2)); setView("editstart"); }}>
                    ✏️ Startbetrag bearbeiten
                  </button>
                  <button style={{...KB.menuItem,borderTop:"1px solid #334155"}} onMouseDown={()=>{ setShowStartMenu(false); setFInventur(""); setView("inventur"); }}>
                    🔢 Inventur
                  </button>
                </div>
              )}
            </div>
          </div>
          {(()=>{ const li=[...entries].find(e=>e.description==="Inventur"); if(!li) return null;
            return <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #1E3A2F",fontSize:12,color:"#475569",display:"flex",justifyContent:"space-between"}}>
              <span>Letzte Inventur</span>
              <span style={{color:"#64748B"}}>{li.type==="in"?"+":"−"}{eur(parseFloat(li.amount))} · {new Date(li.date+"T12:00:00").toLocaleDateString("de-DE")}</span>
            </div>;
          })()}
        </div>

        {/* Einnahmen / Ausgaben Zusammenfassung */}
        <div style={KB.statRow}>
          <div style={KB.stat}>
            <div style={KB.statLbl}>+ Einnahmen</div>
            <div style={KB.statVal("#4ADE80")}>{eur(sumIn)}</div>
          </div>
          <div style={KB.stat}>
            <div style={KB.statLbl}>− Ausgaben</div>
            <div style={KB.statVal("#F87171")}>{eur(sumOut)}</div>
          </div>
        </div>

        {/* Monatsfilter */}
        <div style={KB.monthRow}>
          <button style={KB.mBtn} onClick={()=>shiftMonth(-1)}>‹</button>
          <span style={KB.mLabel}>{monthLabel}</span>
          <button style={KB.mBtn} onClick={()=>shiftMonth(1)}>›</button>
          <button style={KB.allBtn(showAll)} onClick={()=>setShowAll(v=>!v)}>Alle</button>
        </div>

        {/* Buchungsliste */}
        <div>
          {list.length===0
            ? <div style={KB.empty}>Keine Buchungen in diesem Zeitraum</div>
            : <>
                <div style={KB.hint}>← wischen zum Löschen</div>
                {list.map(e=>(
                  <div key={e.id} style={KB.entryWrap}>
                    <div style={KB.delBtn} onClick={()=>setPendingDel(e)}>🗑️</div>
                    <div
                      style={KB.entry(swipedId===e.id)}
                      onTouchStart={ev=>onSwipeStart(e.id,ev.touches[0].clientX)}
                      onTouchMove={ev=>onSwipeMove(e.id,ev.touches[0].clientX)}
                      onTouchEnd={ev=>onSwipeEnd(e.id,ev.changedTouches[0].clientX)}
                      onMouseDown={ev=>onSwipeStart(e.id,ev.clientX)}
                      onMouseMove={ev=>onSwipeMove(e.id,ev.clientX)}
                      onMouseUp={ev=>onSwipeEnd(e.id,ev.clientX)}
                      onMouseLeave={ev=>onSwipeEnd(e.id,ev.clientX)}
                    >
                      <div style={KB.icon(e.type)}>{e.type==="in"?"+":"−"}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={KB.eDesc}>{e.description}</div>
                        <div style={KB.eDate}>{new Date(e.date+"T12:00:00").toLocaleDateString("de-DE")}</div>
                      </div>
                      <div style={KB.eAmt(e.type)}>{e.type==="in"?"+":"−"}{eur(parseFloat(e.amount))}</div>
                    </div>
                  </div>
                ))}
              </>
          }
        </div>

      </div>

      {/* Lösch-Bestätigung (Bottom Sheet) */}
      {pendingDel&&(
        <div style={KB.overlay} onClick={e=>{ if(e.target===e.currentTarget){setPendingDel(null);setSwipedId(null);} }}>
          <div style={KB.sheet}>
            <div style={KB.shTitle}>Buchung löschen?</div>
            <div style={KB.shDesc}>
              „{pendingDel.description}" – {pendingDel.type==="in"?"+":"−"}{eur(parseFloat(pendingDel.amount))}
              {" "}({new Date(pendingDel.date+"T12:00:00").toLocaleDateString("de-DE")})
            </div>
            <div style={KB.shBtns}>
              <button style={KB.shCancel} onClick={()=>{ setPendingDel(null); setSwipedId(null); }}>Abbrechen</button>
              <button style={KB.shDel}    onClick={deleteEntry}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast&&(
        <div style={{...S.toast,background:toast.ok?"#14532D":"#7F1D1D",bottom:32,right:16}}>
          {toast.ok?"✅":"❌"} {toast.msg}
        </div>
      )}
    </div>
  );
}

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
