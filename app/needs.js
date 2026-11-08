/* "Needs you": one list of everything waiting on Gavin (master plan Phase 3, step 2).
   Pulls together what used to live in separate places:
   - approvals waiting for his OK, and ones she's not sure went through (`approvals`)
   - reminders and promises due by tomorrow or ringing now, and things owed to him that are late (`commitments`)
   - anything broken on her side (`health`)
   Each item says why it's here and how urgent it is; the same thing twice shows once.
   Done / Tomorrow change the reminder in the brain, as on its chat card. Drafts are approved on
   their chat card, so "Show in chat" scrolls to it. Reads only what the app could already read.
   Uses `sb`, `log` and the .kn sheet styles from knows.js (load after it). */
(() => {
  const css = `
  #needsBtn { position: relative; }
  #needsBtn .badge { position: absolute; top: 3px; right: 3px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
    background: var(--accent); color: #fff; font-size: 10.5px; font-weight: 700; line-height: 16px; text-align: center; }
  .nd-why { color: var(--muted); font-size: 14px; }
  .chip.now { color: #fff; background: var(--accent); }
  .chip.today { color: var(--text); background: var(--amber); }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, alt, fn) { const b = el("button", alt ? "btn alt" : "btn", label); b.onclick = fn; return b; }

  const open = el("button", "icon-btn"); open.id = "needsBtn"; open.hidden = true;
  open.setAttribute("aria-label", "Needs you"); open.title = "Needs you";
  open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/></svg><span class="badge" hidden></span>';
  document.getElementById("voiceToggle").after(open);
  const badge = open.querySelector(".badge");

  const sheet = el("section", "kn"); sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Needs you");
  sheet.innerHTML = `<div class="kn-in">
    <div class="kn-head"><h2>Needs you</h2>
      <button class="icon-btn" id="ndClose" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="kn-sub">Everything waiting on you, most urgent first.</div>
    <div class="kn-list" id="ndList"></div></div>`;
  document.body.appendChild(sheet);
  const list = sheet.querySelector("#ndList");
  open.onclick = () => { sheet.classList.add("open"); load(); };
  sheet.querySelector("#ndClose").onclick = () => sheet.classList.remove("open");

  const STALE_MS = 3 * 60 * 1000;
  const RANK = { now: 0, today: 1, soon: 2 };
  const LABEL = { now: "Now", today: "Today", soon: "Soon" };
  const NAMES = { voice: "Voice", writer: "Thinking", google: "Google", calendar_adds: "Adding events",
                  brief: "Morning brief", wrap: "Evening wrap", storage: "Storage" };
  let items = [];

  function endOfTomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 59, 0); return d; }
  function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 0); return d; }
  function tomorrowMorning() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(6, 45, 0, 0); return d; }
  function when(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

  function build(health, approvals, commitments) {
    const out = [], now = Date.now(), today = endOfToday(), tomorrow = endOfTomorrow();
    const chat = health.find(h => h.component === "chat");
    if (chat && now - new Date(chat.checked_at).getTime() > STALE_MS)
      out.push({ kind: "Heads up", level: "now", title: "Holiday isn't running on the PC", why: "Your messages wait until she's back." });
    for (const h of health) if (!h.ok && h.component !== "chat")
      out.push({ kind: "Heads up", level: "today", title: NAMES[h.component] || h.component, why: h.detail || "Not working." });

    for (const a of approvals) {
      if (a.status === "effect_unknown")
        out.push({ kind: "Check", level: "now", title: a.title, why: "She isn't sure this went through. Tell her on its card.", approval: a.id });
      else if (a.status === "pending" && (!a.expires_at || new Date(a.expires_at) > now)) {
        const exp = a.expires_at ? new Date(a.expires_at) : null;
        out.push({ kind: "Your OK", level: exp && exp <= today ? "today" : "soon", title: a.title,
                   why: a.summary || "Waiting for your OK.", meta: exp ? "Expires " + when(a.expires_at) : "", approval: a.id });
      }
    }

    for (const c of commitments) {
      const due = c.due_at ? new Date(c.due_at) : null, ring = c.next_nudge_at ? new Date(c.next_nudge_at) : null;
      const owed = c.direction === "owed_to_me";
      let level = null;
      if ((due && due < now) || (ring && ring <= now)) level = "now";
      else if (!owed && ((due && due <= today) || (ring && ring <= today))) level = "today";
      else if (!owed && ((due && due <= tomorrow) || (ring && ring <= tomorrow))) level = "soon";
      if (!level) continue;
      const late = due && due < now;
      out.push({ kind: owed ? "Waiting on" : c.important ? "Important" : "Reminder", level, title: c.title,
                 why: owed ? `${c.counterparty_text || "Someone"} owes you this${late ? " and it's late" : ""}.`
                           : late ? "This was due " + when(c.due_at) + "." : "Due " + when(c.due_at || c.next_nudge_at) + ".",
                 commitment: c });
    }

    // Same thing twice (a reminder and its draft, or a duplicate promise) shows once, at its most urgent.
    const seen = new Map();
    for (const it of out.sort((x, y) => RANK[x.level] - RANK[y.level])) {
      const k = norm(it.title);
      if (k && seen.has(k)) {
        const first = seen.get(k); first.dupes = (first.dupes || 1) + 1;
        if (it.commitment) first.also = [...(first.also || []), it.commitment.id];
        continue;
      }
      seen.set(k || Math.random(), it);
    }
    return [...seen.values()];
  }

  async function patch(ids, fields) {
    const { error } = await sb.from("commitments").update(fields).in("id", ids);
    if (error) { alert("That didn't go through: " + error.message); return; }
    load();
  }
  function showInChat(id) {
    const card = log.querySelector(`.ap[data-id="${id}"]`);
    sheet.classList.remove("open");
    if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.animate([{ outline: "3px solid var(--accent)" }, { outline: "3px solid transparent" }], 1600); }
  }

  function draw() {
    const urgent = items.filter(i => i.level !== "soon").length;
    badge.hidden = !urgent; badge.textContent = urgent > 9 ? "9+" : String(urgent);
    if (!sheet.classList.contains("open")) return;
    list.replaceChildren();
    if (!items.length) { list.append(el("div", "kn-empty", "Nothing needs you right now.")); return; }
    for (const it of items) {
      const card = el("div", "kn-item");
      const top = el("div", "kn-top");
      top.append(el("span", "chip " + it.level, LABEL[it.level]), el("span", "chip soft", it.kind));
      if (it.dupes) top.append(el("span", "chip soft", `×${it.dupes}`));
      card.append(top, el("div", "kn-title", it.title), el("div", "nd-why", it.why));
      if (it.meta) card.append(el("div", "kn-meta", it.meta));
      const row = el("div", "kn-row");
      if (it.approval) row.append(btn("Show in chat", true, () => showInChat(it.approval)));
      if (it.commitment) {
        const c = it.commitment, ids = [c.id, ...(it.also || [])], lock = () => row.querySelectorAll("button").forEach(b => b.disabled = true);
        row.append(btn("Done", false, () => { lock(); patch(ids, { status: "done", completed_at: new Date().toISOString(), next_nudge_at: null }); }),
                   btn("Tomorrow", true, () => { lock(); const t = tomorrowMorning().toISOString(); patch(ids, { next_nudge_at: t, due_at: t, due_is_soft: true }); }));
      }
      if (row.childElementCount) card.append(row);
      list.append(card);
    }
  }

  async function load() {
    const [h, a, c] = await Promise.all([
      sb.from("health").select("component, ok, detail, checked_at"),
      sb.from("approvals").select("id, title, summary, status, expires_at").in("status", ["pending", "effect_unknown"]),
      sb.from("commitments").select("id, title, direction, status, due_at, next_nudge_at, counterparty_text, important")
        .in("status", ["open", "slipped"]),
    ]);
    if (h.error || a.error || c.error) return;
    items = build(h.data || [], a.data || [], c.data || []);
    draw();
  }

  let started = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (!session || started || ev !== "SIGNED_IN" && ev !== "INITIAL_SESSION") return;
    started = true; open.hidden = false;
    load();
    setInterval(load, 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  });
})();
