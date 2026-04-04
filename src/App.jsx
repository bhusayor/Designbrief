import React, { useState, useRef, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════════════ */
const T = {
  bg:        "#09090D",
  sidebar:   "#0F0F15",
  surface:   "#14141C",
  card:      "#1C1C28",
  cardHover: "#222230",
  border:    "#252535",
  borderHover:"#383850",
  accent:    "#C8F55A",
  accentDim: "#8EAD3A",
  accentBg:  "#C8F55A14",
  text:      "#EEEEF5",
  textSoft:  "#8888A8",
  textMuted: "#44445A",
  red:       "#FF4D6A",
  amber:     "#FFB84D",
  green:     "#4DFFA0",
  blue:      "#5AB8FF",
  purple:    "#B87FFF",
  pink:      "#FF9EF5",
  teal:      "#5AFFEE",
};

const ROLE_META = {
  "UI Designer":       { color: T.purple, icon: "◈" },
  "UX Designer":       { color: T.blue,   icon: "◎" },
  "Frontend Dev":      { color: T.green,  icon: "⟨⟩" },
  "Backend Dev":       { color: T.amber,  icon: "⚙" },
  "Brand Strategist":  { color: T.accent, icon: "◉" },
  "Motion Designer":   { color: T.red,    icon: "▶" },
  "Copywriter":        { color: T.pink,   icon: "✦" },
  "Project Manager":   { color: T.teal,   icon: "◆" },
};

const PRIORITY_COLOR = { HIGH: T.red, MEDIUM: T.amber, LOW: T.green };

/* ═══════════════════════════════════════════════
   GLOBAL CSS
═══════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100svh;background:${T.bg};color:${T.text};font-family:'Syne',sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
textarea,input,button{outline:none;font-family:'Syne',sans-serif}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideRight{from{transform:translateX(-12px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes slideInLeft{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes barGrow{from{width:0}to{width:var(--bar-w)}}
@keyframes typewriter{from{width:0}to{width:100%}}
@keyframes blink{0%,49%{border-right-color:${T.accent};}50%,100%{border-right-color:transparent}}
.fade{animation:fadeUp .35s ease both}
.slide-r{animation:slideRight .3s ease both}
.sidebar-backdrop{animation:fadeUp .2s ease}
.sidebar-open{animation:slideInLeft .3s ease}
.typewriter-text{display:inline-block;border-right:2px solid ${T.accent};animation:blink .7s infinite;white-space:nowrap;overflow:hidden}

/* Responsive Styles */
@media(max-width:1024px){
  .responsive-padding{padding:32px 24px !important}
}
@media(max-width:768px){
  .hamburger-menu{display:flex !important}
  .sidebar-desktop{display:none !important}
  .main-responsive{padding:0 !important}
}
@media(max-width:480px){
  .responsive-padding{padding:20px 16px !important}
  .translator-grid{grid-template-columns:1fr !important}
  .kanban-horizontal{flex-direction:column !important}
}
`;

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
const uid = () => Math.random().toString(36).slice(2,9);

async function callClaude(system, user, maxTokens = 1500) {
  try {
    const r = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: user,
        system,
        maxTokens,
      }),
    });
    if (!r.ok) {
      const error = await r.json();
      throw new Error(error.message || `API error: ${r.status}`);
    }
    const d = await r.json();
    return d.message || "";
  } catch (error) {
    console.error("API call failed:", error);
    throw error;
  }
}

async function callClaudeWithSearch(system, user, maxTokens = 2000) {
  try {
    const r = await fetch("http://localhost:3001/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: user,
        system,
        maxTokens,
      }),
    });
    if (!r.ok) {
      throw new Error(`API error: ${r.status}`);
    }
    const d = await r.json();
    return d.message || "";
  } catch (error) {
    console.error("Search API call failed:", error);
    throw error;
  }
}

async function callJSON(system, user, maxTokens = 4000) {
  const txt = await callClaude(system, user, maxTokens);
  if (!txt) return null;
  // Strip markdown fences
  let clean = txt.replace(/```json[\s\S]*?```/g, s => s.slice(7, -3))
                  .replace(/```[\s\S]*?```/g, s => s.slice(3, -3))
                  .trim();
  // Try direct parse first
  try { return JSON.parse(clean); } catch(e) {}
  // Extract first {...} block
  const match = clean.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch(e) {} }
  // Last resort: find JSON between first { and last }
  const first = clean.indexOf("{");
  const last  = clean.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(clean.slice(first, last + 1)); } catch(e) {}
  }
  console.warn("callJSON parse failed. Raw response:", txt.slice(0, 300));
  return null;
}

async function readRawFile(file) {
  const textTypes = [".txt",".md",".doc",".docx",".rtf",".csv"];
  const isText = textTypes.some(ext => file.name.toLowerCase().endsWith(ext));
  if (isText) {
    return new Promise((res,rej)=>{
      const r = new FileReader();
      r.onload = ()=> res(r.result);
      r.onerror = ()=> rej(new Error("Read failed"));
      r.readAsText(file);
    });
  }
  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    return new Promise((res)=>{
      const r = new FileReader();
      r.onload = ()=>{
        try {
          const bytes = new Uint8Array(r.result);
          let text = "";
          let inString = false;
          let cur = "";
          for (let i=0; i<bytes.length-1; i++) {
            const ch = bytes[i];
            if (ch === 40) { inString=true; cur=""; continue; }
            if (ch === 41 && inString) {
              inString=false;
              const cleaned = cur.replace(/[^ -~]/g," ").trim();
              if (cleaned.length > 2) text += cleaned + " ";
              cur=""; continue;
            }
            if (inString) cur += String.fromCharCode(ch);
          }
          const raw = new TextDecoder("utf-8","ignore").decode(r.result);
          const matches = raw.match(/\(([^\)]{3,200})\)/g)||[];
          const extra = matches.map(m=>m.slice(1,-1).replace(/[^ -~]/g," ").trim()).filter(s=>s.length>3).join(" ");
          const combined = (text + " " + extra).replace(/\s+/g," ").trim();
          res(combined.length > 50 ? combined.slice(0,4000) : "");
        } catch(e) { res(""); }
      };
      r.readAsArrayBuffer(file);
    });
  }
  return new Promise((res)=>{
    const r = new FileReader();
    r.onload = ()=> res(r.result);
    r.onerror = ()=> res("");
    r.readAsText(file);
  });
}

async function readFileAsText(file) {
  // Read raw content first
  const raw = await readRawFile(file);

  if (!raw || raw.trim().length < 20) {
    return "[" + file.name + "] — Could not extract text. Please paste the content manually.";
  }

  // Use Claude to clean and reformat into plain English
  try {
    const cleaned = await callClaude(
      "You are a document formatter. Your job is to take messy, garbled, or poorly formatted document text and reformat it into clean, readable plain English. Preserve all meaningful content. Remove encoding artifacts, repeated characters, PDF syntax garbage, and strange symbols. Output only the clean text — no commentary, no preamble.",
      "Clean and reformat this extracted document text into plain English:\n\n" + raw.slice(0, 3000),
      1500
    );
    return cleaned && cleaned.trim().length > 20 ? cleaned.trim() : raw.slice(0, 3000);
  } catch(e) {
    return raw.slice(0, 3000);
  }
}

/* ═══════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════ */
export default function App() {
  const [activeSection, setActiveSection] = useState("translator"); // translator | team | library
  const [history, setHistory] = useState([]); // [{id,title,section,data,ts}]
  const [activeChat, setActiveChat] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Handle responsive sidebar
  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(true); // Always show on desktop
      } else {
        setSidebarOpen(false); // Start closed on mobile
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close sidebar when clicking outside on mobile
  const mainRef = React.useRef(null);
  React.useEffect(() => {
    if (!isMobile) return;
    const handleClick = (e) => {
      if (mainRef.current && mainRef.current.contains(e.target)) {
        // Check if click is on the main content area (not the sidebar)
        const sidebar = document.querySelector('aside');
        if (sidebar && !sidebar.contains(e.target)) {
          setSidebarOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isMobile]);

  // Handle Escape key to close sidebar
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isMobile && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMobile, sidebarOpen]);

  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function saveHistory(item) {
    setHistory(prev => {
      const exists = prev.find(h => h.id === item.id);
      if (exists) return prev.map(h => h.id === item.id ? item : h);
      return [item, ...prev];
    });
    setActiveChat(item.id);
  }

  function deleteHistory(id) {
    setHistory(prev => prev.filter(h => h.id !== id));
    if (activeChat === id) setActiveChat(null);
  }

  function pinHistory(id) {
    setHistory(prev => prev.map(h => h.id === id ? {...h, pinned: !h.pinned} : h));
  }

  function renameHistory(id, title) {
    setHistory(prev => prev.map(h => h.id === id ? {...h, title} : h));
  }

  function shareHistory(item) {
    const url = "https://designbrief.ai/share/" + item.id;
    navigator.clipboard.writeText(url);
    showToast("Share link copied!");
  }

  const translatorHistory = history.filter(h => h.section === "translator");
  const teamHistory       = history.filter(h => h.section === "team");

  const activeItem = history.find(h => h.id === activeChat);

  return (
    <>
      <style>{CSS}</style>
      <div style={{ display:"flex", height:"100vh", overflow:"hidden", flexDirection: isMobile && sidebarOpen ? "column" : "row", position: "relative" }}>

        {/* Sidebar backdrop for mobile */}
        {isMobile && sidebarOpen && (
          <div
            className="sidebar-backdrop"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 999,
              cursor: "pointer",
            }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── SIDEBAR ── */}
        <Sidebar
          activeSection={activeSection}
          setActiveSection={s => { setActiveSection(s); setActiveChat(null); if (isMobile) setSidebarOpen(false); }}
          translatorHistory={translatorHistory}
          teamHistory={teamHistory}
          activeChat={activeChat}
          setActiveChat={setActiveChat}
          onNewChat={() => setActiveChat(null)}
          onDelete={deleteHistory}
          onPin={pinHistory}
          onRename={renameHistory}
          onShare={shareHistory}
          isOpen={sidebarOpen}
          isMobile={isMobile}
        />

        {/* ── MAIN ── */}
        <main
          ref={mainRef}
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* Hamburger menu for mobile */}
          {isMobile && (
            <div
              style={{
                display: sidebarOpen ? "none" : "flex",
                alignItems: "center",
                padding: "16px",
                borderBottom: `1px solid ${T.border}`,
                background: T.surface,
                zIndex: 100,
              }}
            >
              <button
                onClick={() => setSidebarOpen(true)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: T.accent,
                  fontSize: "24px",
                  padding: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  transition: "all .2s",
                  background: T.surface,
                }}
                onMouseEnter={e => e.currentTarget.style.background = T.card}
                onMouseLeave={e => e.currentTarget.style.background = T.surface}
                title="Toggle sidebar"
              >
                ☰
              </button>
              <div style={{ flex: 1, textAlign: "center", fontWeight: 700, fontSize: 14, color: T.text }}>
                {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)}
              </div>
              <div style={{ width: 44 }} />
            </div>
          )}

          {activeSection === "translator" && (
            <TranslatorView
              key={activeChat || "new-translator"}
              existing={activeSection === "translator" ? activeItem : null}
              saveHistory={saveHistory}
              showToast={showToast}
              isMobile={isMobile}
            />
          )}
          {activeSection === "team" && (
            <TeamView
              key={activeChat || "new-team"}
              existing={activeSection === "team" ? activeItem : null}
              saveHistory={saveHistory}
              showToast={showToast}
              isMobile={isMobile}
            />
          )}
          {activeSection === "library" && (
            <LibraryView
              history={history}
              setActiveSection={setActiveSection}
              setActiveChat={setActiveChat}
              isMobile={isMobile}
            />
          )}
        </main>

        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════ */
function Sidebar({ activeSection, setActiveSection, translatorHistory, teamHistory, activeChat, setActiveChat, onNewChat, onDelete, onPin, onRename, onShare, isOpen, isMobile }) {
  const sections = [
    { id:"translator", label:"Brief Translator", icon:"◈" },
    { id:"team",       label:"Team Collab",      icon:"◉" },
    { id:"library",    label:"Project Library",  icon:"▦" },
  ];

  // Sort pinned items to top
  const sortedTranslator = [...translatorHistory].sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0));
  const sortedTeam = [...teamHistory].sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0));

  return (
    <aside style={{
      width: isMobile ? Math.min(260, window.innerWidth * 0.8) : 260,
      background:T.sidebar,
      borderRight:`1px solid ${T.border}`,
      display: isMobile && !isOpen ? "none" : "flex",
      flexDirection:"column",
      flexShrink: isMobile ? 1 : 0,
      overflow:"hidden",
      ...(isMobile ? {
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        zIndex: 1000,
        animation: isOpen ? "slideInLeft .3s ease" : "none",
      } : {}),
    }}>
      {/* Logo */}
      <div style={{ padding:"20px 18px 16px", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, background:T.accent, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:T.bg, fontWeight:800 }}>✦</div>
          <div>
            <div style={{ fontWeight:800, fontSize:14, letterSpacing:"-0.02em" }}>DesignBrief<span style={{color:T.accent}}>AI</span></div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono" }}>Brief Intelligence</div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 10px" }}>

        {/* NAV SECTIONS */}
        <div style={{ marginBottom:20 }}>
          <SideLabel>Navigation</SideLabel>
          {sections.map(s => (
            <SideBtn
              key={s.id}
              active={activeSection === s.id && !activeChat}
              onClick={() => { setActiveSection(s.id); onNewChat(); }}
              icon={s.icon}
            >{s.label}</SideBtn>
          ))}
        </div>

        {/* TRANSLATOR HISTORY */}
        {sortedTranslator.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <SideLabel>Translator History</SideLabel>
            {sortedTranslator.map(h => (
              <HistoryItem
                key={h.id}
                item={h}
                active={activeChat === h.id}
                onClick={() => { setActiveSection("translator"); setActiveChat(h.id); }}
                onDelete={onDelete}
                onPin={onPin}
                onRename={onRename}
                onShare={onShare}
              />
            ))}
          </div>
        )}

        {/* TEAM HISTORY */}
        {sortedTeam.length > 0 && (
          <div>
            <SideLabel>Team History</SideLabel>
            {sortedTeam.map(h => (
              <HistoryItem
                key={h.id}
                item={h}
                active={activeChat === h.id}
                onClick={() => { setActiveSection("team"); setActiveChat(h.id); }}
                onDelete={onDelete}
                onPin={onPin}
                onRename={onRename}
                onShare={onShare}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom new chat */}
      <div style={{ padding:"12px 10px", borderTop:`1px solid ${T.border}` }}>
        <button onClick={onNewChat} style={{
          width:"100%", background:T.accentBg, border:`1px solid ${T.accent}33`,
          borderRadius:8, padding:"9px 0", color:T.accent, fontSize:12,
          fontFamily:"Syne", fontWeight:700, cursor:"pointer", display:"flex",
          alignItems:"center", justifyContent:"center", gap:6, transition:"all .2s",
        }}
          onMouseEnter={e=>e.currentTarget.style.background=T.accent+"28"}
          onMouseLeave={e=>e.currentTarget.style.background=T.accentBg}
        >
          <span style={{fontSize:16}}>+</span> New Session
        </button>
      </div>
    </aside>
  );
}

function SideLabel({ children }) {
  return <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", letterSpacing:"0.08em", padding:"0 8px 6px", textTransform:"uppercase" }}>{children}</div>;
}

function SideBtn({ children, active, onClick, icon, sub }) {
  return (
    <button onClick={onClick} style={{
      width:"100%", background: active ? T.accentBg : "transparent",
      border:`1px solid ${active ? T.accent+"44" : "transparent"}`,
      borderRadius:8, padding:"8px 10px", color: active ? T.accent : T.textSoft,
      fontSize:12, fontFamily:"Syne", fontWeight: active ? 700 : 500,
      cursor:"pointer", display:"flex", alignItems:"center", gap:8,
      textAlign:"left", marginBottom:2, transition:"all .15s",
    }}
      onMouseEnter={e=>{ if(!active){ e.currentTarget.style.background=T.surface; e.currentTarget.style.color=T.text; }}}
      onMouseLeave={e=>{ if(!active){ e.currentTarget.style.background="transparent"; e.currentTarget.style.color=T.textSoft; }}}
    >
      <span style={{ fontSize:11, minWidth:14, textAlign:"center", opacity:.7 }}>{icon}</span>
      <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{children}</span>
      {sub && <span style={{ fontSize:9, color:T.textMuted, fontFamily:"DM Mono", flexShrink:0 }}>{sub}</span>}
    </button>
  );
}

/* ═══════════════════════════════════════════════
   HISTORY ITEM (sidebar with actions)
═══════════════════════════════════════════════ */
function HistoryItem({ item, active, onClick, onDelete, onPin, onRename, onShare }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(item.title);
  const menuRef = React.useRef();

  // Close menu on outside click
  React.useEffect(() => {
    if (!menuOpen) return;
    function handler(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function submitRename() {
    if (nameVal.trim()) onRename(item.id, nameVal.trim());
    setRenaming(false);
    setMenuOpen(false);
  }

  return (
    <div style={{ position:"relative", marginBottom:2 }}>
      {renaming ? (
        <div style={{ display:"flex", gap:4, padding:"4px 6px" }}>
          <input
            autoFocus
            value={nameVal}
            onChange={e=>setNameVal(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") submitRename(); if(e.key==="Escape"){ setRenaming(false); setNameVal(item.title); }}}
            style={{ flex:1, background:T.card, border:"1px solid "+T.accent+"66", borderRadius:6, padding:"5px 8px", color:T.text, fontFamily:"Syne", fontSize:11 }}
          />
          <button onClick={submitRename} style={{ background:T.accent, border:"none", borderRadius:6, padding:"4px 8px", color:T.bg, fontSize:10, fontFamily:"Syne", fontWeight:700, cursor:"pointer" }}>✓</button>
        </div>
      ) : (
        <div style={{
          display:"flex", alignItems:"center", gap:0,
          background: active ? T.accentBg : "transparent",
          border:"1px solid "+(active ? T.accent+"44" : "transparent"),
          borderRadius:8, transition:"all .15s",
        }}
          onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=T.surface; }}
          onMouseLeave={e=>{ if(!active) e.currentTarget.style.background="transparent"; }}
        >
          {/* Pin indicator */}
          {item.pinned && <span style={{ fontSize:8, color:T.accent, paddingLeft:8 }}>📌</span>}
          {/* Main clickable area */}
          <button onClick={onClick} style={{
            flex:1, background:"transparent", border:"none", padding:"8px 8px 8px "+(item.pinned?"4px":"10px"),
            color: active ? T.accent : T.textSoft, fontSize:11, fontFamily:"Syne",
            fontWeight: active ? 700 : 500, cursor:"pointer", textAlign:"left",
            display:"flex", alignItems:"center", gap:6, minWidth:0,
          }}>
            <span style={{ fontSize:10, opacity:.6, flexShrink:0 }}>◈</span>
            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{item.title}</span>
            <span style={{ fontSize:9, color:T.textMuted, fontFamily:"DM Mono", flexShrink:0 }}>
              {new Date(item.ts).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}
            </span>
          </button>
          {/* Menu trigger */}
          <button onClick={e=>{ e.stopPropagation(); setMenuOpen(v=>!v); }} style={{
            background:"transparent", border:"none", padding:"8px 8px", color:T.textMuted,
            cursor:"pointer", fontSize:13, flexShrink:0, opacity: menuOpen?1:0,
            transition:"opacity .15s",
          }}
            onMouseEnter={e=>e.currentTarget.style.opacity="1"}
            onMouseLeave={e=>{ if(!menuOpen) e.currentTarget.style.opacity="0"; }}
          >⋯</button>
        </div>
      )}
      {/* Dropdown menu */}
      {menuOpen && (
        <div ref={menuRef} style={{
          position:"absolute", right:0, top:"100%", zIndex:500,
          background:T.card, border:"1px solid "+T.border, borderRadius:10,
          padding:6, minWidth:150, boxShadow:"0 8px 24px rgba(0,0,0,.5)",
          animation:"fadeUp .15s ease",
        }}>
          {[
            { label: item.pinned ? "Unpin" : "Pin to top", icon:"📌", action:()=>{ onPin(item.id); setMenuOpen(false); }},
            { label:"Rename", icon:"✏️", action:()=>{ setRenaming(true); setMenuOpen(false); }},
            { label:"Copy share link", icon:"🔗", action:()=>{ onShare(item); setMenuOpen(false); }},
            { label:"Delete", icon:"🗑", action:()=>{ onDelete(item.id); setMenuOpen(false); }, danger:true },
          ].map(({label,icon,action,danger})=>(
            <button key={label} onClick={action} style={{
              width:"100%", background:"transparent", border:"none", borderRadius:7,
              padding:"7px 10px", display:"flex", alignItems:"center", gap:8,
              color: danger ? T.red : T.text, fontSize:12, fontFamily:"Syne",
              cursor:"pointer", textAlign:"left", transition:"background .1s",
            }}
              onMouseEnter={e=>e.currentTarget.style.background=danger?T.red+"18":T.surface}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}
            >
              <span style={{fontSize:12}}>{icon}</span>{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TYPEWRITER PLACEHOLDER
═══════════════════════════════════════════════ */
function TypewriterPlaceholder() {
  const [displayText, setDisplayText] = useState("");
  const fullText = "Paste brief, describe project, upload documents or files...";

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      if (idx < fullText.length) {
        setDisplayText(fullText.slice(0, idx + 1));
        idx++;
      } else {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ position:"relative", height:20, overflow:"hidden" }}>
      <span className="typewriter-text" style={{ color:T.textMuted, fontSize:12 }}>
        {displayText || fullText}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TRANSLATOR VIEW
═══════════════════════════════════════════════ */
function TranslatorView({ existing, saveHistory, showToast, isMobile }) {
  const [phase, setPhase] = useState(existing ? "result" : "input"); // input | loading | result
  const [briefText, setBriefText] = useState(existing?.data?.brief || "");
  const [fileName, setFileName] = useState(null);
  const [fileContent, setFileContent] = useState(""); // Hidden - for AI context only
  const [result, setResult] = useState(existing?.data?.result || null);
  const [scoring, setScoring] = useState(existing?.data?.scoring || null);
  const [loadMsg, setLoadMsg] = useState("");
  const [inspirations, setInspirations] = useState([]);
  const [loadingInspirations, setLoadingInspirations] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const fileRef = useRef();
  const imageRef = useRef();

  async function handleFile(f) {
    if (!f) return;
    setFileName(f.name);
    const txt = await readFileAsText(f);
    // Store content for AI context but don't show it
    setFileContent(txt);
    setShowUploadModal(false);
  }

  async function fetchInspirations(projectTitle, toneWords, moodboardKeywords) {
    setLoadingInspirations(true);
    const toneStr = (toneWords||[]).join(", ");
    const moodStr = (moodboardKeywords||[]).slice(0,4).join(", ");
    try {
      const inspRaw = await callClaudeWithSearch(
        "You are a creative director. Search the web for real design inspirations. Return ONLY a JSON array starting with [ and ending with ]. No other text, no markdown.",
        "Search for 5 real design inspiration websites or apps for a project: " + projectTitle + ". Style: " + toneStr + ". Keywords: " + moodStr + ". Return a JSON array where each object has: name, url, why, category (UI Reference|Competitor|Design System|Motion|Branding). Use real URLs only.",
        1500
      );
      let found = [];
      try {
        const arrMatch = (inspRaw||"").match(/\[[\s\S]*\]/);
        if (arrMatch) found = JSON.parse(arrMatch[0]);
      } catch(e) { found = []; }
      setInspirations(found);
      setResult(prev => prev ? Object.assign({}, prev, { inspirations: found }) : prev);
    } catch(e) { /* fail silently */ }
    setLoadingInspirations(false);
  }

  async function handleTranslate() {
    if (!briefText.trim() && !fileContent.trim()) return;
    setPhase("loading");
    setLoadMsg("Analysing brief...");

    // Combine brief text with file content for context (but don't show file content to user)
    let fullContext = briefText.trim();
    if (fileContent.trim()) {
      fullContext = `[DOCUMENT/IMAGE CONTENT]\n${fileContent.slice(0, 3000)}\n\n[USER BRIEF]\n${briefText}`;
    }

    const brief = fullContext.slice(0, 2500);

    // Build schema examples using JS objects so no escaping needed
    const scoreSchema = JSON.stringify({
      clarity: 7, completeness: 6, contradictions: 8, overall: 7,
      verdict: "FAIR",
      summary: "One sentence verdict.",
      issues: ["Issue one", "Issue two"],
      chaosReason: ""
    }, null, 2);

    const translateSchema = JSON.stringify({
      projectTitle: "Short project name",
      projectUnderstanding: "3-4 sentences: what is this project, who is it for, what problem does it solve, why does it matter.",
      isChaos: false,
      chaosSolutions: ["First way to clarify the brief", "Second way", "Third way"],
      toneWords: ["Bold", "Minimal", "Trustworthy", "Modern", "Warm"],
      colorDirection: {
        palette: ["#0D0D0D", "#4F46E5", "#F9FAFB"],
        mood: "Dark and purposeful with a vibrant accent"
      },
      typography: {
        display: "Syne Bold — geometric and assertive",
        body: "DM Sans — clean and legible",
        feel: "Editorial confidence without being cold"
      },
      brandAxes: { minimal_expressive: 3, playful_corporate: 7, classic_modern: 9 },
      moodboardKeywords: ["Dark UI", "Bold type", "Editorial grid", "Contrast", "Premium", "Data-driven"],
      redFlags: ["No success metrics defined", "Timeline is vague", "No brand assets mentioned"],
      questionsToAsk: [
        "Who is the primary user and their biggest frustration?",
        "What does success look like 3 months after launch?",
        "Do you have existing brand guidelines?",
        "Which platforms are priority?",
        "Who are your top 3 competitors?"
      ],
      clarityImprovements: [
        "Add a one-paragraph product vision",
        "Define the MVP feature set",
        "Set a hard launch deadline"
      ],
      budgetRange: {
        min: 12000, max: 25000, currency: "USD",
        rationale: "Mid-level estimate based on scope — professional freelance or small agency rates",
        breakdown: [
          { role: "UI Designer", amount: 5500, note: "Design system, screens, handoff — mid-level rate $85/hr" },
          { role: "UX Designer", amount: 4500, note: "Research, wireframes, testing — mid-level rate $90/hr" },
          { role: "Frontend Dev", amount: 9000, note: "Full build, QA, deployment — mid-level rate $110/hr" },
          { role: "Project Manager", amount: 3000, note: "Planning, comms, delivery — mid-level rate $80/hr" }
        ]
      },
      timeframe: {
        weeks: 10,
        breakdown: [
          { phase: "Discovery", duration: "1 week", tasks: [
            { name: "Kick-off call & brief alignment", days: 1 },
            { name: "Stakeholder interviews", days: 2 },
            { name: "Competitive analysis", days: 2 }
          ]},
          { phase: "UX Design", duration: "2 weeks", tasks: [
            { name: "User flows & journey mapping", days: 3 },
            { name: "Wireframes (all screens)", days: 4 },
            { name: "Interactive prototype", days: 2 },
            { name: "Usability review", days: 1 }
          ]},
          { phase: "UI Design", duration: "3 weeks", tasks: [
            { name: "Design system & components", days: 4 },
            { name: "High-fidelity screens", days: 7 },
            { name: "Responsive & mobile layouts", days: 3 },
            { name: "Design QA & Figma handoff", days: 1 }
          ]},
          { phase: "Development", duration: "3 weeks", tasks: [
            { name: "Frontend build", days: 8 },
            { name: "API & backend integration", days: 4 },
            { name: "QA & bug fixes", days: 3 }
          ]},
          { phase: "Launch", duration: "1 week", tasks: [
            { name: "Final QA & cross-browser testing", days: 2 },
            { name: "Documentation & handoff", days: 1 },
            { name: "Deployment & go-live", days: 2 }
          ]}
        ]
      },
      rolesNeeded: ["ONLY list roles that are explicitly required by THIS specific brief — do not add generic roles"],
      structuredBrief: "Write 150-250 word professional brief here in plain English that the designer can send to the client for sign-off. Make it specific to this project."
    }, null, 2);

    const deepSchema = JSON.stringify({
      techStack: {
        frontend: [{ name: "React", reason: "Specific reason it fits this project" }],
        backend:  [{ name: "Node.js", reason: "Specific reason" }],
        database: [{ name: "PostgreSQL", reason: "Specific reason" }],
        devops:   [{ name: "Vercel", reason: "Specific reason" }],
        design:   [{ name: "Figma", reason: "Specific reason" }],
        thirdParty: [{ name: "Stripe", reason: "Specific reason" }]
      },
      features: [
        { name: "User Authentication", priority: "MUST HAVE", description: "Secure login and registration. Users need persistent accounts.", userValue: "Access data from any device securely", complexity: "MEDIUM" },
        { name: "Core Feature", priority: "MUST HAVE", description: "Main value-delivering feature of the product.", userValue: "Primary benefit to end user", complexity: "HIGH" },
        { name: "Secondary Feature", priority: "SHOULD HAVE", description: "Enhances core experience.", userValue: "Improves retention and engagement", complexity: "LOW" }
      ],
      userFlow: [
        { step: 1, screen: "Landing / Onboarding", action: "User arrives and reads value proposition", outcome: "User understands product and clicks CTA", branch: "Returning user taps sign in" },
        { step: 2, screen: "Sign Up", action: "User enters details or uses social login", outcome: "Account created, moves to setup", branch: "" },
        { step: 3, screen: "Dashboard", action: "User sees main overview", outcome: "User understands core value and begins exploring", branch: "Empty state shown if no data yet" }
      ]
    }, null, 2);

    // ── Run score + translate in parallel ──
    const [scoreData, translated] = await Promise.all([

      callJSON(
        "You are a design brief analyst. Respond ONLY with a valid JSON object. No explanation, no markdown.",
        `Analyse this brief and score it.\n\nBrief:\n${brief}\n\nReturn a JSON object that follows this exact shape (replace the example values with real values based on the brief):\n${scoreSchema}`
      ),

      callJSON(
        "You are a senior brand strategist and design director. Respond ONLY with a valid JSON object. No explanation, no markdown, no code fences. Every single field must be populated with real values specific to this brief — never leave anything as the example placeholder. For rolesNeeded: ONLY include roles that are directly and specifically required by the brief — not generic nice-to-haves. A simple landing page needs only a UI Designer and maybe a Frontend Dev. For budgetRange: always use mid-level freelance rates ($80-120/hr for designers, $100-130/hr for developers). Scale the total to the project scope — a landing page is $5k-$12k, a mobile app is $25k-$60k, a full SaaS product is $40k-$100k. Breakdown must only include roles listed in rolesNeeded.",
        `Translate this client brief into a full structured design document.\n\nBrief:\n${brief}\n\nReturn a JSON object that follows this exact shape. Replace EVERY value with real content specific to this brief. The palette must have exactly 3 hex colors:\n${translateSchema}`,
        4000
      ),

    ]);

    setLoadMsg("Analysing tech stack, features & user flow...");

    const title = translated?.projectTitle || "this project";

    const deepData = await callJSON(
      "You are a senior product architect and UX lead. Respond ONLY with a valid JSON object. No explanation, no markdown, no code fences. Replace every placeholder with real values specific to this project.",
      `Analyse this project and return a product architecture document.\n\nProject: ${title}\nBrief: ${brief}\n\nReturn a JSON object following this exact shape (5-8 features, 7-10 user flow steps, all specific to this project):\n${deepSchema}`,
      4000
    );

    const finalResult = Object.assign({}, translated, {
      techStack:    deepData?.techStack  || null,
      features:     deepData?.features   || [],
      userFlow:     deepData?.userFlow   || [],
      inspirations: [],
    });

    setScoring(scoreData);
    setResult(finalResult);
    setInspirations([]);
    setPhase("result");

    const item = {
      id: uid(), section: "translator",
      title: finalResult?.projectTitle || projectName || "Untitled Brief",
      ts: new Date().toISOString(),
      data: { brief: briefText, projectName, scoring: scoreData, result: finalResult },
    };
    saveHistory(item);
  }
  function downloadBrief() {
    if (!result) return;
    const r = result;
    const s = scoring;
    const lines = [
      `DESIGNBRIEF AI — TRANSLATED BRIEF`,
      `${"═".repeat(50)}`,
      `Project: ${r.projectTitle}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Brief Score: ${s?.overall}/10 (${s?.verdict})`,
      ``,
      `BRIEF QUALITY`,
      `─────────────`,
      `Clarity: ${s?.clarity}/10`,
      `Completeness: ${s?.completeness}/10`,
      `Contradictions: ${s?.contradictions}/10`,
      `Summary: ${s?.summary}`,
      ``,
      ...(r.isChaos && r.chaosSolutions?.length ? [
        `⚠ BRIEF IS CHAOTIC — SOLUTIONS`,
        `─────────────────────────────`,
        ...r.chaosSolutions.map((x,i)=>`${i+1}. ${x}`),
        ``,
      ] : []),
      `TONE & MOOD`,
      `────────────`,
      r.toneWords?.join(" · "),
      ``,
      `COLOUR DIRECTION`,
      `─────────────────`,
      `Palette: ${r.colorDirection?.palette?.join(", ")}`,
      `Mood: ${r.colorDirection?.mood}`,
      ``,
      `TYPOGRAPHY`,
      `───────────`,
      `Display: ${r.typography?.display}`,
      `Body: ${r.typography?.body}`,
      `Feel: ${r.typography?.feel}`,
      ``,
      `MOODBOARD KEYWORDS`,
      `───────────────────`,
      r.moodboardKeywords?.join(" · "),
      ``,
      `TECH STACK`,
      `──────────`,
      ...(r.techStack ? Object.entries(r.techStack).flatMap(([cat,items])=>
        items&&items.length ? [cat.toUpperCase()+": "+items.map(i=>i.name).join(", ")] : []
      ) : []),
      ``,
      `FEATURES`,
      `─────────`,
      ...(r.features||[]).map(f=>"["+f.priority+"] "+f.name+" ("+f.complexity+") — "+f.description),
      ``,
      `USER FLOW`,
      `──────────`,
      ...(r.userFlow||[]).map(s=>"Step "+s.step+": "+s.screen+" > "+s.action+" > "+s.outcome+(s.branch?" | Alt: "+s.branch:"")),
      ``,
      `INSPIRATIONS`,
      `─────────────`,
      ...(r.inspirations||[]).map(i=>i.name+" ("+i.category+"): "+i.url+" — "+i.why),
      ``,
      ...(r.redFlags?.length ? [
        `🚩 RED FLAGS`,
        `─────────────`,
        ...r.redFlags.map((x,i)=>`${i+1}. ${x}`),
        ``,
      ] : []),
      `BRIEF CLARITY IMPROVEMENTS`,
      `───────────────────────────`,
      ...r.clarityImprovements?.map((x,i)=>`${i+1}. ${x}`) || [],
      ``,
      `QUESTIONS TO ASK CLIENT`,
      `────────────────────────`,
      ...r.questionsToAsk?.map((x,i)=>`${i+1}. ${x}`) || [],
      ``,
      `BUDGET ESTIMATE`,
      `────────────────`,
      `Range: $${r.budgetRange?.min?.toLocaleString()} – $${r.budgetRange?.max?.toLocaleString()} ${r.budgetRange?.currency}`,
      `Rationale: ${r.budgetRange?.rationale}`,
      ``,
      `TIMEFRAME`,
      `──────────`,
      `Total: ${r.timeframe?.weeks} weeks`,
      ...r.timeframe?.breakdown?.map(p=>`  • ${p.phase} (${p.duration}): ${p.tasks?.join(", ")}`) || [],
    ];
    const blob = new Blob([lines.join("\n")], { type:"text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${r.projectTitle?.replace(/\s+/g,"-") || "brief"}-translated.txt`;
    a.click();
  }

  if (phase === "input") return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding: isMobile ? "20px 16px" : "40px 32px", overflowY:"auto" }}>
      <div className="fade" style={{ width:"100%", maxWidth:640 }}>
        <div style={{ marginBottom:32, textAlign:"center" }}>
          <h1 style={{ fontSize:36, fontWeight:800, letterSpacing:"-0.03em", lineHeight:1.1, marginBottom:12, color:"white",}}>
            What did<br/><span style={{color:T.accent}}>your brief say?</span>
          </h1>
          <p style={{ color:T.textSoft, fontSize:14, lineHeight:1.7 }}>
            Share your brief. We'll analyze it, extract key insights, and help you scope your project.
          </p>
        </div>


        {/* Upload Modal */}
        {showUploadModal && (
          <div
            style={{
              position:"fixed",
              top:0,
              left:0,
              right:0,
              bottom:0,
              zIndex:999,
            }}
            onClick={()=>setShowUploadModal(false)}
          >
            <div
              style={{
                position:"fixed",
                bottom: isMobile ? "calc(100% - 120px)" : "auto",
                top: isMobile ? "auto" : "calc(100% - 140px)",
                right:"20px",
                background:T.surface,
                border:`1px solid ${T.border}`,
                borderRadius:10,
                padding:"10px 0",
                zIndex:1000,
                minWidth:200,
                boxShadow: isMobile
                  ? "0 -4px 12px rgba(0,0,0,0.1)"
                  : "0 4px 12px rgba(0,0,0,0.1)",
              }}
              onClick={e=>e.stopPropagation()}
            >
              <button
                onClick={()=>{fileRef.current?.click(); setShowUploadModal(false);}}
                style={{
                  display:"flex",
                  alignItems:"center",
                  gap:10,
                  padding:"10px 14px",
                  background:"none",
                  border:"none",
                  color:T.text,
                  cursor:"pointer",
                  fontSize:12,
                  fontFamily:"DM Mono",
                  fontWeight:500,
                  transition:"all .2s",
                  width:"100%",
                  textAlign:"left",
                }}
                onMouseEnter={e=>{ e.currentTarget.style.background=T.card; }}
                onMouseLeave={e=>{ e.currentTarget.style.background="none"; }}
              >
                <span style={{fontSize:16}}>📄</span>
                Document
              </button>

              <div style={{ height:"1px", background:T.border, margin:"6px 0" }} />

              <button
                onClick={()=>{imageRef.current?.click(); setShowUploadModal(false);}}
                style={{
                  display:"flex",
                  alignItems:"center",
                  gap:10,
                  padding:"10px 14px",
                  background:"none",
                  border:"none",
                  color:T.text,
                  cursor:"pointer",
                  fontSize:12,
                  fontFamily:"DM Mono",
                  fontWeight:500,
                  transition:"all .2s",
                  width:"100%",
                  textAlign:"left",
                }}
                onMouseEnter={e=>{ e.currentTarget.style.background=T.card; }}
                onMouseLeave={e=>{ e.currentTarget.style.background="none"; }}
              >
                <span style={{fontSize:16}}>🖼</span>
                Image
              </button>
            </div>
          </div>
        )}

        {/* Chat-like Input Box */}
        <div
          style={{
            border:`1px solid ${T.border}`,
            borderRadius:10,
            background:T.surface,
            padding:"14px",
            marginBottom:14,
            transition:"all .2s",
            display:"flex",
            flexDirection:"column",
            gap:12,
          }}
          onDragOver={e=>{ e.preventDefault(); e.currentTarget.style.borderColor=T.accent+"88"; e.currentTarget.style.backgroundColor=T.card; }}
          onDragLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.backgroundColor=T.surface; }}
          onDrop={e=>{ e.preventDefault(); e.currentTarget.style.borderColor=T.border; e.currentTarget.style.backgroundColor=T.surface; handleFile(e.dataTransfer.files[0]); }}
        >
          <textarea
            value={briefText}
            onChange={e=>setBriefText(e.target.value)}
            onKeyDown={e=>{
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (briefText.trim() || fileContent.trim()) handleTranslate();
              }
            }}
            placeholder="Describe your project, ask questions about your documents..."
            style={{
              width:"100%",
              minHeight:120,
              background:"transparent",
              border:"none",
              borderRadius:0,
              padding:0,
              color:T.text,
              fontFamily:"DM Mono",
              fontSize:12,
              lineHeight:1.8,
              resize:"none",
              outline:"none",
              margin:0,
            }}
            onFocus={e=>{ e.currentTarget.parentElement.style.borderColor=T.accent+"66"; e.currentTarget.parentElement.style.backgroundColor=T.accentBg+"0D"; }}
            onBlur={e=>{ e.currentTarget.parentElement.style.borderColor=T.border; e.currentTarget.parentElement.style.backgroundColor=T.surface; }}
          />

          {/* File Info */}
          {fileName && (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:T.card, borderRadius:6, marginTop:4 }}>
              <span style={{ fontSize:12 }}>📄</span>
              <span style={{ fontSize:11, color:T.accent, flexGrow:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fileName}</span>
              <button
                onClick={e=>{e.stopPropagation(); setFileName(null); setFileContent("");}}
                style={{
                  background:"none",
                  border:"none",
                  color:T.textMuted,
                  cursor:"pointer",
                  fontSize:14,
                  padding:"4px 8px",
                  borderRadius:4,
                  transition:"all .2s",
                  flexShrink:0,
                }}
                onMouseEnter={e=>{ e.target.style.color=T.red; e.target.style.background=T.border; }}
                onMouseLeave={e=>{ e.target.style.color=T.textMuted; e.target.style.background="none"; }}
                title="Remove file"
              >
                ×
              </button>
            </div>
          )}

          {/* Upload Button and Send Button */}
          <div style={{ display:"flex", gap:8, borderTop:`1px solid ${T.border}`, paddingTop:10, alignItems:"center" }}>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.pdf,.doc,.docx,.md"
              style={{display:"none"}}
              onChange={e=>handleFile(e.target.files[0])}
            />
            <input
              ref={imageRef}
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp"
              style={{display:"none"}}
              onChange={e=>handleFile(e.target.files[0])}
            />
            <button
              onClick={()=>setShowUploadModal(!showUploadModal)}
              style={{
                background:"none",
                border:"none",
                cursor:"pointer",
                fontSize:20,
                color:T.textSoft,
                padding:"6px 8px",
                borderRadius:6,
                transition:"all .2s",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                width:32,
                height:32,
              }}
              onMouseEnter={e=>{ e.target.style.color=T.accent; e.target.style.background=T.card; }}
              onMouseLeave={e=>{ e.target.style.color=T.textSoft; e.target.style.background="none"; }}
              title="Upload files or images"
            >
              ＋
            </button>

            <div style={{ flex:1 }} />

            {/* MD3 Send Button */}
            <button
              onClick={handleTranslate}
              disabled={!briefText.trim() && !fileContent.trim()}
              style={{
                background: (briefText.trim() || fileContent.trim()) ? T.accent : T.border,
                border:"none",
                cursor: (briefText.trim() || fileContent.trim()) ? "pointer" : "not-allowed",
                color: (briefText.trim() || fileContent.trim()) ? T.bg : T.textMuted,
                padding:"8px 14px",
                borderRadius:6,
                transition:"all .2s",
                fontWeight:600,
                fontSize:13,
                display:"flex",
                alignItems:"center",
                gap:6,
                opacity: (briefText.trim() || fileContent.trim()) ? 1 : 0.5,
              }}
              onMouseEnter={e=>{ if(briefText.trim() || fileContent.trim()) { e.target.style.background=T.accentDim; } }}
              onMouseLeave={e=>{ if(briefText.trim() || fileContent.trim()) { e.target.style.background=T.accent; } }}
              title="Analyze brief"
            >
              {/* MD3 Send Icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
              Analyze
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (phase === "loading") return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:20 }}>
      <div style={{ width:44, height:44, border:`3px solid ${T.border}`, borderTopColor:T.accent, borderRadius:"50%", animation:"spin .8s linear infinite" }} />
      <div style={{ fontFamily:"DM Mono", fontSize:13, color:T.textSoft }}>{loadMsg}</div>
    </div>
  );

  // RESULT
  const r = result;
  const s = scoring;
  if (!r) return null;

  const verdictColor = { GOOD:T.green, FAIR:T.amber, POOR:T.red, CHAOS:T.purple }[s?.verdict] || T.textMuted;

  return (
    <div style={{ flex:1, overflowY:"auto", padding: isMobile ? "20px 16px" : "32px 40px" }}>
      <div style={{ maxWidth: isMobile ? "100%" : 820, margin:"0 auto" }}>

        {/* Header */}
        <div className="fade" style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:28 }}>
          <div>
            <div style={{ fontSize:11, color:T.accent, fontFamily:"DM Mono", letterSpacing:"0.08em", marginBottom:6 }}>Translated Brief</div>
            <h2 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.02em" }}>{r.projectTitle}</h2>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Btn onClick={()=>{ showToast("Share link copied!"); navigator.clipboard.writeText(`https://designbrief.ai/share/${uid()}`); }}>🔗 Share</Btn>
            <Btn onClick={downloadBrief} primary>⬇ Download</Btn>
          </div>
        </div>

        {/* Project Understanding */}
        {r.projectUnderstanding && (
          <div className="fade" style={{ background:T.surface, border:"1px solid "+T.border, borderRadius:14, padding:"18px 24px", marginBottom:16 }}>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", letterSpacing:"0.08em", marginBottom:10 }}>PROJECT UNDERSTANDING</div>
            <p style={{ fontSize:14, color:T.text, lineHeight:1.85, margin:0 }}>{r.projectUnderstanding}</p>
          </div>
        )}

        {/* Score strip */}
        <div className="fade" style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:"18px 24px", marginBottom:16, display:"flex", alignItems:"center", gap:24 }}>
          <div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:4 }}>Brief Score</div>
            <div style={{ fontSize:42, fontWeight:800, color:verdictColor, lineHeight:1 }}>{s?.overall}<span style={{fontSize:18,color:T.textMuted}}>/10</span></div>
          </div>
          <div style={{ width:1, height:50, background:T.border }} />
          {[["Clarity",s?.clarity],[`Completeness`,s?.completeness],[`No Contradictions`,s?.contradictions]].map(([l,v])=>(
            <div key={l} style={{ flex:1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <span style={{ fontSize:11, color:T.textSoft }}>{l}</span>
                <span style={{ fontSize:11, fontFamily:"DM Mono", color:T.text }}>{v}/10</span>
              </div>
              <div style={{ height:3, background:T.border, borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", background: v>=7?T.green:v>=4?T.amber:T.red, "--bar-w":`${v*10}%`, width:`${v*10}%`, animation:"barGrow .8s ease both", borderRadius:2 }} />
              </div>
            </div>
          ))}
          <div style={{ background:verdictColor+"22", border:`1px solid ${verdictColor}44`, borderRadius:8, padding:"6px 14px", color:verdictColor, fontWeight:700, fontSize:12, fontFamily:"DM Mono" }}>{s?.verdict}</div>
        </div>

        {/* CHAOS SOLUTIONS */}
        {r.isChaos && r.chaosSolutions?.length > 0 && (
          <div className="fade" style={{ background:`${T.purple}14`, border:`1px solid ${T.purple}44`, borderRadius:14, padding:"18px 24px", marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
              <span style={{ fontSize:18 }}>⚡</span>
              <div style={{ fontWeight:700, color:T.purple }}>This brief is chaotic — here's how to fix it</div>
            </div>
            <div style={{ fontSize:12, color:T.textSoft, marginBottom:12 }}>{s?.chaosReason}</div>
            {r.chaosSolutions.map((sol,i)=>(
              <div key={i} style={{ display:"flex", gap:12, padding:"8px 0", borderTop: i>0?`1px solid ${T.border}`:undefined }}>
                <span style={{ color:T.purple, fontFamily:"DM Mono", fontSize:11, minWidth:20 }}>0{i+1}</span>
                <span style={{ fontSize:13, lineHeight:1.7 }}>{sol}</span>
              </div>
            ))}
          </div>
        )}

        {/* 2-col grid */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14, marginBottom:14 }}>

          {/* Tone */}
          <Card title="Tone & Mood">
            <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
              {r.toneWords?.map((w,i)=>(
                <span key={i} style={{ background:T.accentBg, border:`1px solid ${T.accent}33`, borderRadius:6, padding:"4px 12px", fontSize:12, color:T.accent, fontWeight:600 }}>{w}</span>
              ))}
            </div>
          </Card>

          {/* Colour */}
          <Card title="Colour Direction">
            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              {r.colorDirection?.palette?.map((c,i)=>(
                <div key={i} style={{ flex:1, height:36, background:c, borderRadius:8, cursor:"pointer" }} title={c} onClick={()=>{navigator.clipboard.writeText(c);}} />
              ))}
            </div>
            <div style={{ fontSize:11, color:T.textSoft, lineHeight:1.6 }}>{r.colorDirection?.mood}</div>
          </Card>

          {/* Typography */}
          <Card title="Typography Direction">
            <div style={{ display:"flex", gap:16 }}>
              {[["Display",r.typography?.display],["Body",r.typography?.body]].map(([l,v])=>(
                <div key={l}>
                  <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:4 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, color:T.textSoft, marginTop:8 }}>{r.typography?.feel}</div>
          </Card>

          {/* Brand axes */}
          <Card title="Brand Personality">
            {[["Minimal","Expressive",r.brandAxes?.minimal_expressive],["Playful","Corporate",r.brandAxes?.playful_corporate],["Classic","Modern",r.brandAxes?.classic_modern]].map(([a,b,v])=>(
              <div key={a} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:5 }}>
                  <span>{a}</span><span>{b}</span>
                </div>
                <div style={{ height:3, background:T.border, borderRadius:2, position:"relative" }}>
                  <div style={{ position:"absolute", left:`${(v||5)*10}%`, transform:"translateX(-50%)", top:-5, width:13, height:13, background:T.accent, borderRadius:"50%", border:`2px solid ${T.bg}`, transition:"left .4s ease" }} />
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* Moodboard */}
        <Card title="Moodboard Direction" style={{ marginBottom:14 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {r.moodboardKeywords?.map((k,i)=>(
              <span key={i} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"4px 12px", fontSize:12, color:T.textSoft, fontFamily:"DM Mono" }}>{k}</span>
            ))}
          </div>
        </Card>

        {/* Clarity improvements */}
        {r.clarityImprovements?.length > 0 && (
          <Card title="How to Improve This Brief" style={{ marginBottom:14, borderColor:T.blue+"44" }}>
            {r.clarityImprovements.map((c,i)=>(
              <div key={i} style={{ display:"flex", gap:12, padding:"8px 0", borderBottom: i<r.clarityImprovements.length-1?`1px solid ${T.border}`:"none" }}>
                <span style={{ color:T.blue, fontFamily:"DM Mono", fontSize:11, minWidth:20 }}>{String(i+1).padStart(2,"0")}</span>
                <span style={{ fontSize:13, color:T.text, lineHeight:1.7 }}>{c}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Questions */}
        <Card title="Questions to Ask Your Client" style={{ marginBottom:14 }}>
          {r.questionsToAsk?.map((q,i)=>(
            <div key={i} style={{ display:"flex", gap:12, padding:"8px 0", borderBottom: i<r.questionsToAsk.length-1?`1px solid ${T.border}`:"none" }}>
              <span style={{ color:T.accent, fontFamily:"DM Mono", fontSize:11, minWidth:20 }}>{String(i+1).padStart(2,"0")}</span>
              <span style={{ fontSize:13, color:T.textSoft, lineHeight:1.7 }}>{q}</span>
            </div>
          ))}
        </Card>

        {/* Red flags */}
        {r.redFlags?.length > 0 && (
          <Card title="Red Flags" style={{ marginBottom:14, borderColor:T.red+"44" }}>
            {r.redFlags.map((f,i)=>(
              <div key={i} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom:i<r.redFlags.length-1?`1px solid ${T.border}`:"none" }}>
                <span style={{ color:T.red, fontSize:13 }}>⚠</span>
                <span style={{ fontSize:13, lineHeight:1.7 }}>{f}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Budget + Timeframe */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14, marginBottom:24 }}>
                  <Card title="Budget Estimate">
            <div style={{ fontSize:28, fontWeight:800, marginBottom:4 }}>
              ${r.budgetRange?.min?.toLocaleString()}
              <span style={{ fontSize:16, color:T.textMuted }}> – ${r.budgetRange?.max?.toLocaleString()}</span>
            </div>
            <div style={{ fontSize:11, color:T.accent, fontFamily:"DM Mono", marginBottom:10 }}>{r.budgetRange?.currency} · {r.budgetRange?.rationale}</div>
            {r.budgetRange?.breakdown?.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:4 }}>
                <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:4 }}>ROLE BREAKDOWN</div>
                {r.budgetRange.breakdown.map((b,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, background:T.surface, borderRadius:8, padding:"8px 12px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:T.text, flex:1 }}>{b.role}</div>
                    <div style={{ fontSize:12, fontWeight:800, color:T.accent, fontFamily:"DM Mono" }}>${(b.amount||0).toLocaleString()}</div>
                    <div style={{ fontSize:10, color:T.textMuted, maxWidth:140, textAlign:"right", lineHeight:1.4 }}>{b.note}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Timeframe Estimate">
            <div style={{ fontSize:28, fontWeight:800, marginBottom:14 }}>
              {r.timeframe?.weeks} <span style={{ fontSize:14, color:T.textMuted, fontWeight:400 }}>weeks</span>
            </div>
            {r.timeframe?.breakdown?.map((p,i)=>(
              <div key={i} style={{ marginBottom:10, paddingBottom:10, borderBottom: i<(r.timeframe.breakdown.length-1)?"1px solid "+T.border:"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <span style={{ fontSize:12, fontWeight:700 }}>{p.phase}</span>
                  <span style={{ fontSize:11, color:T.accent, fontFamily:"DM Mono" }}>{p.duration}</span>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                  {(p.tasks||[]).map((t,j)=>{
                    const name = typeof t==="object" ? t.name : t;
                    const days = typeof t==="object" ? t.days : null;
                    return (
                      <div key={j} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:11, color:T.textMuted }}>· {name}</span>
                        {days && <span style={{ fontSize:10, fontFamily:"DM Mono", color:T.textMuted }}>{days}d</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>
        </div>

        {/* Product Roadmap */}
        {r.timeframe?.breakdown?.length > 0 && (
          <Card title="Product Roadmap" style={{ marginBottom:14 }}>
            {/* Phase colour bar */}
            <div style={{ display:"flex", gap:3, marginBottom:24, height:5, borderRadius:3, overflow:"hidden" }}>
              {r.timeframe.breakdown.map((phase,i)=>{
                const phaseColors=[T.blue,T.purple,T.accent,T.green,T.teal,T.amber];
                const totalDays = r.timeframe.breakdown.reduce((sum,p)=>{
                  return sum + (p.tasks||[]).reduce((s,t)=>s+(typeof t==="object"?t.days||1:1),0);
                },0);
                const phaseDays = (phase.tasks||[]).reduce((s,t)=>s+(typeof t==="object"?t.days||1:1),0);
                return <div key={i} style={{ flex:phaseDays||1, background:phaseColors[i%phaseColors.length], opacity:.9 }} />;
              })}
            </div>
            {/* Phases */}
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              {r.timeframe.breakdown.map((phase,i)=>{
                const phaseColors=[T.blue,T.purple,T.accent,T.green,T.teal,T.amber];
                const col=phaseColors[i%phaseColors.length];
                const isLast=i===r.timeframe.breakdown.length-1;
                const phaseDays=(phase.tasks||[]).reduce((s,t)=>s+(typeof t==="object"?t.days||1:1),0);
                return (
                  <div key={i} style={{ display:"flex", gap:0, position:"relative" }}>
                    {/* Left spine */}
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:40, flexShrink:0 }}>
                      <div style={{ width:30, height:30, borderRadius:"50%", background:col+"22", border:"2px solid "+col, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"DM Mono", fontWeight:800, fontSize:12, color:col, zIndex:1, flexShrink:0 }}>{i+1}</div>
                      {!isLast && <div style={{ width:2, flex:1, background:"linear-gradient(to bottom,"+col+"55,"+phaseColors[(i+1)%phaseColors.length]+"33)", minHeight:16 }} />}
                    </div>
                    {/* Phase content */}
                    <div style={{ flex:1, paddingLeft:14, paddingBottom:isLast?0:24, paddingTop:4 }}>
                      {/* Phase header */}
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                        <div style={{ fontWeight:800, fontSize:14, color:T.text }}>{phase.phase}</div>
                        <div style={{ fontSize:10, fontFamily:"DM Mono", color:col, background:col+"18", border:"1px solid "+col+"33", borderRadius:5, padding:"2px 9px", fontWeight:700 }}>{phase.duration}</div>
                        <div style={{ fontSize:10, fontFamily:"DM Mono", color:T.textMuted, marginLeft:"auto" }}>{phaseDays}d total</div>
                      </div>
                      {/* Task rows */}
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {(phase.tasks||[]).map((task,j)=>{
                          const taskName = typeof task==="object" ? task.name : task;
                          const taskDays = typeof task==="object" ? task.days : null;
                          const totalPhaseDays = (phase.tasks||[]).reduce((s,t)=>s+(typeof t==="object"?t.days||1:1),0);
                          const pct = taskDays ? Math.round((taskDays/totalPhaseDays)*100) : null;
                          return (
                            <div key={j} style={{ background:T.surface, border:"1px solid "+T.border, borderRadius:9, padding:"10px 14px", transition:"border-color .15s" }}
                              onMouseEnter={e=>e.currentTarget.style.borderColor=col+"55"}
                              onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}
                            >
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: pct?6:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  <div style={{ width:6, height:6, borderRadius:"50%", background:col, flexShrink:0 }} />
                                  <span style={{ fontSize:12, color:T.text, fontWeight:500 }}>{taskName}</span>
                                </div>
                                {taskDays && (
                                  <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                                    <span style={{ fontSize:10, fontFamily:"DM Mono", color:col, background:col+"18", borderRadius:4, padding:"2px 8px", fontWeight:700 }}>
                                      {taskDays === 1 ? "1 day" : taskDays < 5 ? taskDays+" days" : Math.ceil(taskDays/5)+"wk"}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {pct && (
                                <div style={{ height:2, background:T.border, borderRadius:1, overflow:"hidden", marginLeft:14 }}>
                                  <div style={{ height:"100%", width:pct+"%", background:col, borderRadius:1, opacity:.7 }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Roles Needed */}
        {r.rolesNeeded?.length > 0 && (
          <Card title="Roles Needed" style={{ marginBottom:14 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {r.rolesNeeded.map((role, i) => {
                const meta = ROLE_META[role] || { color: T.textSoft, icon: "◈" };
                return (
                  <div key={i} style={{
                    display:"flex", alignItems:"center", gap:14,
                    background:T.surface, border:`1px solid ${meta.color}33`,
                    borderRadius:10, padding:"10px 14px",
                  }}>
                    <div style={{
                      width:32, height:32, background:meta.color+"18",
                      border:`1px solid ${meta.color}44`, borderRadius:8,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:14, color:meta.color, flexShrink:0,
                    }}>{meta.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:meta.color }}>{role}</div>
                      <div style={{ fontSize:11, color:T.textMuted, marginTop:2 }}>{getRoleDesc(role)}</div>
                    </div>
                    <div style={{ fontSize:9, fontFamily:"DM Mono", color:meta.color, background:meta.color+"18", borderRadius:4, padding:"3px 8px" }}>NEEDED</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Tech Stack */}
        {r.techStack && (
          <Card title="Tech Stack" style={{ marginBottom:14 }}>
            {[
              ["Frontend", r.techStack.frontend, T.blue],
              ["Backend", r.techStack.backend, T.green],
              ["Database", r.techStack.database, T.purple],
              ["DevOps", r.techStack.devops, T.amber],
              ["Design Tools", r.techStack.design, T.pink],
              ["Third-Party", r.techStack.thirdParty, T.teal],
            ].filter(([,arr])=>arr&&arr.length>0).map(([label,arr,color])=>(
              <div key={label} style={{ marginBottom:16 }}>
                <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:8, letterSpacing:"0.06em" }}>{label.toUpperCase()}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {arr.map((item,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, background:T.surface, borderRadius:9, padding:"9px 14px", border:"1px solid "+color+"22" }}>
                      <div style={{ background:color+"22", border:"1px solid "+color+"44", borderRadius:6, padding:"3px 9px", fontSize:11, fontFamily:"DM Mono", color:color, flexShrink:0, fontWeight:600 }}>{item.name}</div>
                      <div style={{ fontSize:12, color:T.textSoft, lineHeight:1.6 }}>{item.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}

        {/* Features */}
        {r.features&&r.features.length>0 && (
          <Card title="Feature Analysis" style={{ marginBottom:14 }}>
            {["MUST HAVE","SHOULD HAVE","NICE TO HAVE"].map(priority=>{
              const items = r.features.filter(f=>f.priority===priority);
              if (!items.length) return null;
              const pColor = priority==="MUST HAVE"?T.red:priority==="SHOULD HAVE"?T.amber:T.textMuted;
              return (
                <div key={priority} style={{ marginBottom:20 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:pColor }} />
                    <div style={{ fontSize:10, color:pColor, fontFamily:"DM Mono", fontWeight:700, letterSpacing:"0.06em" }}>{priority}</div>
                    <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono" }}>({items.length})</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {items.map((f,i)=>(
                      <div key={i} style={{ background:T.surface, borderRadius:10, padding:"14px 16px", border:"1px solid "+pColor+"22" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                          <div style={{ fontWeight:700, fontSize:13 }}>{f.name}</div>
                          <div style={{ display:"flex", gap:6 }}>
                            <span style={{ fontSize:9, fontFamily:"DM Mono", color:pColor, background:pColor+"18", borderRadius:4, padding:"2px 7px" }}>{f.priority}</span>
                            <span style={{ fontSize:9, fontFamily:"DM Mono", color:T.textMuted, background:T.card, borderRadius:4, padding:"2px 7px", border:"1px solid "+T.border }}>{f.complexity}</span>
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:T.textSoft, lineHeight:1.7, marginBottom:6 }}>{f.description}</div>
                        <div style={{ fontSize:11, color:T.accent, fontFamily:"DM Mono" }}>\u21b3 {f.userValue}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {/* User Flow */}
        {r.userFlow&&r.userFlow.length>0 && (
          <Card title="User Flow" style={{ marginBottom:14 }}>
            <div style={{ position:"relative" }}>
              <div style={{ position:"absolute", left:19, top:20, bottom:20, width:1, background:"linear-gradient(to bottom, "+T.accent+"66, "+T.accent+"11)" }} />
              <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                {r.userFlow.map((step,i)=>(
                  <div key={i} style={{ display:"flex", gap:16, paddingBottom:i<r.userFlow.length-1?20:0, position:"relative" }}>
                    <div style={{ width:38, height:38, borderRadius:"50%", background:T.accent, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"DM Mono", fontWeight:700, fontSize:13, color:T.bg, flexShrink:0, zIndex:1, border:"3px solid "+T.bg }}>{step.step}</div>
                    <div style={{ flex:1, paddingTop:6 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                        <div style={{ fontWeight:700, fontSize:13 }}>{step.screen}</div>
                        <div style={{ fontSize:10, fontFamily:"DM Mono", color:T.textMuted, background:T.surface, borderRadius:4, padding:"2px 8px", border:"1px solid "+T.border }}>Step {step.step}</div>
                      </div>
                      <div style={{ fontSize:12, color:T.textSoft, lineHeight:1.7, marginBottom:4 }}><span style={{ color:T.text, fontWeight:600 }}>Action:</span> {step.action}</div>
                      <div style={{ fontSize:12, color:T.textSoft, lineHeight:1.7, marginBottom:step.branch?6:0 }}><span style={{ color:T.green, fontWeight:600 }}>Outcome:</span> {step.outcome}</div>
                      {step.branch && <div style={{ fontSize:11, color:T.amber, fontFamily:"DM Mono", background:T.amber+"0D", borderRadius:6, padding:"4px 10px", border:"1px solid "+T.amber+"22", display:"inline-block" }}>\u2940 {step.branch}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Inspirations — on-demand */}
        <Card title="Design Inspirations" style={{ marginBottom:14 }}>
          {inspirations.length === 0 && !loadingInspirations && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"20px 0" }}>
              <div style={{ fontSize:13, color:T.textSoft, textAlign:"center", lineHeight:1.7 }}>
                Search for real websites and apps that match this project's style and industry.
              </div>
              <button onClick={()=>fetchInspirations(r.projectTitle, r.toneWords, r.moodboardKeywords)} style={{
                background:T.accent, border:"none", borderRadius:9, padding:"10px 24px",
                color:T.bg, fontFamily:"Syne", fontWeight:700, fontSize:13, cursor:"pointer",
                display:"flex", alignItems:"center", gap:8,
              }}>
                Search for Inspirations
              </button>
            </div>
          )}
          {loadingInspirations && (
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"20px 0", justifyContent:"center" }}>
              <div style={{ width:18, height:18, border:"2px solid "+T.border, borderTopColor:T.accent, borderRadius:"50%", animation:"spin .7s linear infinite" }} />
              <span style={{ fontSize:12, color:T.textSoft, fontFamily:"DM Mono" }}>Searching the web for inspirations...</span>
            </div>
          )}
          {inspirations.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {inspirations.map((ins,i)=>{
                const catColor = {"UI Reference":T.blue,"Competitor":T.red,"Design System":T.purple,"Motion":T.pink,"Branding":T.accent}[ins.category]||T.textSoft;
                return (
                  <a key={i} href={ins.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:14, background:T.surface, borderRadius:10, padding:"12px 16px", border:"1px solid "+T.border, transition:"all .2s", cursor:"pointer" }}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor=catColor+"66"; e.currentTarget.style.background=T.cardHover; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.surface; }}
                    >
                      <div style={{ width:36, height:36, background:catColor+"18", border:"1px solid "+catColor+"33", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" }}>
                        <img src={"https://www.google.com/s2/favicons?domain="+ins.url+"&sz=32"} alt="" style={{ width:20, height:20 }} onError={e=>{e.target.style.display="none";}} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:T.text }}>{ins.name}</div>
                          <div style={{ fontSize:9, fontFamily:"DM Mono", color:catColor, background:catColor+"18", borderRadius:4, padding:"2px 7px", flexShrink:0 }}>{ins.category}</div>
                        </div>
                        <div style={{ fontSize:11, color:T.textSoft, lineHeight:1.6 }}>{ins.why}</div>
                        <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ins.url}</div>
                      </div>
                      <div style={{ color:T.textMuted, fontSize:14, flexShrink:0 }}>\u2197</div>
                    </div>
                  </a>
                );
              })}
              <button onClick={()=>{ setInspirations([]); }} style={{ background:"transparent", border:"1px solid "+T.border, borderRadius:8, padding:"6px 14px", color:T.textMuted, fontFamily:"Syne", fontSize:11, cursor:"pointer", alignSelf:"flex-start", marginTop:4 }}>
                ↺ Search Again
              </button>
            </div>
          )}
        </Card>

        <div style={{ display:"flex", gap:10, paddingBottom:40 }}>
          <Btn onClick={()=>{ setBriefText(""); setProjectName(""); setFileName(null); setPhase("input"); setResult(null); setScoring(null); }}>← New Brief</Btn>
          <Btn primary onClick={downloadBrief}>⬇ Download Brief</Btn>
        </div>
      </div>
    </div>
  );
}

function getRoleDesc(role) {
  const map = {
    "UI Designer": "Visual design, components, design system, Figma files",
    "UX Designer": "User research, wireframes, flows, usability testing",
    "Frontend Dev": "HTML/CSS/JS, React, animations, responsive build",
    "Backend Dev": "APIs, databases, authentication, server logic",
    "Brand Strategist": "Brand positioning, tone of voice, messaging framework",
    "Motion Designer": "Animations, transitions, video, micro-interactions",
    "Copywriter": "Headlines, body copy, CTAs, tone alignment",
    "Project Manager": "Timelines, stakeholder comms, sprint planning",
  };
  return map[role] || "Specialist role required for this project";
}

/* ═══════════════════════════════════════════════
   TEAM VIEW
═══════════════════════════════════════════════ */
function TeamView({ existing, saveHistory, showToast, isMobile }) {
  const [messages, setMessages] = useState(existing?.data?.messages || [
    { role:"ai", text:"Welcome to Team Collab. Paste a project brief, describe your project, or upload a document — and I'll help you build your team and generate a task board.", id:uid() }
  ]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState(existing?.data?.phase || "brief"); // brief | roles | kanban
  const [briefText, setBriefText] = useState(existing?.data?.briefText || "");
  const [teamMembers, setTeamMembers] = useState(existing?.data?.teamMembers || []);
  const [suggestedRoles, setSuggestedRoles] = useState([]);
  const [kanban, setKanban] = useState(existing?.data?.kanban || null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [projectTitle, setProjectTitle] = useState(existing?.title || "");
  const [missingRoles, setMissingRoles] = useState([]);
  const [editingTask, setEditingTask] = useState(null); // task being viewed/edited
  const [conversationHistory, setConversationHistory] = useState([]);
  const [addingTaskCol, setAddingTaskCol] = useState(null); // which column's inline form is open
  const [showAddTaskModal, setShowAddTaskModal] = useState(false); // top-right "Add Task" modal
  const [newTask, setNewTask] = useState({ title:"", description:"", assignedRole:"", assignedName:"", priority:"MEDIUM", estimatedDays:1, column:"To Do" });
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const chatEndRef = useRef();
  const fileRef = useRef();

  const ROLES = Object.keys(ROLE_META);
  const KANBAN_COLS = ["To Do","In Progress","Review","Done"];
  const COL_ACCENT = { "To Do":T.textMuted, "In Progress":T.blue, "Review":T.amber, "Done":T.green };

  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,loading]);

  function addMsg(role, text) {
    setMessages(prev=>[...prev,{role,text,id:uid()}]);
  }

  async function handleFile(f) {
    setFileName(f.name);
    const txt = await readFileAsText(f);
    setInput(prev => prev + (prev ? "\n" : "") + txt);
  }

  async function handleSend() {
    const txt = input.trim();
    if (!txt || loading) return;
    setInput("");
    addMsg("user", txt);

    if (phase === "brief") {
      setBriefText(txt);
      setLoading(true);

      // Check if chaotic
      const analysis = await callJSON(
        "You are a design team strategist. Respond ONLY with raw JSON.",
        `Analyse this brief and suggest team roles.
Brief: """${txt}"""
Return JSON:
{
  "isChaos":boolean,
  "chaosNote":"if chaotic, brief note why and how to proceed",
  "projectTitle":"inferred title",
  "suggestedRoles":["role1","role2",...],
  "roleReasoning":"why these roles are needed"
}
Roles must be from: ${ROLES.join(", ")}`
      );

      setLoading(false);
      if (analysis) {
        setProjectTitle(analysis.projectTitle || "Team Project");
        setSuggestedRoles(analysis.suggestedRoles || []);
        const rolesItemized = (analysis.suggestedRoles||[]).map(r => {
          const meta = ROLE_META[r];
          return (meta?.icon||"◈") + " **" + r + "** — " + getRoleDesc(r);
        }).join("\n");
        let reply = analysis.isChaos
          ? "⚡ This brief is a bit chaotic — " + analysis.chaosNote + "\n\nI've extracted what I can. Here are the roles you'll likely need:\n\n" + rolesItemized + "\n\n" + analysis.roleReasoning + "\n\nSelect your team members below."
          : "Got it. For **" + analysis.projectTitle + "**, here are the recommended roles:\n\n" + rolesItemized + "\n\n" + analysis.roleReasoning + "\n\nSelect roles and add names below.";
        addMsg("ai", reply);
        setConversationHistory([
          { role:"user", content: txt },
          { role:"assistant", content: reply },
        ]);
        setPhase("roles");
      }
    } else if (phase === "kanban") {
      setLoading(true);
      const taskSummary = (kanban?.tasks||[]).map(t =>
        "[" + t.column + "] " + t.title + " — " + t.assignedRole + " (" + t.priority + ")"
      ).join("\n");

      const boardUpdateDocs = [
        "add_task: BOARD_UPDATE:{action:add_task,task:{id:t-new,title:...,description:...,assignedRole:...,assignedName:...,priority:MEDIUM,estimatedDays:2,column:To Do}}",
        "move: BOARD_UPDATE:{action:move,taskId:...,column:In Progress}",
        "priority: BOARD_UPDATE:{action:priority,taskId:...,priority:HIGH}",
        "reassign: BOARD_UPDATE:{action:reassign,taskId:...,assignedRole:...,assignedName:...}",
      ].join(" | ");

      const systemPrompt = [
        "You are a project management assistant for: " + projectTitle + ".",
        "Team: " + teamMembers.map(m => (m.name||m.role) + " (" + m.role + ")").join(", ") + ".",
        "The board has " + (kanban?.tasks?.length||0) + " tasks.",
        "Help the user with questions, adding tasks, changing priorities, reassigning, or anything about the project.",
        "If the user requests a board change, append exactly one BOARD_UPDATE line at the very end of your reply.",
        "Use valid JSON in the BOARD_UPDATE. Supported actions: " + boardUpdateDocs,
        "To add MULTIPLE tasks at once use: BOARD_UPDATE:{\"action\":\"add_tasks\",\"tasks\":[{task1},{task2},...]}",
        "IMPORTANT: use double quotes in the BOARD_UPDATE JSON. Only add a BOARD_UPDATE when the user explicitly asks for a board change. Otherwise just reply conversationally.",
      ].join(" ");

      const historyToSend = [
        ...conversationHistory.slice(-8),
        { role:"user", content: "Board state:\n" + taskSummary + "\n\nUser says: " + txt }
      ];

      let displayReply = "Sorry, I couldn't process that.";
      try {
        const res = await fetch("http://localhost:3001/api/chat", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({
            message: historyToSend[historyToSend.length - 1]?.content || "",
            system: systemPrompt,
            maxTokens: 1200,
          })
        });
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || `API error: ${res.status}`);
        }
        const data = await res.json();
        const rawReply = data.message || "I couldn't process that.";

        const updateMatch = rawReply.match(/BOARD_UPDATE:(\{[\s\S]*?\})\s*$/m);
        displayReply = rawReply.replace(/BOARD_UPDATE:\{[\s\S]*?\}\s*$/m, "").trim();

        if (updateMatch) {
          try {
            const upd = JSON.parse(updateMatch[1]);
            setKanban(prev => {
              if (!prev) return prev;
              let tasks = [...prev.tasks];
              // add_task (single)
              if (upd.action === "add_task" && upd.task) {
                const t = { ...upd.task, id: upd.task.id || uid() };
                return { ...prev, tasks: [...tasks, t] };
              }
              // add_tasks (multiple)
              if (upd.action === "add_tasks" && Array.isArray(upd.tasks)) {
                const newTasks = upd.tasks.map(t => ({ ...t, id: t.id || uid() }));
                return { ...prev, tasks: [...tasks, ...newTasks] };
              }
              if (upd.action === "move") {
                return { ...prev, tasks: tasks.map(t => t.id===upd.taskId ? {...t,column:upd.column} : t) };
              }
              if (upd.action === "priority") {
                return { ...prev, tasks: tasks.map(t => t.id===upd.taskId ? {...t,priority:upd.priority} : t) };
              }
              if (upd.action === "reassign") {
                return { ...prev, tasks: tasks.map(t => t.id===upd.taskId ? {...t,assignedRole:upd.assignedRole,assignedName:upd.assignedName||""} : t) };
              }
              return prev;
            });
          } catch(e) { /* ignore */ }
        }
      } catch(e) {
        displayReply = "Something went wrong. Please try again.";
      }

      setLoading(false);
      addMsg("ai", displayReply);
      setConversationHistory(prev => [
        ...prev,
        { role:"user", content: txt },
        { role:"assistant", content: displayReply },
      ]);
    }
  }

  function toggleRole(role) {
    setTeamMembers(prev=>{
      const exists = prev.find(m=>m.role===role);
      if (exists) return prev.filter(m=>m.role!==role);
      const added = [...prev,{id:uid(),role,name:""}];
      // If kanban exists, move any unassigned tasks for this role onto the board
      if (kanban) {
        setKanban(kb => {
          if (!kb) return kb;
          const unassigned = (kb.unassignedTasks||[]).filter(u => u.suggestedRole === role);
          if (!unassigned.length) return kb;
          const newTasks = unassigned.map(u => ({
            id: uid(),
            title: u.title,
            description: u.reason || "Previously unassigned — now assigned to " + role,
            assignedRole: role,
            assignedName: "",
            priority: "MEDIUM",
            estimatedDays: 2,
            column: "To Do",
          }));
          return {
            ...kb,
            tasks: [...kb.tasks, ...newTasks],
            unassignedTasks: (kb.unassignedTasks||[]).filter(u => u.suggestedRole !== role),
            missingRoles: (kb.missingRoles||[]).filter(r => r !== role),
          };
        });
        setMissingRoles(prev => prev.filter(r => r !== role));
      }
      return added;
    });
  }

  function updateName(id, name) {
    setTeamMembers(prev=>prev.map(m=>m.id===id?{...m,name}:m));
  }

  async function generateKanban() {
    if (!teamMembers.length) return;
    setLoading(true);
    addMsg("ai","Building your kanban board and assigning tasks to your team...");

    const roles = teamMembers.map(m=>`${m.role}${m.name?` (${m.name})`:""}`).join(", ");
    const roleList = teamMembers.map(m=>m.role);

    const raw = await callClaude(
      "You are a meticulous project manager. You MUST respond with ONLY a valid JSON object. No explanation, no markdown, no code fences. Start your response with { and end with }.",
      `Create a detailed kanban board for this project.
Project: ${projectTitle}
Brief: """${briefText}"""
Team roles available: ${roles}

CRITICAL RULES:
- Every task's "assignedRole" MUST exactly match one of these roles: ${roleList.join(", ")}
- All tasks start in column "To Do"
- Generate 8-14 tasks spread across the team

Return this exact JSON structure:
{
  "projectTimeline": "X weeks total",
  "tasks": [
    {
      "id": "t1",
      "title": "specific task title",
      "description": "what this task involves in one sentence",
      "assignedRole": "MUST be exact role from team list above",
      "assignedName": "name or empty string",
      "priority": "HIGH",
      "estimatedDays": 3,
      "column": "To Do"
    }
  ],
  "unassignedTasks": [
    {
      "title": "task needing missing role",
      "suggestedRole": "role not on team"
    }
  ],
  "missingRoles": []
}`,
      3500
    );

    let data = null;
    try {
      // Strip any accidental markdown or leading text
      const cleaned = raw.replace(/^[\s\S]*?(\{)/, "{").replace(/\}[\s\S]*$/, "}").trim();
      data = JSON.parse(cleaned);
    } catch(e) {
      // Second attempt: find JSON block
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { data = JSON.parse(match[0]); } catch {}
      }
    }

    setLoading(false);

    if (data && Array.isArray(data.tasks) && data.tasks.length > 0) {
      // Sanitise: ensure all tasks have proper IDs and valid columns
      const validCols = ["To Do","In Progress","Review","Done"];
      const tasks = data.tasks.map((t,i) => ({
        ...t,
        id: t.id || `task-${i}-${uid()}`,
        column: validCols.includes(t.column) ? t.column : "To Do",
        assignedName: t.assignedName || "",
      }));

      const kanbanData = { ...data, tasks };
      setKanban(kanbanData);
      setMissingRoles(data.missingRoles || []);
      setPhase("kanban");

      const missing = data.missingRoles?.length || 0;
      const unassigned = data.unassignedTasks?.length || 0;
      addMsg("ai",
        `✅ Kanban board ready — **${tasks.length} tasks** assigned across your team. Estimated total: **${data.projectTimeline}**.\n\nBoard is live — drag cards between columns or click any task to edit. Keep chatting here to add tasks, change priorities, reassign work, or ask anything about the project.` +
        (missing ? `\n\n⚠ **${missing} role(s) missing**: **${data.missingRoles.join(", ")}**. ${unassigned} task(s) couldn't be assigned.` : "")
      );

      setConversationHistory(prev => [
        ...prev,
        { role:"assistant", content: "Kanban generated for " + (projectTitle||"project") + " with " + tasks.length + " tasks." },
      ]);
      const item = {
        id: uid(), section:"team",
        title: projectTitle || "Team Project",
        ts: new Date().toISOString(),
        data: { messages:[...messages], phase:"kanban", briefText, teamMembers, kanban: kanbanData, suggestedRoles },
      };
      saveHistory(item);
    } else {
      addMsg("ai", "⚠ I had trouble generating the board. Please try again — sometimes a retry works.");
      setPhase("roles");
    }
  }

  function addTaskToBoard(task) {
    const t = { ...task, id: uid(), column: task.column || "To Do" };
    setKanban(prev => ({ ...prev, tasks: [...(prev.tasks||[]), t] }));
    // If the role was previously unassigned, clear it from unassignedTasks
    if (t.assignedRole) {
      setKanban(prev => ({
        ...prev,
        unassignedTasks: (prev.unassignedTasks||[]).filter(u => u.suggestedRole !== t.assignedRole),
      }));
    }
  }

  function moveTask(taskId, newCol) {
    setKanban(prev=>({
      ...prev,
      tasks: prev.tasks.map(t=>t.id===taskId?{...t,column:newCol}:t)
    }));
    setEditingTask(prev=>prev?.id===taskId?{...prev,column:newCol}:prev);
  }

  function updateTask(updated) {
    setKanban(prev=>({
      ...prev,
      tasks: prev.tasks.map(t=>t.id===updated.id?updated:t)
    }));
    setEditingTask(updated);
  }

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden", position:"relative", flexDirection: isMobile ? "column" : "row" }}>
      {/* Task edit modal */}
      {editingTask && (
        <TaskModal
          task={editingTask}
          kanbanCols={KANBAN_COLS}
          teamMembers={teamMembers}
          onUpdate={updateTask}
          onMove={moveTask}
          onClose={()=>setEditingTask(null)}
        />
      )}
      {showAddTaskModal && (
        <AddTaskModal
          kanbanCols={KANBAN_COLS}
          teamMembers={teamMembers}
          initial={newTask}
          onAdd={t=>{ addTaskToBoard(t); setShowAddTaskModal(false); }}
          onClose={()=>setShowAddTaskModal(false)}
        />
      )}

      {/* Chat column */}
      <div style={{ width: isMobile ? "100%" : (kanban ? 300 : "100%"), height: isMobile ? (kanban ? "40%" : "100%") : "auto", flexShrink:0, display:"flex", flexDirection:"column", borderRight: kanban && !isMobile ? `1px solid ${T.border}` : "none", borderBottom: kanban && isMobile ? `1px solid ${T.border}` : "none", transition:"width .3s ease" }}>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 20px 0" }}>
          {messages.map(m=><ChatBubble key={m.id} msg={m}/>)}
          {loading && <ThinkingBubble/>}
          <div ref={chatEndRef}/>
        </div>

        {/* Role selector */}
        {phase === "roles" && (
          <div style={{ padding:"14px 16px", borderTop:`1px solid ${T.border}`, background:T.surface }}>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:10 }}>SELECT ROLES & ADD NAMES</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
              {ROLES.map(role=>{
                const m = ROLE_META[role];
                const selected = teamMembers.find(t=>t.role===role);
                const isSuggested = suggestedRoles.includes(role);
                return (
                  <button key={role} onClick={()=>toggleRole(role)} style={{
                    background: selected?m.color+"22":isSuggested?T.surface:"transparent",
                    border:`1px solid ${selected?m.color:isSuggested?m.color+"55":T.border}`,
                    borderRadius:7, padding:"5px 10px", color: selected?m.color:isSuggested?m.color+"BB":T.textSoft,
                    fontSize:11, fontFamily:"Syne", fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5,
                  }}>
                    <span>{m.icon}</span>{role}
                    {isSuggested && !selected && <span style={{fontSize:8,color:m.color,opacity:.7}}>✦</span>}
                  </button>
                );
              })}
            </div>

            {/* Name inputs */}
            {teamMembers.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
                {teamMembers.map(m=>{
                  const meta = ROLE_META[m.role];
                  return (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:6, background:T.card, border:`1px solid ${meta.color}44`, borderRadius:7, padding:"5px 10px" }}>
                      <span style={{fontSize:11}}>{meta.icon}</span>
                      <input placeholder={m.role} value={m.name} onChange={e=>updateName(m.id,e.target.value)}
                        style={{ background:"transparent", border:"none", color:T.text, fontFamily:"Syne", fontSize:11, width:110 }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {teamMembers.length > 0 && (
              <Btn primary onClick={generateKanban} disabled={loading} full>
                Generate Kanban Board →
              </Btn>
            )}
          </div>
        )}

        {/* Input area */}
        {(phase === "brief" || phase === "kanban" || phase === "roles") && (
          <div style={{ padding:"12px 16px", borderTop:`1px solid ${T.border}`, minHeight:76, display:"flex", flexDirection:"column", justifyContent:"center" }}>
            {fileName && (
              <div style={{ display:"flex", alignItems:"center", gap:8, background:T.accentBg, border:`1px solid ${T.accent}33`, borderRadius:7, padding:"6px 10px", marginBottom:8, fontSize:11, fontFamily:"DM Mono", color:T.accent }}>
                📄 {fileName}
                <span onClick={()=>{setFileName(null);}} style={{marginLeft:"auto",cursor:"pointer",color:T.textMuted}}>×</span>
              </div>
            )}
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <button onClick={()=>fileRef.current.click()} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, width:36, height:36, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:T.textSoft, flexShrink:0 }}>📎</button>
              <input ref={fileRef} type="file" accept=".txt,.pdf,.doc,.docx,.md" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />
              <textarea
                value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),handleSend())}
                placeholder={phase==="brief"?"Paste brief or describe the project...":"Ask a follow-up..."}
                style={{ flex:1, background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:"9px 12px", color:T.text, fontFamily:"DM Mono", fontSize:12, resize:"none", lineHeight:1.6, maxHeight:100, minHeight:36 }}
                onFocus={e=>e.target.style.borderColor=T.accent+"66"}
                onBlur={e=>e.target.style.borderColor=T.border}
              />
              <button onClick={handleSend} disabled={!input.trim()||loading} style={{ background:T.accent, border:"none", borderRadius:8, width:36, height:36, color:T.bg, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, opacity:!input.trim()||loading?.4:1 }}>↑</button>
            </div>
          </div>
        )}
      </div>

      {/* Kanban panel */}
      {kanban && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>{projectTitle || "Project Board"}</div>
              <div style={{ fontSize:11, fontFamily:"DM Mono", color:T.textSoft }}>{kanban.tasks?.length} tasks · {kanban.projectTimeline}</div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              {missingRoles.length > 0 && (
                <div style={{ background:T.amber+"18", border:`1px solid ${T.amber}44`, borderRadius:8, padding:"5px 12px", fontSize:11, color:T.amber }}>
                  ⚠ Need: {missingRoles.join(", ")}
                </div>
              )}
              <button onClick={()=>{ setNewTask({ title:"", description:"", assignedRole:"", assignedName:"", priority:"MEDIUM", estimatedDays:1, column:"To Do" }); setShowAddTaskModal(true); }} style={{
                background:T.accent, border:"none", borderRadius:8, padding:"7px 14px",
                color:T.bg, fontSize:12, fontFamily:"Syne", fontWeight:700, cursor:"pointer",
                display:"flex", alignItems:"center", gap:6,
              }}>+ Add Task</button>
            </div>
          </div>

          {/* Board */}
          <div style={{ flex:1, overflowX:"auto", overflowY:"auto", padding:"20px" }}>
            <div style={{ display:"flex", minWidth:"max-content", minHeight:"100%", gap:0 }}>
              {KANBAN_COLS.map((col,colIdx)=>{
                const colTasks = (kanban.tasks||[]).filter(t=>t.column===col);
                const isDropTarget = dragOverCol === col && draggedTaskId !== null;
                const accentCol = COL_ACCENT[col] || T.textMuted;
                return (
                  <React.Fragment key={col}>
                    {colIdx > 0 && <div style={{ width:1, background:`linear-gradient(to bottom, transparent, ${T.border}, transparent)`, flexShrink:0, alignSelf:"stretch", margin:"0 4px" }} />}
                    <div
                      style={{ width: isMobile ? 200 : 280, flexShrink:0, padding:"0 12px", borderRadius:12, transition:"background .15s",
                        background: isDropTarget ? accentCol+"0D" : "transparent",
                        outline: isDropTarget ? `2px dashed ${accentCol}66` : "2px dashed transparent",
                        outlineOffset: -2,
                      }}
                      onDragOver={e=>{ e.preventDefault(); e.dataTransfer.dropEffect="move"; setDragOverCol(col); }}
                      onDragLeave={e=>{ if(!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null); }}
                      onDrop={e=>{
                        e.preventDefault();
                        const id = e.dataTransfer.getData("taskId");
                        if(id && col) { moveTask(id, col); }
                        setDragOverCol(null);
                        setDraggedTaskId(null);
                      }}
                    >
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:accentCol }} />
                        <span style={{ fontWeight:700, fontSize:12 }}>{col}</span>
                        <span style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginLeft:"auto" }}>{colTasks.length}</span>
                        {isDropTarget && <span style={{ fontSize:9, color:accentCol, fontFamily:"DM Mono", animation:"pulse 1s ease infinite" }}>DROP HERE</span>}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10, minHeight:60 }}>
                        {colTasks.map(task=>{
                          const meta = ROLE_META[task.assignedRole];
                          const roleColor = meta?.color || T.textMuted;
                          const isDragging = draggedTaskId === task.id;
                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={e=>{
                                e.dataTransfer.setData("taskId", task.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDraggedTaskId(task.id);
                                // slight delay so the ghost image renders before opacity change
                                setTimeout(()=>{ e.target.style.opacity="0.35"; }, 0);
                              }}
                              onDragEnd={e=>{
                                e.target.style.opacity="1";
                                setDraggedTaskId(null);
                                setDragOverCol(null);
                              }}
                              onClick={()=>{ if(!isDragging) setEditingTask(task); }}
                              style={{
                                background: isDragging ? T.cardHover : T.card,
                                border:`1px solid ${isDragging ? roleColor+"88" : T.border}`,
                                borderRadius:12, padding:14,
                                transition:"border-color .15s, background .15s, transform .15s, opacity .15s",
                                cursor:"grab",
                                opacity: isDragging ? 0.35 : 1,
                                transform: isDragging ? "scale(0.97)" : "scale(1)",
                                userSelect:"none",
                              }}
                              onMouseEnter={e=>{ if(!isDragging){ e.currentTarget.style.borderColor=roleColor+"66"; e.currentTarget.style.background=T.cardHover; e.currentTarget.style.transform="translateY(-1px)"; }}}
                              onMouseLeave={e=>{ if(!isDragging){ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background=T.card; e.currentTarget.style.transform="translateY(0)"; }}}
                            >
                              {/* drag handle hint */}
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:7 }}>
                                <div style={{ display:"flex", alignItems:"flex-start", gap:6, flex:1 }}>
                                  <span style={{ color:T.textMuted, fontSize:10, marginTop:2, letterSpacing:"-1px", flexShrink:0, cursor:"grab" }}>⠿</span>
                                  <div style={{ fontSize:12, fontWeight:700, lineHeight:1.4, flex:1, paddingRight:6 }}>{task.title}</div>
                                </div>
                                <div style={{ background:PRIORITY_COLOR[task.priority]+"22", color:PRIORITY_COLOR[task.priority], fontSize:9, fontFamily:"DM Mono", borderRadius:4, padding:"2px 5px", flexShrink:0, height:"fit-content" }}>{task.priority}</div>
                              </div>
                              <div style={{ fontSize:11, color:T.textSoft, lineHeight:1.6, marginBottom:10, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{task.description}</div>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                <div style={{ background:roleColor+"18", border:`1px solid ${roleColor}33`, borderRadius:5, padding:"3px 8px", fontSize:10, color:roleColor, fontFamily:"DM Mono", display:"flex", alignItems:"center", gap:4 }}>
                                  {meta?.icon} {task.assignedName||task.assignedRole}
                                </div>
                                <span style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono" }}>{task.estimatedDays}d</span>
                              </div>
                            </div>
                          );
                        })}
                        {/* Empty column drop zone */}
                        {colTasks.length === 0 && (
                          <div style={{ height:60, border:`1.5px dashed ${isDropTarget ? accentCol+"88" : T.border}`, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s", marginBottom:8 }}>
                            <span style={{ fontSize:11, color: isDropTarget ? accentCol : T.textMuted, fontFamily:"DM Mono" }}>{isDropTarget ? "Drop here" : "Empty"}</span>
                          </div>
                        )}
                        {/* Inline add task for this column */}
                        {addingTaskCol === col ? (
                          <InlineAddTask
                            col={col}
                            teamMembers={teamMembers}
                            onAdd={t=>{ addTaskToBoard({...t,column:col}); setAddingTaskCol(null); }}
                            onCancel={()=>setAddingTaskCol(null)}
                          />
                        ) : (
                          <button onClick={()=>{ setAddingTaskCol(col); }} style={{
                            width:"100%", background:"transparent", border:`1.5px dashed ${T.border}`,
                            borderRadius:10, padding:"9px 0", color:T.textMuted, fontSize:12,
                            cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                            gap:6, transition:"all .2s", fontFamily:"Syne",
                          }}
                            onMouseEnter={e=>{ e.currentTarget.style.borderColor=accentCol+"66"; e.currentTarget.style.color=accentCol; }}
                            onMouseLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.textMuted; }}
                          >
                            <span style={{fontSize:16,lineHeight:1}}>+</span> Add task
                          </button>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Unassigned tasks — fixed height to match chat input bar */}
          <div style={{ height:76, borderTop:`1px solid ${T.border}`, background:T.surface, flexShrink:0, display:"flex", alignItems:"center", padding:"0 20px", overflowX:"auto" }}>
            {kanban.unassignedTasks?.length > 0 ? (
              <div style={{ display:"flex", gap:10, alignItems:"center", minWidth:"max-content" }}>
                <span style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", flexShrink:0, marginRight:4 }}>UNASSIGNED:</span>
                {kanban.unassignedTasks.map((t,i)=>(
                  <div key={i} style={{ background:T.card, border:`1px solid ${T.amber}44`, borderRadius:8, padding:"6px 12px", fontSize:11, flexShrink:0, display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontWeight:600 }}>{t.title}</span>
                    <span style={{ color:T.amber, fontFamily:"DM Mono", fontSize:10 }}>→ Need: {t.suggestedRole}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize:11, color:T.textMuted, fontFamily:"DM Mono" }}>✓ All tasks assigned to team members</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   INLINE ADD TASK (column bottom)
═══════════════════════════════════════════════ */
function InlineAddTask({ col, teamMembers, onAdd, onCancel }) {
  const [title, setTitle] = useState("");
  const [role, setRole] = useState(teamMembers[0]?.role || "");
  const accentCol = { "To Do":T.textMuted, "In Progress":T.blue, "Review":T.amber, "Done":T.green }[col] || T.accent;
  return (
    <div style={{ background:T.card, border:`1.5px solid ${accentCol}66`, borderRadius:10, padding:"12px 14px", animation:"fadeUp .2s ease" }}>
      <div style={{ fontSize:10, color:accentCol, fontFamily:"DM Mono", marginBottom:8, letterSpacing:"0.06em" }}>NEW TASK — {col.toUpperCase()}</div>
      <input autoFocus value={title} onChange={e=>setTitle(e.target.value)}
        onKeyDown={e=>{ if(e.key==="Enter"&&title.trim()) onAdd({title,description:"",assignedRole:role,assignedName:"",priority:"MEDIUM",estimatedDays:1}); if(e.key==="Escape") onCancel(); }}
        placeholder="Task title..."
        style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:"7px 10px", color:T.text, fontFamily:"Syne", fontSize:12, marginBottom:8 }}
      />
      {teamMembers.length > 0 && (
        <select value={role} onChange={e=>setRole(e.target.value)} style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:"6px 10px", color:T.text, fontFamily:"Syne", fontSize:11, marginBottom:10 }}>
          <option value="">Unassigned</option>
          {teamMembers.map(m=><option key={m.id} value={m.role}>{m.name||m.role}</option>)}
        </select>
      )}
      <div style={{ display:"flex", gap:6 }}>
        <button onClick={()=>{ if(title.trim()) onAdd({title,description:"",assignedRole:role,assignedName:"",priority:"MEDIUM",estimatedDays:1}); }} disabled={!title.trim()} style={{ flex:1, background:accentCol, border:"none", borderRadius:7, padding:"7px 0", color:T.bg, fontFamily:"Syne", fontWeight:700, fontSize:11, cursor:"pointer", opacity:!title.trim()?.5:1 }}>Add</button>
        <button onClick={onCancel} style={{ flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:"7px 0", color:T.textSoft, fontFamily:"Syne", fontSize:11, cursor:"pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ADD TASK MODAL (top-right button)
═══════════════════════════════════════════════ */
function AddTaskModal({ kanbanCols, teamMembers, initial, onAdd, onClose }) {
  const [t, setT] = useState({ title:"", description:"", assignedRole:"", assignedName:"", priority:"MEDIUM", estimatedDays:1, column:"To Do", ...initial });
  const meta = ROLE_META[t.assignedRole] || { color:T.textSoft, icon:"◈" };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:18, width:500, maxWidth:"92vw", maxHeight:"88vh", overflow:"auto", boxShadow:"0 24px 80px rgba(0,0,0,.6)", animation:"fadeUp .25s ease" }}>
        <div style={{ padding:"20px 24px 16px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:4, letterSpacing:"0.08em" }}>NEW TASK</div>
            <div style={{ fontWeight:800, fontSize:18, letterSpacing:"-0.02em" }}>Add to Board</div>
          </div>
          <button onClick={onClose} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:T.textSoft, fontSize:16 }}>×</button>
        </div>
        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
          <div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:6 }}>TITLE</div>
            <input autoFocus value={t.title} onChange={e=>setT(p=>({...p,title:e.target.value}))}
              placeholder="What needs to be done?"
              style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:"10px 14px", color:T.text, fontFamily:"Syne", fontSize:13, transition:"border-color .2s" }}
              onFocus={e=>e.target.style.borderColor=T.accent+"66"} onBlur={e=>e.target.style.borderColor=T.border}
            />
          </div>
          <div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:6 }}>DESCRIPTION</div>
            <textarea value={t.description} onChange={e=>setT(p=>({...p,description:e.target.value}))}
              placeholder="Optional details..."
              style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:"10px 14px", color:T.text, fontFamily:"DM Mono", fontSize:12, lineHeight:1.7, resize:"vertical", minHeight:72, transition:"border-color .2s" }}
              onFocus={e=>e.target.style.borderColor=T.accent+"66"} onBlur={e=>e.target.style.borderColor=T.border}
            />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:6 }}>COLUMN</div>
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {kanbanCols.map(col=>{
                  const cc = { "To Do":T.textMuted, "In Progress":T.blue, "Review":T.amber, "Done":T.green }[col];
                  return (
                    <button key={col} onClick={()=>setT(p=>({...p,column:col}))} style={{ background:t.column===col?cc+"22":T.surface, border:`1px solid ${t.column===col?cc:T.border}`, borderRadius:7, padding:"7px 12px", color:t.column===col?cc:T.textSoft, fontFamily:"Syne", fontWeight:600, fontSize:11, cursor:"pointer", textAlign:"left" }}>{col}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:6 }}>PRIORITY</div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {["HIGH","MEDIUM","LOW"].map(p=>(
                    <button key={p} onClick={()=>setT(prev=>({...prev,priority:p}))} style={{ background:t.priority===p?PRIORITY_COLOR[p]+"22":T.surface, border:`1px solid ${t.priority===p?PRIORITY_COLOR[p]:T.border}`, borderRadius:7, padding:"7px 12px", color:t.priority===p?PRIORITY_COLOR[p]:T.textSoft, fontFamily:"Syne", fontWeight:600, fontSize:11, cursor:"pointer", textAlign:"left" }}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:6 }}>EST. DAYS</div>
                <input type="number" min={1} max={90} value={t.estimatedDays} onChange={e=>setT(p=>({...p,estimatedDays:Number(e.target.value)}))}
                  style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:"7px 10px", color:T.text, fontFamily:"DM Mono", fontSize:13, textAlign:"center" }}
                />
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:8 }}>ASSIGN TO</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              <button onClick={()=>setT(p=>({...p,assignedRole:"",assignedName:""}))} style={{ background:!t.assignedRole?T.surface:T.card, border:`1px solid ${!t.assignedRole?T.textSoft:T.border}`, borderRadius:7, padding:"5px 12px", color:!t.assignedRole?T.text:T.textMuted, fontFamily:"Syne", fontSize:11, fontWeight:600, cursor:"pointer" }}>Unassigned</button>
              {teamMembers.map(m=>{
                const mm = ROLE_META[m.role]||{color:T.textSoft,icon:"◈"};
                const active = t.assignedRole===m.role;
                return (
                  <button key={m.id} onClick={()=>setT(p=>({...p,assignedRole:m.role,assignedName:m.name||""}))} style={{ background:active?mm.color+"22":T.card, border:`1px solid ${active?mm.color:T.border}`, borderRadius:7, padding:"5px 12px", display:"flex", alignItems:"center", gap:5, cursor:"pointer" }}>
                    <span style={{fontSize:11}}>{mm.icon}</span>
                    <span style={{ fontSize:11, color:active?mm.color:T.textSoft, fontWeight:600, fontFamily:"Syne" }}>{m.name||m.role}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display:"flex", gap:10, paddingTop:4 }}>
            <button onClick={onClose} style={{ flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:"10px 0", color:T.text, fontFamily:"Syne", fontWeight:700, fontSize:12, cursor:"pointer" }}>Cancel</button>
            <button onClick={()=>{ if(t.title.trim()) onAdd(t); }} disabled={!t.title.trim()} style={{ flex:2, background:T.accent, border:"none", borderRadius:9, padding:"10px 0", color:T.bg, fontFamily:"Syne", fontWeight:700, fontSize:12, cursor:"pointer", opacity:!t.title.trim()?.4:1 }}>Add Task to Board</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TASK MODAL
═══════════════════════════════════════════════ */
function TaskModal({ task, kanbanCols, teamMembers, onUpdate, onMove, onClose }) {
  const [editing, setEditing] = useState({ ...task });
  const meta = ROLE_META[editing.assignedRole] || { color: T.textSoft, icon:"◈" };

  function save() { onUpdate(editing); onClose(); }

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:200,
      display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)",
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.card, border:`1px solid ${T.border}`, borderRadius:18,
        width:520, maxWidth:"92vw", maxHeight:"88vh", overflow:"auto",
        boxShadow:"0 24px 80px rgba(0,0,0,.6)",
        animation:"fadeUp .25s ease",
      }}>
        {/* Header */}
        <div style={{ padding:"20px 24px 16px", borderBottom:`1px solid ${T.border}`, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div style={{ flex:1, paddingRight:12 }}>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:8, letterSpacing:"0.08em" }}>TASK DETAIL</div>
            <input
              value={editing.title}
              onChange={e=>setEditing(p=>({...p,title:e.target.value}))}
              style={{ width:"100%", background:"transparent", border:"none", fontSize:18, fontWeight:800, color:T.text, fontFamily:"Syne", letterSpacing:"-0.02em" }}
            />
          </div>
          <button onClick={onClose} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:T.textSoft, fontSize:16, flexShrink:0 }}>×</button>
        </div>

        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:18 }}>

          {/* Description */}
          <div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:8 }}>DESCRIPTION</div>
            <textarea
              value={editing.description}
              onChange={e=>setEditing(p=>({...p,description:e.target.value}))}
              style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:"10px 14px", color:T.text, fontFamily:"DM Mono", fontSize:12, lineHeight:1.7, resize:"vertical", minHeight:80, transition:"border-color .2s" }}
              onFocus={e=>e.target.style.borderColor=T.accent+"66"}
              onBlur={e=>e.target.style.borderColor=T.border}
            />
          </div>

          {/* Priority + Days row */}
          <div style={{ display:"flex", gap:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:8 }}>PRIORITY</div>
              <div style={{ display:"flex", gap:6 }}>
                {["HIGH","MEDIUM","LOW"].map(p=>(
                  <button key={p} onClick={()=>setEditing(prev=>({...prev,priority:p}))} style={{
                    flex:1, background: editing.priority===p ? PRIORITY_COLOR[p]+"22" : T.surface,
                    border:`1px solid ${editing.priority===p ? PRIORITY_COLOR[p] : T.border}`,
                    borderRadius:7, padding:"7px 0", fontSize:10, fontFamily:"DM Mono",
                    color: editing.priority===p ? PRIORITY_COLOR[p] : T.textSoft, cursor:"pointer",
                  }}>{p}</button>
                ))}
              </div>
            </div>
            <div style={{ width:100 }}>
              <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:8 }}>EST. DAYS</div>
              <input type="number" min={1} max={90}
                value={editing.estimatedDays}
                onChange={e=>setEditing(p=>({...p,estimatedDays:Number(e.target.value)}))}
                style={{ width:"100%", background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:"7px 10px", color:T.text, fontFamily:"DM Mono", fontSize:13, textAlign:"center" }}
              />
            </div>
          </div>

          {/* Assign role */}
          <div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:8 }}>ASSIGNED TO</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {teamMembers.map(m=>{
                const mm = ROLE_META[m.role]||{color:T.textSoft,icon:"◈"};
                const active = editing.assignedRole===m.role;
                return (
                  <button key={m.id} onClick={()=>setEditing(p=>({...p,assignedRole:m.role,assignedName:m.name||""}))} style={{
                    background: active?mm.color+"22":T.surface,
                    border:`1px solid ${active?mm.color:T.border}`,
                    borderRadius:8, padding:"6px 12px", cursor:"pointer",
                    display:"flex", alignItems:"center", gap:6,
                  }}>
                    <span style={{fontSize:12}}>{mm.icon}</span>
                    <span style={{ fontSize:11, color:active?mm.color:T.textSoft, fontWeight:600, fontFamily:"Syne" }}>{m.name||m.role}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Move to column */}
          <div>
            <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", marginBottom:8 }}>MOVE TO COLUMN</div>
            <div style={{ display:"flex", gap:6 }}>
              {kanbanCols.map(col=>{
                const active = editing.column===col;
                const cc = { "To Do":T.textMuted, "In Progress":T.blue, "Review":T.amber, "Done":T.green }[col]||T.textMuted;
                return (
                  <button key={col} onClick={()=>setEditing(p=>({...p,column:col}))} style={{
                    flex:1, background:active?cc+"22":T.surface, border:`1px solid ${active?cc:T.border}`,
                    borderRadius:7, padding:"8px 0", fontSize:10, fontFamily:"Syne", fontWeight:600,
                    color:active?cc:T.textSoft, cursor:"pointer",
                  }}>{col}</button>
                );
              })}
            </div>
          </div>

          {/* Save / Cancel */}
          <div style={{ display:"flex", gap:10, paddingTop:4 }}>
            <Btn onClick={onClose} full={false}>Cancel</Btn>
            <Btn primary onClick={save} full={false}>Save Changes</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   LIBRARY VIEW
═══════════════════════════════════════════════ */
function LibraryView({ history, setActiveSection, setActiveChat, isMobile }) {
  const translatorItems = history.filter(h=>h.section==="translator");
  const teamItems       = history.filter(h=>h.section==="team");

  return (
    <div style={{ flex:1, overflowY:"auto", padding: isMobile ? "20px 16px" : "40px 40px" }}>
      <div style={{ maxWidth: isMobile ? "100%" : 820, margin:"0 auto" }}>
        <div className="fade" style={{ marginBottom:32 }}>
          <div style={{ fontSize:11, color:T.accent, fontFamily:"DM Mono", letterSpacing:"0.08em", marginBottom:8 }}>PROJECT LIBRARY</div>
          <h2 style={{ fontSize:28, fontWeight:800, letterSpacing:"-0.02em" }}>All saved work</h2>
        </div>

        {history.length === 0 && (
          <div style={{ textAlign:"center", padding:"80px 0", color:T.textMuted }}>
            <div style={{ fontSize:48, marginBottom:16 }}>◈</div>
            <div style={{ fontFamily:"DM Mono", fontSize:13 }}>Nothing saved yet. Start a session to build your library.</div>
          </div>
        )}

        {translatorItems.length > 0 && (
          <div style={{ marginBottom:32 }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:14, color:T.textSoft }}>Brief Translations</div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
              {translatorItems.map(p=>(
                <LibCard key={p.id} item={p} onClick={()=>{ setActiveSection("translator"); setActiveChat(p.id); }} />
              ))}
            </div>
          </div>
        )}

        {teamItems.length > 0 && (
          <div>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:14, color:T.textSoft }}>Team Projects</div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
              {teamItems.map(p=>(
                <LibCard key={p.id} item={p} onClick={()=>{ setActiveSection("team"); setActiveChat(p.id); }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LibCard({ item, onClick }) {
  const vc = { GOOD:T.green, FAIR:T.amber, POOR:T.red, CHAOS:T.purple }[item.data?.scoring?.verdict];
  return (
    <div className="fade" onClick={onClick} style={{
      background:T.card, border:`1px solid ${T.border}`, borderRadius:14,
      padding:18, cursor:"pointer", transition:"all .2s",
    }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor=T.borderHover; e.currentTarget.style.transform="translateY(-2px)"; }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.transform="translateY(0)"; }}
    >
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontWeight:700, fontSize:13, flex:1, paddingRight:8, lineHeight:1.4 }}>{item.title}</div>
        {vc && <div style={{ background:vc+"22", color:vc, fontSize:9, fontFamily:"DM Mono", borderRadius:4, padding:"2px 7px", height:"fit-content" }}>{item.data.scoring.verdict}</div>}
      </div>
      {item.data?.result?.toneWords && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:10 }}>
          {item.data.result.toneWords.slice(0,3).map((w,i)=>(
            <span key={i} style={{ background:T.surface, borderRadius:4, padding:"2px 8px", fontSize:10, color:T.textSoft }}>{w}</span>
          ))}
        </div>
      )}
      {item.data?.teamMembers?.length > 0 && (
        <div style={{ display:"flex", gap:4, marginBottom:10 }}>
          {item.data.teamMembers.slice(0,5).map((m,i)=>{
            const meta = ROLE_META[m.role];
            return <span key={i} style={{ fontSize:13, title:m.role }}>{meta?.icon}</span>;
          })}
        </div>
      )}
      <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono" }}>
        {new Date(item.ts).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SHARED COMPONENTS
═══════════════════════════════════════════════ */
function Card({ title, children, style={} }) {
  return (
    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, padding:"18px 20px", ...style }}>
      <div style={{ fontSize:10, color:T.textMuted, fontFamily:"DM Mono", letterSpacing:"0.08em", marginBottom:14 }}>{title}</div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, primary, disabled, full }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary?T.accent:T.card,
      color: primary?T.bg:T.text,
      border:`1px solid ${primary?T.accent:T.border}`,
      borderRadius:9, padding:"10px 20px",
      fontSize:12, fontFamily:"Syne", fontWeight:700,
      cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?.4:1,
      transition:"all .15s",
      width:full?"100%":undefined,
    }}
      onMouseEnter={e=>!disabled&&(e.currentTarget.style.opacity="0.82")}
      onMouseLeave={e=>!disabled&&(e.currentTarget.style.opacity="1")}
    >{children}</button>
  );
}

function ChatBubble({ msg }) {
  const isAI = msg.role === "ai";
  // Parse lines, then within each line parse **bold**
  const lines = msg.text.split("\n");
  return (
    <div className="fade" style={{ display:"flex", gap:10, marginBottom:14, justifyContent:isAI?"flex-start":"flex-end" }}>
      {isAI && (
        <div style={{ width:26, height:26, background:T.accent, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:T.bg, fontWeight:800, flexShrink:0, marginTop:2 }}>✦</div>
      )}
      <div style={{
        maxWidth:"82%", background:isAI?T.card:T.accentBg,
        border:`1px solid ${isAI?T.border:T.accent+"44"}`,
        borderRadius:isAI?"4px 12px 12px 12px":"12px 4px 12px 12px",
        padding:"10px 14px", fontSize:12, lineHeight:1.75, color:T.text, textAlign:"left",
      }}>
        {lines.map((line, li) => {
          const parts = line.split(/\*\*(.*?)\*\*/g);
          const isRoleLine = line.match(/^[◈◎⟨⟩⚙◉▶✦◆]/);
          return (
            <div key={li} style={{
              marginBottom: li < lines.length - 1 ? (isRoleLine ? 6 : 4) : 0,
              paddingLeft: isRoleLine ? 4 : 0,
              borderLeft: isRoleLine ? `2px solid ${T.accent}44` : "none",
              paddingTop: isRoleLine ? 3 : 0,
              paddingBottom: isRoleLine ? 3 : 0,
            }}>
              {parts.map((p,i) => i%2===1 ? <strong key={i} style={{color:T.accent}}>{p}</strong> : p)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display:"flex", gap:10, marginBottom:14 }}>
      <div style={{ width:26, height:26, background:T.accent, borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:T.bg, fontWeight:800, flexShrink:0 }}>✦</div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:"4px 12px 12px 12px", padding:"12px 16px", display:"flex", gap:5, alignItems:"center" }}>
        {[0,1,2].map(i=>(
          <div key={i} style={{ width:5, height:5, borderRadius:"50%", background:T.accent, animation:"pulse 1.4s ease infinite", animationDelay:`${i*.2}s` }} />
        ))}
      </div>
    </div>
  );
}

function Toast({ msg, type }) {
  const c = type==="ok"?T.green:T.red;
  return (
    <div style={{
      position:"fixed", bottom:24, right:24, background:T.card,
      border:`1px solid ${c}44`, borderRadius:10, padding:"11px 18px",
      fontSize:12, color:T.text, display:"flex", alignItems:"center", gap:8,
      zIndex:9999, boxShadow:"0 8px 32px rgba(0,0,0,.5)",
      animation:"fadeUp .3s ease",
    }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:c }} />
      {msg}
    </div>
  );
}



