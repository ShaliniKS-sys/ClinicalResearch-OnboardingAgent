import { useState, useRef, useEffect, useCallback } from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Relative paths — Vite dev server proxies /webhook/* → https://pallavi04.app.n8n.cloud
// This avoids CORS errors when running on localhost.
const N8N_CHAT_WEBHOOK = "https://shaliniks.app.n8n.cloud/webhook/cra-intake";
const N8N_DASHBOARD_WEBHOOK = "https://shaliniks.app.n8n.cloud/webhook/19ec5753-7142-4027-bda5-7596b63d7a35";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function generateSessionId() {
  return "session_" + Math.random().toString(36).slice(2) + Date.now();
}

function getOrCreateSession() {
  let id = sessionStorage.getItem("cra_session_id");
  if (!id) { id = generateSessionId(); sessionStorage.setItem("cra_session_id", id); }
  return id;
}

function getStoredName() { return sessionStorage.getItem("cra_user_name") || ""; }
function setStoredName(n) { sessionStorage.setItem("cra_user_name", n); }

// Detect if agent has generated a training plan in the message
// Matches the markdown format: "# Training Plan — Jane Smith"
function detectPlanInMessage(text) {
  return text.includes("# Training Plan") || text.includes("Training Plan —") || text.includes("Training Plan —");
}

// Parse checklist items from the training plan markdown
// Plan uses: "## ✅ Section 1 — Universal Requirements" and "- Item Name  " (top-level bullets)
function extractChecklistItems(text) {
  const lines = text.split("\n");
  const items = [];
  let currentSection = "";
  lines.forEach(line => {
    // Section headers: "## ✅ Section 1 — Universal Requirements"
    const sectionMatch = line.match(/^##\s+.+?Section \d+\s+[—–-]\s+(.+)/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      return;
    }
    // Top-level bullets only (not indented sub-bullets starting with "  -")
    // Match "- Item Name" but NOT "  - sub-item"
    if (line.match(/^- /) && !line.match(/^  /)) {
      // Strip markdown bold and trailing whitespace
      const label = line.replace(/^- /, "").replace(/\*\*(.+?)\*\*/g, "$1").trim();
      // Skip Section 6 (CITI transfer notes) and Section 7 (records admin) — not actionable checklist items
      if (label && !currentSection.includes("CITI Transfer") && !currentSection.includes("Training Records")) {
        items.push({ id: Math.random().toString(36).slice(2), label, section: currentSection, done: false });
      }
    }
  });
  return items;
}

// Format agent message — renders markdown produced by the n8n training plan and Q&A agent
function FormatMessage({ text }) {
  const lines = text.split("\n");
  return (
    <div style={{ lineHeight: 1.65, fontSize: 14 }}>
      {lines.map((line, i) => {
        // H1: "# Training Plan — Jane Smith"
        if (line.match(/^# /)) return (
          <div key={i} style={{ fontWeight: 800, fontSize: 16, color: "#0D1F3C", marginTop: 4, marginBottom: 8, fontFamily: "'Playfair Display', Georgia, serif" }}>
            {line.replace(/^# /, "")}
          </div>
        );

        // H2 section headers: "## ✅ Section 1 — Universal Requirements"
        if (line.match(/^## /)) return (
          <div key={i} style={{ fontWeight: 700, color: "#0D1F3C", marginTop: 18, marginBottom: 6, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, borderLeft: "3px solid #4A7FA5", paddingLeft: 8 }}>
            {line.replace(/^## /, "")}
          </div>
        );

        // Bold key-value header lines like "**Role:** ... | **Hire Date:** ..."
        if (line.match(/^\*\*Role:\*\*/)) return (
          <div key={i} style={{ fontSize: 12, color: "#6B7FA3", marginBottom: 4 }}>
            {line.replace(/\*\*(.+?)\*\*/g, "$1")}
          </div>
        );

        // Horizontal rule ---
        if (line.match(/^---+$/)) return (
          <hr key={i} style={{ border: "none", borderTop: "1px solid #E4EAF4", margin: "12px 0" }} />
        );

        // Completion marker lines that contain ✅ COMPLETED
        if (line.includes("✅ COMPLETED")) return (
          <div key={i} style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", margin: "6px 0", color: "#065F46", fontWeight: 600, fontSize: 13 }}>
            {line.replace(/^- /, "")}
          </div>
        );

        // Top-level bullet items "- Item Name"
        if (line.match(/^- /) && !line.match(/^  /)) {
          const content = line.replace(/^- /, "").replace(/\*\*(.+?)\*\*/g, "$1");
          return (
            <div key={i} style={{ display: "flex", gap: 8, margin: "6px 0", paddingLeft: 4, color: "#1A3A5C" }}>
              <span style={{ color: "#4A7FA5", flexShrink: 0 }}>•</span>
              <span style={{ fontWeight: 500 }}>{content}</span>
            </div>
          );
        }

        // Indented sub-bullet "  - Deadline: ..." or "  - How to complete: ..."
        if (line.match(/^  - /)) {
          const content = line.replace(/^  - /, "").replace(/\*\*(.+?)\*\*/g, "$1");
          return (
            <div key={i} style={{ fontSize: 12, color: "#6B7FA3", paddingLeft: 20, margin: "2px 0", lineHeight: 1.6 }}>
              {content}
            </div>
          );
        }

        // Numbered list items "1. **Step**: ..."
        if (line.match(/^\d+\. /)) return (
          <div key={i} style={{ display: "flex", gap: 8, margin: "5px 0", paddingLeft: 4, color: "#1A3A5C", fontSize: 13 }}>
            <span style={{ color: "#4A7FA5", flexShrink: 0, fontWeight: 600 }}>{line.match(/^\d+/)[0]}.</span>
            <span>{line.replace(/^\d+\. /, "").replace(/\*\*(.+?)\*\*/g, "$1")}</span>
          </div>
        );

        // Warning/note lines starting with ⚠ or NOTE:
        if (line.startsWith("⚠") || line.startsWith("NOTE:")) return (
          <div key={i} style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, padding: "10px 14px", margin: "12px 0", color: "#92400E", fontWeight: 600, fontSize: 13 }}>
            {line}
          </div>
        );

        // Confirmation lines starting with ✓
        if (line.startsWith("✓")) return (
          <div key={i} style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", margin: "6px 0", color: "#065F46", fontWeight: 600, fontSize: 13 }}>
            {line}
          </div>
        );

        // Bold-only lines (section labels like "**Staff is cleared...**")
        if (line.match(/^\*\*.+\*\*$/)) return (
          <div key={i} style={{ fontWeight: 700, color: "#0D1F3C", margin: "10px 0 4px", fontSize: 13 }}>
            {line.replace(/\*\*(.+?)\*\*/g, "$1")}
          </div>
        );

        // Empty line
        if (line.trim() === "") return <div key={i} style={{ height: 5 }} />;

        // Default: plain line, strip any remaining **bold** markers
        return (
          <div key={i} style={{ color: "#3A3A3A" }}>
            {line.replace(/\*\*(.+?)\*\*/g, "$1")}
          </div>
        );
      })}
    </div>
  );
}

// ─── INTAKE QUESTIONS (shown as quick-start before chat) ─────────────────────
const INTAKE_STEPS = [
  { key: "third_party", question: "Are you a GWU/MFA employee?", options: ["Yes — GWU/MFA staff", "No — external/vendor staff"] },
  { key: "hire_type", question: "Is this your first time joining the team?", options: ["Yes — new hire", "No — returning staff"] },
];

// ─── PROGRESS STEPS (shown in sidebar) ──────────────────────────────────────
const PROGRESS_STEPS = ["Identity Check", "Your Details", "Systems & Role", "Training Plan"];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function CRAPortal() {
  const [view, setView] = useState("landing"); // landing | staff | manager
  const [staffName, setStaffName] = useState(getStoredName());

  return (
    <div style={{ height: "100vh", width: "100%", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#F4F6FA" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #C7D4E4; border-radius: 4px; }
        ::placeholder { color: #9BAEC8; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes slideIn { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
        .fade-up { animation: fadeUp 0.45s ease both; }
        .btn-primary { background:#0D1F3C; color:white; border:none; border-radius:10px; padding:13px 28px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .2s; letter-spacing:.2px; }
        .btn-primary:hover { background:#1A3A5C; transform:translateY(-1px); box-shadow:0 6px 20px rgba(13,31,60,.25); }
        .btn-secondary { background:transparent; color:#0D1F3C; border:1.5px solid #C7D4E4; border-radius:10px; padding:11px 24px; font-size:13px; font-weight:500; cursor:pointer; font-family:inherit; transition:all .2s; }
        .btn-secondary:hover { border-color:#4A7FA5; color:#4A7FA5; }
        .tag { display:inline-block; background:#E8EEF7; color:#4A7FA5; font-size:11px; font-weight:600; padding:4px 10px; border-radius:20px; letter-spacing:.3px; }
      `}</style>

      {view === "landing" && <LandingView onStaff={() => setView("staff")} onManager={() => setView("manager")} />}
      {view === "staff" && <StaffPortal onBack={() => setView("landing")} staffName={staffName} setStaffName={setStaffName} />}
      {view === "manager" && <ManagerDashboard onBack={() => setView("landing")} />}
    </div>
  );
}

// ─── LANDING ──────────────────────────────────────────────────────────────────
function LandingView({ onStaff, onManager }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(160deg, #0D1F3C 0%, #1A3A5C 55%, #2C5F8A 100%)" }}>
      {/* Top bar */}
      <div style={{ padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "rgba(255,255,255,.12)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚕</div>
          <div>
            <div style={{ color: "white", fontWeight: 600, fontSize: 14, letterSpacing: .3 }}>GWU MFA Clinical Research</div>
            <div style={{ color: "rgba(255,255,255,.5)", fontSize: 11 }}>Office of Clinical Research</div>
          </div>
        </div>
        <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 20, padding: "5px 14px", color: "rgba(255,255,255,.6)", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>SOP 15 v4.0</div>
      </div>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ textAlign: "center", maxWidth: 560 }} className="fade-up">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(74,127,165,.25)", border: "1px solid rgba(74,127,165,.4)", borderRadius: 20, padding: "6px 16px", marginBottom: 28 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#6EE7B7", animation: "pulse 2s infinite" }} />
            <span style={{ color: "#A8D5F0", fontSize: 12, fontWeight: 500, letterSpacing: .3 }}>Training Compliance Agent · Active</span>
          </div>

          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, color: "white", lineHeight: 1.15, marginBottom: 18 }}>
            Clinical Research<br />
            <span style={{ color: "#7EC8E3" }}>Training Portal</span>
          </h1>

          <p style={{ color: "rgba(255,255,255,.65)", fontSize: 15, lineHeight: 1.7, marginBottom: 44, maxWidth: 420, margin: "0 auto 44px" }}>
            Your AI-guided onboarding companion. Get a personalized training plan, track your compliance, and stay research-ready — grounded in SOP 15 v4.0.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={onStaff} style={{ background: "white", color: "#0D1F3C", padding: "15px 36px", fontSize: 15 }}>
              Begin My Onboarding →
            </button>
            <button className="btn-secondary" onClick={onManager} style={{ color: "rgba(255,255,255,.75)", borderColor: "rgba(255,255,255,.25)" }}>
              Manager Dashboard
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 40, flexWrap: "wrap" }}>
            {["Personalized to your role", "Deadline-aware", "SOP 15 compliant", "Session memory"].map(t => (
              <span key={t} style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.6)", fontSize: 11, padding: "5px 12px", borderRadius: 20, fontWeight: 500 }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 40px", textAlign: "center", color: "rgba(255,255,255,.25)", fontSize: 11, borderTop: "1px solid rgba(255,255,255,.06)" }}>
        GWU MFA Clinical Research · SOP 15 v4.0 (Revised November 2023) · Powered by Claude (Anthropic)
      </div>
    </div>
  );
}

// ─── STAFF PORTAL ─────────────────────────────────────────────────────────────
function StaffPortal({ onBack, staffName, setStaffName }) {
  const [phase, setPhase] = useState("intake"); // intake | summary | generating | chat
  const [intakeStep, setIntakeStep] = useState(0);
  const [intakeData, setIntakeData] = useState({
    staff_name: staffName,
    third_party: "",
    returning_staff: "",
    role: "",
    hire_date: "",
    system_access: [],
    nih_funded: "",
    activities: [],
    prior_citi: "",
    prior_citi_details: ""
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [checklist, setChecklist] = useState([]);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const sessionId = useRef(getOrCreateSession());
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (messageCount >= 1) setProgressStep(1);
    if (messageCount >= 3) setProgressStep(2);
    if (messageCount >= 6) setProgressStep(3);
    if (planGenerated) setProgressStep(4);
  }, [messageCount, planGenerated]);

  const INTAKE_FORM_STEPS = [
    {
      question: "What is your full name?",
      key: "staff_name",
      type: "text",
      placeholder: "e.g. Jane Smith"
    },
    {
      question: "Are you a GWU/MFA employee or an external/vendor contractor?",
      key: "third_party",
      type: "radio",
      options: [
        { label: "GWU/MFA Employee", value: "no" },
        { label: "External / Vendor Staff", value: "yes" }
      ]
    },
    {
      question: "Is this your first time joining the team, or are you returning staff?",
      key: "returning_staff",
      type: "radio",
      options: [
        { label: "New Hire", value: "no" },
        { label: "Returning Staff", value: "yes" }
      ]
    },
    {
      question: "What is your role?",
      key: "role",
      type: "radio",
      options: [
        { label: "Clinical Research Coordinator", value: "Clinical Research Coordinator" },
        { label: "Research Nurse", value: "Research Nurse" },
        { label: "Data Coordinator", value: "Data Coordinator" },
        { label: "Research Assistant", value: "Research Assistant" },
        { label: "Principal Investigator", value: "Principal Investigator" },
        { label: "Other", value: "Other" }
      ]
    },
    {
      question: "What is your hire date?",
      key: "hire_date",
      type: "date"
    },
    {
      question: "Which systems will you need access to? (select all that apply)",
      key: "system_access",
      type: "checkbox",
      options: [
        { label: "EPIC", value: "EPIC" },
        { label: "OnCore", value: "OnCore" },
        { label: "RedCap", value: "RedCap" },
        { label: "iRis", value: "iRis" },
        { label: "Cerner Powertrials", value: "Cerner Powertrials" },
        { label: "None", value: "None" }
      ]
    },
    {
      question: "Will you be involved in any NIH-funded studies?",
      key: "nih_funded",
      type: "radio",
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
        { label: "Not sure", value: "not sure" }
      ]
    },
    {
      question: "What activities will you perform? (select all that apply)",
      key: "activities",
      type: "checkbox",
      options: [
        { label: "Consenting participants", value: "Consenting participants" },
        { label: "Data entry", value: "Data entry" },
        { label: "Specimen collection", value: "Specimen collection" },
        { label: "Blood draws", value: "Blood draws" },
        { label: "Shipping biological specimens", value: "Shipping biological specimens" }
      ]
    },
    {
      question: "Do you have any prior CITI training from a previous institution?",
      key: "prior_citi",
      type: "radio",
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" }
      ]
    }
  ];

  function updateIntakeData(key, value) {
    setIntakeData(prev => ({ ...prev, [key]: value }));
  }

  function toggleCheckbox(key, value) {
    setIntakeData(prev => {
      const arr = prev[key] || [];
      if (arr.includes(value)) {
        return { ...prev, [key]: arr.filter(v => v !== value) };
      } else {
        return { ...prev, [key]: [...arr, value] };
      }
    });
  }

  function nextIntakeStep() {
    const currentStep = INTAKE_FORM_STEPS[intakeStep];
    if (!currentStep) return;

    if (currentStep.type === "text" && !intakeData[currentStep.key]?.trim()) return;
    if (currentStep.type === "radio" && !intakeData[currentStep.key]) return;
    if (currentStep.type === "date" && !intakeData[currentStep.key]) return;
    if (currentStep.type === "checkbox" && (!intakeData[currentStep.key] || intakeData[currentStep.key].length === 0)) return;

    if (intakeStep === INTAKE_FORM_STEPS.length - 1) {
      setPhase("summary");
    } else {
      setIntakeStep(intakeStep + 1);
    }
  }

  function prevIntakeStep() {
    if (intakeStep > 0) setIntakeStep(intakeStep - 1);
  }

  async function startChat() {
    if (!intakeData.staff_name?.trim()) return;
    const name = intakeData.staff_name.trim();
    setStaffName(name);
    setStoredName(name);

    setPhase("generating");
    setLoading(true);

    try {
      const payload = {
        chatInput: "Generate my training plan",
        sessionId: sessionId.current,
        action: "sendMessage",
        staff_name: name,
        third_party: intakeData.third_party,
        returning_staff: intakeData.returning_staff,
        role: intakeData.role,
        hire_date: intakeData.hire_date,
        system_access: intakeData.system_access.join(", "),
        nih_funded: intakeData.nih_funded,
        activities: intakeData.activities.join(", "),
        prior_citi: intakeData.prior_citi,
        prior_citi_details: intakeData.prior_citi_details
      };

      const reply = await callN8n(payload.chatInput, sessionId.current, payload);
      setMessages([
        { role: "assistant", content: reply }
      ]);
      setMessageCount(1);

      if (detectPlanInMessage(reply)) {
        setPlanGenerated(true);
        const items = extractChecklistItems(reply);
        if (items.length > 0) setChecklist(items);
      }

      setPhase("chat");
    } catch (e) {
      setMessages([{ role: "assistant", content: "⚠ Could not connect to the training agent. Please check your connection and try again, or contact the Office of Clinical Research." }]);
      setPhase("chat");
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const reply = await callN8n(userMsg, sessionId.current);
      setMessages([...newMessages, { role: "assistant", content: reply }]);
      setMessageCount(c => c + 1);

      if (detectPlanInMessage(reply)) {
        setPlanGenerated(true);
        const items = extractChecklistItems(reply);
        if (items.length > 0) setChecklist(items);
      }
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: "⚠ Connection error. Please try again." }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function toggleCheck(id) {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, done: !item.done } : item));
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // Intake form
  if (phase === "intake") {
    const currentStep = INTAKE_FORM_STEPS[intakeStep];
    const progressPercent = ((intakeStep + 1) / INTAKE_FORM_STEPS.length) * 100;

    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F4F6FA" }}>
        <div style={{ background: "#0D1F3C", color: "white", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: .2 }}>CRA Training Intake</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>Step {intakeStep + 1} of {INTAKE_FORM_STEPS.length}</div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ width: "100%", maxWidth: 500 }} className="fade-up">
            <div style={{ background: "white", borderRadius: 20, padding: "44px 40px", boxShadow: "0 8px 40px rgba(13,31,60,.1)", border: "1px solid #E4EAF4" }}>
              <div style={{ marginBottom: 24 }}>
                <div style={{ height: 4, background: "#E4EAF4", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "#0D1F3C", width: `${progressPercent}%`, transition: "width .3s" }} />
                </div>
                <div style={{ fontSize: 11, color: "#9BAEC8", marginTop: 8 }}>Step {intakeStep + 1} of {INTAKE_FORM_STEPS.length}</div>
              </div>

              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#0D1F3C", marginBottom: 28, lineHeight: 1.4 }}>
                {currentStep.question}
              </h2>

              {currentStep.type === "text" && (
                <div style={{ marginBottom: 28 }}>
                  <input type="text" value={intakeData[currentStep.key]} onChange={e => updateIntakeData(currentStep.key, e.target.value)} onKeyDown={e => e.key === "Enter" && nextIntakeStep()} placeholder={currentStep.placeholder} style={{ width: "100%", padding: "13px 16px", borderRadius: 10, border: "1.5px solid #D1DCF0", fontSize: 14, outline: "none", fontFamily: "inherit", color: "#0D1F3C", transition: "border-color .2s" }} onFocus={e => e.target.style.borderColor = "#4A7FA5"} onBlur={e => e.target.style.borderColor = "#D1DCF0"} autoFocus />
                </div>
              )}

              {currentStep.type === "radio" && (
                <div style={{ marginBottom: 28 }}>
                  {currentStep.options.map(opt => (
                    <label key={opt.value} style={{ display: "flex", alignItems: "center", padding: "12px 16px", margin: "8px 0", borderRadius: 10, border: `2px solid ${intakeData[currentStep.key] === opt.value ? "#4A7FA5" : "#E4EAF4"}`, background: intakeData[currentStep.key] === opt.value ? "#EBF3FA" : "transparent", cursor: "pointer", transition: "all .2s" }}>
                      <input type="radio" name={currentStep.key} value={opt.value} checked={intakeData[currentStep.key] === opt.value} onChange={e => updateIntakeData(currentStep.key, e.target.value)} style={{ marginRight: 12, cursor: "pointer", accentColor: "#0D1F3C" }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "#0D1F3C" }}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {currentStep.type === "date" && (
                <div style={{ marginBottom: 28 }}>
                  <input type="date" value={intakeData[currentStep.key]} onChange={e => updateIntakeData(currentStep.key, e.target.value)} style={{ width: "100%", padding: "13px 16px", borderRadius: 10, border: "1.5px solid #D1DCF0", fontSize: 14, outline: "none", fontFamily: "inherit", color: "#0D1F3C", transition: "border-color .2s" }} onFocus={e => e.target.style.borderColor = "#4A7FA5"} onBlur={e => e.target.style.borderColor = "#D1DCF0"} autoFocus />
                </div>
              )}

              {currentStep.type === "checkbox" && (
                <div style={{ marginBottom: 28 }}>
                  {currentStep.options.map(opt => (
                    <label key={opt.value} style={{ display: "flex", alignItems: "center", padding: "12px 16px", margin: "8px 0", borderRadius: 10, border: `2px solid ${intakeData[currentStep.key]?.includes(opt.value) ? "#4A7FA5" : "#E4EAF4"}`, background: intakeData[currentStep.key]?.includes(opt.value) ? "#EBF3FA" : "transparent", cursor: "pointer", transition: "all .2s" }}>
                      <input type="checkbox" checked={intakeData[currentStep.key]?.includes(opt.value) || false} onChange={() => toggleCheckbox(currentStep.key, opt.value)} style={{ marginRight: 12, cursor: "pointer", accentColor: "#0D1F3C" }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "#0D1F3C" }}>{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {intakeStep === INTAKE_FORM_STEPS.length - 1 && intakeData.prior_citi === "yes" && (
                <div style={{ marginBottom: 28 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#0D1F3C", marginBottom: 8, textTransform: "uppercase", letterSpacing: .5 }}>Describe your prior CITI training</label>
                  <textarea value={intakeData.prior_citi_details} onChange={e => updateIntakeData("prior_citi_details", e.target.value)} placeholder="e.g. GCP completed 2024 at Johns Hopkins" rows={3} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #D1DCF0", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none", color: "#0D1F3C", transition: "border-color .2s" }} onFocus={e => e.target.style.borderColor = "#4A7FA5"} onBlur={e => e.target.style.borderColor = "#D1DCF0"} />
                </div>
              )}

              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={prevIntakeStep} disabled={intakeStep === 0} style={{ flex: 1, background: intakeStep === 0 ? "#F0F4FA" : "transparent", color: intakeStep === 0 ? "#C7D4E4" : "#0D1F3C", border: "1.5px solid #C7D4E4", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: intakeStep === 0 ? "default" : "pointer", fontFamily: "inherit", transition: "all .2s" }}>
                  ← Back
                </button>
                <button onClick={nextIntakeStep} style={{ flex: 1, background: "#0D1F3C", color: "white", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
                  {intakeStep === INTAKE_FORM_STEPS.length - 1 ? "Review Answers →" : "Next →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Summary screen
  if (phase === "summary") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F4F6FA" }}>
        <div style={{ background: "#0D1F3C", color: "white", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <button onClick={() => setPhase("intake")} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: .2 }}>Review Your Answers</div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ width: "100%", maxWidth: 540 }} className="fade-up">
            <div style={{ background: "white", borderRadius: 20, padding: "44px 40px", boxShadow: "0 8px 40px rgba(13,31,60,.1)", border: "1px solid #E4EAF4" }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: "#0D1F3C", marginBottom: 28 }}>Your Information</h2>

              {[
                { label: "Full Name", value: intakeData.staff_name },
                { label: "Employee Type", value: intakeData.third_party === "no" ? "GWU/MFA Employee" : "External / Vendor Staff" },
                { label: "Staff Status", value: intakeData.returning_staff === "no" ? "New Hire" : "Returning Staff" },
                { label: "Role", value: intakeData.role },
                { label: "Hire Date", value: intakeData.hire_date },
                { label: "System Access", value: intakeData.system_access.join(", ") || "None" },
                { label: "NIH-Funded Studies", value: intakeData.nih_funded.charAt(0).toUpperCase() + intakeData.nih_funded.slice(1) },
                { label: "Activities", value: intakeData.activities.join(", ") || "None" },
                { label: "Prior CITI Training", value: intakeData.prior_citi === "yes" ? "Yes" : "No" },
                ...(intakeData.prior_citi === "yes" ? [{ label: "Details", value: intakeData.prior_citi_details }] : [])
              ].map((item, i) => (
                <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < 9 ? "1px solid #F0F4FA" : "none" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9BAEC8", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 14, color: "#0D1F3C", fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}

              <button onClick={() => setPhase("intake")} style={{ width: "100%", background: "transparent", color: "#0D1F3C", border: "1.5px solid #C7D4E4", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 12, transition: "all .2s" }}>
                ← Edit Answers
              </button>
              <button onClick={startChat} style={{ width: "100%", background: "#0D1F3C", color: "white", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Generate My Training Plan →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Generating screen
  if (phase === "generating") {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F4F6FA" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 60, height: 60, background: "linear-gradient(135deg, #0D1F3C, #2C5F8A)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 24px", animation: "pulse 2s infinite" }}>⚕</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, color: "#0D1F3C", marginBottom: 12 }}>Generating your personalized training plan…</h2>
          <p style={{ color: "#6B7FA3", fontSize: 14, lineHeight: 1.65 }}>This should take about 10 seconds</p>
        </div>
      </div>
    );
  }

  // Chat UI
  const doneCount = checklist.filter(i => i.done).length;
  const totalCount = checklist.length;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#F4F6FA" }}>
      {/* Top bar */}
      <div style={{ background: "#0D1F3C", color: "white", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>←</button>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#2C5F8A,#4A90D9)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚕</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: .2 }}>CRA Training Agent</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>Session: {staffName}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#6EE7B7", animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>Live</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* LEFT SIDEBAR */}
        <div style={{ width: 240, background: "white", borderRight: "1px solid #E4EAF4", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          {/* Progress */}
          <div style={{ padding: "20px 20px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9BAEC8", textTransform: "uppercase", letterSpacing: .8, marginBottom: 16 }}>Progress</div>
            {PROGRESS_STEPS.map((step, i) => {
              const done = i < progressStep;
              const active = i === progressStep && progressStep < 4;
              return (
                <div key={step} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ flexShrink: 0, marginTop: 2 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                      background: done ? "#0D1F3C" : active ? "#EBF3FA" : "#F4F6FA",
                      color: done ? "white" : active ? "#4A7FA5" : "#C7D4E4",
                      border: active ? "2px solid #4A7FA5" : "2px solid transparent",
                      transition: "all .3s"
                    }}>
                      {done ? "✓" : i + 1}
                    </div>
                  </div>
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontSize: 12, fontWeight: done || active ? 600 : 400, color: done ? "#0D1F3C" : active ? "#4A7FA5" : "#B0BDD4", transition: "all .3s" }}>{step}</div>
                    {active && <div style={{ fontSize: 10, color: "#9BAEC8", marginTop: 2 }}>In progress…</div>}
                    {done && <div style={{ fontSize: 10, color: "#6EE7B7", marginTop: 2 }}>Complete</div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ height: 1, background: "#F0F4FA", margin: "0 20px" }} />

          {/* Checklist */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9BAEC8", textTransform: "uppercase", letterSpacing: .8, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>My Checklist</span>
              {totalCount > 0 && <span style={{ color: doneCount === totalCount ? "#6EE7B7" : "#4A7FA5" }}>{doneCount}/{totalCount}</span>}
            </div>

            {checklist.length === 0 && (
              <div style={{ fontSize: 12, color: "#C7D4E4", lineHeight: 1.6, fontStyle: "italic" }}>
                Your training checklist will appear here once the agent generates your plan.
              </div>
            )}

            {checklist.map(item => (
              <div key={item.id} onClick={() => toggleCheck(item.id)}
                style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10, cursor: "pointer", animation: "slideIn .3s ease both" }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4, border: `2px solid ${item.done ? "#0D1F3C" : "#C7D4E4"}`,
                  background: item.done ? "#0D1F3C" : "transparent", flexShrink: 0, marginTop: 1,
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s"
                }}>
                  {item.done && <span style={{ color: "white", fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, color: item.done ? "#9BAEC8" : "#3A5070", lineHeight: 1.5, textDecoration: item.done ? "line-through" : "none", transition: "all .2s" }}>
                  {item.label.split("|")[0].trim()}
                </span>
              </div>
            ))}

            {planGenerated && totalCount > 0 && (
              <div style={{ marginTop: 16, padding: "10px 12px", background: doneCount === totalCount ? "#ECFDF5" : "#F0F4FA", borderRadius: 8, fontSize: 11, color: doneCount === totalCount ? "#065F46" : "#6B7FA3", fontWeight: 500 }}>
                {doneCount === totalCount ? "🎉 All items marked complete! Share with your PI." : `${totalCount - doneCount} item${totalCount - doneCount !== 1 ? "s" : ""} remaining`}
              </div>
            )}
          </div>

          <div style={{ padding: "12px 20px", borderTop: "1px solid #F0F4FA" }}>
            <div style={{ fontSize: 10, color: "#C7D4E4", lineHeight: 1.6 }}>
              Click items above to mark as complete. Tell the agent when you've finished a training to update your record.
            </div>
          </div>
        </div>

        {/* CHAT AREA */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", animation: "fadeUp .3s ease both" }}>
                {msg.role === "assistant" && (
                  <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#0D1F3C,#2C5F8A)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginRight: 10, flexShrink: 0, alignSelf: "flex-start", marginTop: 2 }}>⚕</div>
                )}
                <div style={{
                  maxWidth: "72%", padding: "12px 16px",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  background: msg.role === "user" ? "linear-gradient(135deg,#0D1F3C,#1A3A5C)" : "white",
                  color: msg.role === "user" ? "white" : "#1A1A1A",
                  boxShadow: "0 2px 12px rgba(13,31,60,.08)",
                  border: msg.role === "assistant" ? "1px solid #E4EAF4" : "none",
                }}>
                  {msg.role === "assistant" ? <FormatMessage text={msg.content} /> : <div style={{ fontSize: 14, lineHeight: 1.6 }}>{msg.content}</div>}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#0D1F3C,#2C5F8A)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚕</div>
                <div style={{ background: "white", border: "1px solid #E4EAF4", borderRadius: "4px 16px 16px 16px", padding: "14px 18px", display: "flex", gap: 5, boxShadow: "0 2px 12px rgba(13,31,60,.06)" }}>
                  {[0,1,2].map(j => <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: "#4A7FA5", animation: `pulse 1.2s ${j * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{ padding: "12px 24px 16px", background: "white", borderTop: "1px solid #E4EAF4" }}>
            {planGenerated && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                {["I completed HIPAA training today", "Walk me through CITI registration", "What's my GCP deadline?"].map(s => (
                  <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    style={{ background: "#F0F4FA", border: "1px solid #D1DCF0", borderRadius: 20, padding: "5px 12px", fontSize: 11, color: "#4A7FA5", cursor: "pointer", fontFamily: "inherit", fontWeight: 500, transition: "all .15s" }}
                    onMouseEnter={e => e.target.style.background="#E4EAF4"}
                    onMouseLeave={e => e.target.style.background="#F0F4FA"}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={planGenerated ? "Ask a question or report a completion…" : "Type your answer…"}
                rows={1}
                style={{ flex: 1, padding: "11px 14px", borderRadius: 10, border: "1.5px solid #D1DCF0", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none", color: "#0D1F3C", background: "#FAFBFF", transition: "border-color .2s", lineHeight: 1.5 }}
                onFocus={e => e.target.style.borderColor="#4A7FA5"}
                onBlur={e => e.target.style.borderColor="#D1DCF0"}
              />
              <button onClick={sendMessage} disabled={!input.trim() || loading}
                style={{ width: 42, height: 42, borderRadius: 10, border: "none", background: input.trim() && !loading ? "#0D1F3C" : "#D1DCF0", color: "white", cursor: input.trim() && !loading ? "pointer" : "default", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", flexShrink: 0 }}>
                →
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#B0BDD4", marginTop: 6, textAlign: "center" }}>
              Enter to send · Shift+Enter for new line · SOP 15 v4.0
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────
function ManagerDashboard({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("https://shaliniks.app.n8n.cloud/webhook/19ec5753-7142-4027-bda5-7596b63d7a35", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getDashboard" })
      });
      if (!res.ok) throw new Error("Dashboard unavailable");
      const raw = await res.json();
      const rows = Array.isArray(raw) ? raw : raw.records ? raw.records : [raw];
      const mapped = rows
        .filter(r => r.staff_name && r.staff_name.trim() !== "")
        .map(r => ({
          staff_name:        r.staff_name || "—",
          role:              r.role || "—",
          hire_date:         r.hire_date || "—",
          two_week_deadline: r.two_week_deadline || "—",
          session_status:    r.session_status || "",
          system_access:     r.system_access || "None",
          third_party:       r.third_party || "no",
          returning_staff:   r.returning_staff || "no",
          completions_log:   r.completions_log || "",
          last_updated:      r.last_updated || "",
          session_id:        r.session_id || "",
        }));
      setData(mapped);
      setLastRefresh(new Date());
    }catch (e) {
  setData(MOCK_RECORDS);
  setLastRefresh(new Date());
}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const records = data || [];
  const now = new Date();

  function daysUntil(str) {
    if (!str) return null;
    const d = new Date(str);
    if (isNaN(d)) return null;
    return Math.ceil((d - now) / 86400000);
  }

  const stats = {
    total: records.length,
    withPlans: records.filter(r => r.session_status && r.session_status !== "").length,
    overdue: records.filter(r => { const d = daysUntil(r.two_week_deadline); return d !== null && d < 0; }).length,
    sop21: records.filter(r => (r.third_party || "").toLowerCase() === "yes").length,
  };

  function StatusBadge({ status }) {
    const map = {
      "Plan Generated": ["#ECFDF5", "#065F46", "✓"],
      "In Progress": ["#FEF3C7", "#92400E", "◐"],
      "Completions Reported": ["#EFF6FF", "#1E40AF", "★"],
    };
    const [bg, fg, icon] = map[status] || ["#F4F6FA", "#9BAEC8", "○"];
    return <span style={{ background: bg, color: fg, padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .3 }}>{icon} {status || "New"}</span>;
  }

  function DeadlineCell({ dateStr }) {
    const d = daysUntil(dateStr);
    if (!dateStr || d === null) return <span style={{ color: "#C7D4E4" }}>—</span>;
    const color = d < 0 ? "#DC2626" : d <= 3 ? "#EA580C" : d <= 7 ? "#D97706" : "#16A34A";
    const label = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `${d}d left`;
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{dateStr}</div>
        <div style={{ fontSize: 11, color, opacity: .8 }}>{label}</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      {/* Header */}
      <div style={{ background: "#0D1F3C", color: "white", padding: "0 32px", height: 60, display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,.5)", cursor: "pointer", fontSize: 18, padding: 4 }}>←</button>
        <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#2C5F8A,#4A90D9)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>⚕</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Training Compliance Dashboard</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>GWU MFA Clinical Research · SOP 15 v4.0 · Manager View</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastRefresh && <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>Updated {lastRefresh.toLocaleTimeString()}</span>}
          <button onClick={load} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", color: "rgba(255,255,255,.7)", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>↻ Refresh</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 32px" }}>
        {/* Overdue alert */}
        {stats.overdue > 0 && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "14px 20px", marginBottom: 24, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>⚠</span>
            <div>
              <div style={{ fontWeight: 700, color: "#991B1B", fontSize: 13 }}>{stats.overdue} staff member{stats.overdue !== 1 ? "s have" : " has"} missed the 2-week training deadline</div>
              <div style={{ fontSize: 12, color: "#DC2626", marginTop: 2 }}>As PI, you are responsible for verifying training compliance before research participation (SOP 15).</div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { label: "Staff Onboarded", value: stats.total, color: "#0D1F3C" },
            { label: "Plans Generated", value: stats.withPlans, color: "#1A3A5C" },
            { label: "Overdue Deadlines", value: stats.overdue, color: stats.overdue > 0 ? "#DC2626" : "#16A34A" },
            { label: "Routed to SOP 21", value: stats.sop21, color: "#6B7FA3" },
          ].map(s => (
            <div key={s.label} style={{ background: "white", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 12px rgba(13,31,60,.07)", borderTop: `4px solid ${s.color}` }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: s.color, fontFamily: "'Playfair Display', serif" }}>{loading ? "—" : s.value}</div>
              <div style={{ fontSize: 11, color: "#9BAEC8", marginTop: 4, textTransform: "uppercase", letterSpacing: .5, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "0 2px 16px rgba(13,31,60,.07)", overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #F0F4FA", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700, color: "#0D1F3C" }}>Staff Training Plans</div>
            <div style={{ fontSize: 12, color: "#9BAEC8" }}>{records.length} record{records.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFD" }}>
                  {["Name", "Role", "Hire Date", "2-Week Deadline", "Status", "Systems", "SOP Route", "Updated"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9BAEC8", textTransform: "uppercase", letterSpacing: .6, borderBottom: "1px solid #F0F4FA", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} style={{ padding: 48, textAlign: "center", color: "#C7D4E4" }}>Loading records…</td></tr>
                )}
                {!loading && records.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 48, textAlign: "center", color: "#C7D4E4", fontStyle: "italic" }}>No onboarding sessions recorded yet. Staff records appear here automatically after they complete the intake.</td></tr>
                )}
                {!loading && records.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F8FAFD", transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background="#FAFBFF"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td style={{ padding: "13px 16px", fontWeight: 600, color: "#0D1F3C" }}>{r.staff_name || "—"}</td>
                    <td style={{ padding: "13px 16px", color: "#4A7FA5" }}>{r.role || "—"}</td>
                    <td style={{ padding: "13px 16px", color: "#6B7FA3" }}>{r.hire_date || "—"}</td>
                    <td style={{ padding: "13px 16px" }}><DeadlineCell dateStr={r.two_week_deadline} /></td>
                    <td style={{ padding: "13px 16px" }}><StatusBadge status={r.session_status} /></td>
                    <td style={{ padding: "13px 16px", color: "#6B7FA3", fontSize: 12 }}>{r.system_access || "None"}</td>
                    <td style={{ padding: "13px 16px" }}>
                      {r.third_party === "Yes"
                        ? <span style={{ color: "#DC2626", fontWeight: 600, fontSize: 12 }}>⚠ SOP 21</span>
                        : <span style={{ color: "#16A34A", fontSize: 12 }}>✓ SOP 15</span>}
                    </td>
                    <td style={{ padding: "13px 16px", color: "#C7D4E4", fontSize: 11 }}>{r.last_updated ? new Date(r.last_updated).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PI reminder */}
        <div style={{ background: "white", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 12px rgba(13,31,60,.06)", borderLeft: "4px solid #0D1F3C" }}>
          <div style={{ fontWeight: 700, color: "#0D1F3C", fontSize: 13, marginBottom: 8 }}>PI Compliance Responsibilities — SOP 15</div>
          <div style={{ fontSize: 13, color: "#6B7FA3", lineHeight: 1.75 }}>
            The PI must verify all research team members have completed required training before any research procedure. Each member must provide certificates to the PI or delegated regulatory official. General certificates should be retained in a single location with a Note to File in the regulatory binder. Protocol-specific training must be filed in that protocol's regulatory binder. <strong style={{ color: "#DC2626" }}>Never let GCP expire</strong> — this is critical to regulatory compliance.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── N8N API CALL ─────────────────────────────────────────────────────────────
// Handles n8n responses that may be:
//   - An array:  [{ answer, session_id, training_plan, ... }]
//   - An object: { output, text, message, answer, ... }
// For new-hire plan responses the full training_plan markdown is in training_plan field.
// For Q&A follow-ups the reply is in the answer field.
async function callN8n(message, sessionId, intakePayload) {
  const body = intakePayload || {
    chatInput: message,
    sessionId: sessionId,
    action: "sendMessage"
  };

  const res = await fetch(N8N_CHAT_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("n8n request failed");
  const raw = await res.json();

  // Unwrap array — n8n often returns [{ ... }]
  const data = Array.isArray(raw) ? raw[0] : raw;

  // New-hire plan response: has training_plan field with full markdown plan
  // Return it directly so FormatMessage can render it
  if (data.training_plan) return data.training_plan;

  // Q&A follow-up: agent reply is in answer, output, text, or message
  return data.answer || data.output || data.text || data.message || JSON.stringify(data);
}

// ─── MOCK DATA (for demo when webhook not configured) ─────────────────────────
const MOCK_RECORDS = [
  { staff_name: "Jane Smith", role: "Clinical Research Coordinator", hire_date: "03/01/2026", two_week_deadline: "03/15/2026", third_party: "No", returning_staff: "No", system_access: "EPIC, OnCore", session_status: "Plan Generated", last_updated: new Date().toISOString() },
  { staff_name: "Marcus Torres", role: "Research Nurse", hire_date: "02/15/2026", two_week_deadline: "03/01/2026", third_party: "No", returning_staff: "No", system_access: "EPIC, RedCap", session_status: "Completions Reported", last_updated: new Date(Date.now() - 86400000 * 3).toISOString() },
  { staff_name: "Priya Nair", role: "Data Coordinator", hire_date: "03/10/2026", two_week_deadline: "03/24/2026", third_party: "No", returning_staff: "Yes", system_access: "RedCap", session_status: "In Progress", last_updated: new Date().toISOString() },
  { staff_name: "Contract CRO Staff", role: "Monitor", hire_date: "03/05/2026", two_week_deadline: "N/A", third_party: "Yes", returning_staff: "No", system_access: "None", session_status: "", last_updated: new Date().toISOString() },
];
