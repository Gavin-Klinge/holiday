/* "What she knows": Gavin can read, fix or remove what Holiday keeps about him.
   - Memories (`memories`): edit the text, or Forget (status 'archived').
   - Promises (`commitments` still proposed, open or slipped): Done, edit the wording or date, or Drop.
   - Routines (`routines`): edit the title or notes, or Remove (status 'archived').
   Nothing is deleted outright: every removal is a status change with Undo, and can be brought back
   from the brain. Also holds the appearance switch and Sign out.
   Uses `sb` and `store` from index.html. */
(() => {
  const css = `
  .kn { position: fixed; inset: 0; z-index: 20; background: var(--bg); display: flex; flex-direction: column;
    transform: translateY(100%); transition: transform .3s cubic-bezier(.2,.8,.2,1); visibility: hidden; }
  .kn.open { transform: none; visibility: visible; }
  .kn-in { display: flex; flex-direction: column; height: 100%; width: 100%; max-width: 560px; margin: 0 auto;
    padding: calc(env(safe-area-inset-top) + 10px) 16px 0; }
  .kn-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kn-head h2 { margin: 0; font-size: 22px; font-weight: 700; }
  .kn-sub { color: var(--muted); font-size: 14px; margin: 2px 0 10px; }
  .seg { display: flex; background: var(--surface-2); border-radius: 12px; padding: 3px; gap: 2px; }
  .seg button { flex: 1; border: 0; background: none; border-radius: 9px; padding: 8px 6px; font-size: 14px; font-weight: 600;
    color: var(--muted); cursor: pointer; }
  .seg button[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
  .seg button span { font-weight: 500; opacity: .7; margin-left: 3px; }
  .kn-list { flex: 1; overflow-y: auto; padding: 12px 2px; display: flex; flex-direction: column; gap: 10px;
    -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
  .kn-group { font-size: 12px; font-weight: 650; letter-spacing: .4px; text-transform: uppercase; color: var(--muted); margin: 6px 2px -2px; }
  .kn-item { background: var(--surface); border-radius: 16px; padding: 11px 13px; box-shadow: var(--shadow);
    display: flex; flex-direction: column; gap: 5px; }
  .kn-top { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .chip { font-size: 11px; font-weight: 650; letter-spacing: .3px; text-transform: uppercase; color: var(--accent);
    background: var(--accent-soft); border-radius: 999px; padding: 2px 8px; }
  .chip.soft { color: var(--muted); background: var(--surface-2); }
  .kn-title { font-weight: 620; }
  .kn-text { white-space: pre-wrap; word-wrap: break-word; }
  .kn-meta { color: var(--muted); font-size: 14px; }
  .kn-quote { color: var(--muted); font-size: 14px; font-style: italic; border-left: 3px solid var(--ring); padding-left: 8px; }
  .kn-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 3px; }
  .kn-row .btn { padding: 7px 13px; font-size: 14px; min-height: 36px; }
  .kn-item textarea, .kn-item input { width: 100%; border: 1px solid var(--ring); background: var(--bg); border-radius: 10px;
    padding: 8px 10px; outline: none; font-size: 16px; }
  .kn-item textarea { min-height: 70px; resize: vertical; }
  .kn-item textarea:focus, .kn-item input:focus { border-color: var(--accent); }
  .kn-item label { font-size: 13px; color: var(--muted); }
  .kn-empty { color: var(--muted); text-align: center; padding: 40px 12px; }
  .kn-foot { border-top: 1px solid var(--ring); padding: 10px 0 calc(10px + env(safe-area-inset-bottom));
    display: flex; align-items: center; gap: 10px; }
  .kn-foot .seg { flex: 1; }
  .kn-foot #signOut { width: auto; padding: 0 14px; border-radius: 12px; font-size: 14px; font-weight: 600; gap: 6px;
    display: flex; align-items: center; }
  .kn-foot #signOut svg { width: 17px; height: 17px; }
  .toast { position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); transform: translate(-50%, 20px);
    z-index: 30; background: var(--text); color: var(--bg); border-radius: 14px; padding: 10px 10px 10px 16px;
    display: flex; gap: 12px; align-items: center; font-size: 15px; opacity: 0; pointer-events: none;
    transition: opacity .2s, transform .2s; width: max-content; max-width: calc(100% - 32px); }
  .toast.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
  .toast button { border: 0; background: none; color: var(--accent-soft); font-weight: 700; padding: 4px 8px; cursor: pointer; }
  @media (prefers-reduced-motion: reduce) { .kn, .toast { transition: none; } }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, alt, fn) { const b = el("button", alt ? "btn alt" : "btn", label); b.onclick = fn; return b; }

  /* ---------------- shell ---------------- */
  const open = el("button", "icon-btn"); open.id = "knowsBtn"; open.hidden = true;
  open.setAttribute("aria-label", "What she knows"); open.title = "What she knows";
  open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>';
  document.getElementById("voiceToggle").after(open);

  const sheet = el("section", "kn"); sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "What she knows");
  sheet.innerHTML = `<div class="kn-in">
    <div class="kn-head"><h2>What she knows</h2>
      <button class="icon-btn" id="knClose" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="kn-sub">Fix anything she has wrong, or tell her to let it go.</div>
    <div class="seg" role="tablist" id="knTabs">
      <button role="tab" data-tab="memories">Memories<span></span></button>
      <button role="tab" data-tab="promises">Promises<span></span></button>
      <button role="tab" data-tab="routines">Routines<span></span></button>
    </div>
    <div class="kn-list" id="knList"></div>
    <div class="kn-foot">
      <div class="seg" id="themeSeg" aria-label="Appearance">
        <button data-theme="auto">Auto</button><button data-theme="light">Light</button><button data-theme="dark">Dark</button>
      </div>
    </div></div>`;
  document.body.appendChild(sheet);
  const list = sheet.querySelector("#knList");
  // Sign out lives here now, so the header has room.
  const signOut = document.getElementById("signOut");
  signOut.insertAdjacentHTML("beforeend", "Sign out");
  sheet.querySelector(".kn-foot").appendChild(signOut);

  let tab = store.get("knowsTab", "memories");
  open.onclick = () => { sheet.classList.add("open"); load(); };
  sheet.querySelector("#knClose").onclick = () => sheet.classList.remove("open");
  sheet.querySelector("#knTabs").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    tab = b.dataset.tab; store.set("knowsTab", tab); draw();
  };

  /* ---------------- appearance ---------------- */
  const metaLight = document.querySelector('meta[name="theme-color"][media*="light"]');
  const metaDark = document.querySelector('meta[name="theme-color"][media*="dark"]');
  function applyTheme(t) {
    const root = document.documentElement;
    if (t === "light" || t === "dark") root.dataset.theme = t; else delete root.dataset.theme;
    // Keep the iPhone status bar matching what's on screen.
    const color = t === "dark" ? "#1b1714" : t === "light" ? "#f6efe7" : null;
    metaLight.content = color || "#f6efe7"; metaDark.content = color || "#1b1714";
    for (const b of sheet.querySelectorAll("#themeSeg button")) b.setAttribute("aria-selected", String(b.dataset.theme === t));
  }
  applyTheme(store.get("theme", "auto"));
  sheet.querySelector("#themeSeg").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    store.set("theme", b.dataset.theme); applyTheme(b.dataset.theme);
  };

  /* ---------------- undo toast ---------------- */
  const toast = el("div", "toast"); toast.setAttribute("role", "status"); document.body.appendChild(toast);
  let toastTimer = null;
  function showToast(text, undo) {
    toast.replaceChildren(el("span", null, text));
    if (undo) { const u = el("button", null, "Undo"); u.onclick = async () => { toast.classList.remove("on"); await undo(); }; toast.append(u); }
    toast.classList.add("on"); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("on"), 6000);
  }

  /* ---------------- data ---------------- */
  const data = { memories: [], promises: [], routines: [] };
  const TABLE = { memories: "memories", promises: "commitments", routines: "routines" };
  async function load() {
    const [m, c, r] = await Promise.all([
      sb.from("memories").select("id,kind,subject,content,pinned,status,created_at").eq("status", "active")
        .order("pinned", { ascending: false }).order("created_at", { ascending: false }),
      sb.from("commitments").select("id,direction,title,details,counterparty_text,due_at,due_is_soft,next_nudge_at,completed_at,status,source,source_quote,created_at")
        .in("status", ["proposed", "open", "slipped"]).order("due_at", { ascending: true, nullsFirst: false }),
      sb.from("routines").select("id,topic,title,who,days,starts_at,ends_at,otherwise,otherwise_who,notes,status")
        .neq("status", "archived").order("topic"),
    ]);
    const err = m.error || c.error || r.error;
    if (err) { list.replaceChildren(el("div", "kn-empty", "Couldn't load: " + err.message)); return; }
    data.memories = m.data; data.promises = c.data; data.routines = r.data;
    draw();
  }
  async function save(kind, id, fields) {
    const { data: row, error } = await sb.from(TABLE[kind]).update(fields).eq("id", id).select().single();
    if (error) { alert("That didn't go through: " + error.message); return null; }
    return row;
  }
  // Takes an item off the list now; Undo puts the old status back.
  async function remove(kind, item, fields, said) {
    const before = {}; for (const k in fields) before[k] = item[k] === undefined ? null : item[k];
    if (!(await save(kind, item.id, fields))) return;
    data[kind] = data[kind].filter(x => x.id !== item.id); draw();
    showToast(said, async () => { if (await save(kind, item.id, before)) load(); });
  }

  /* ---------------- drawing ---------------- */
  const DAYS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  const KIND = { fact: "Fact", preference: "Likes", person: "Person", routine: "Routine", decision: "Decision", lesson: "Lesson" };
  function time(t) { if (!t) return ""; const [h, m] = t.split(":"); const d = new Date(); d.setHours(+h, +m); return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  function due(c) {
    if (!c.due_at) return "No date";
    const d = new Date(c.due_at), late = d < new Date() ? " · late" : "";
    const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return (c.due_is_soft ? day : `${day}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`) + late;
  }
  function localDate(iso) { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

  function memoryCard(m) {
    const card = el("div", "kn-item"), top = el("div", "kn-top");
    top.append(el("span", "chip", KIND[m.kind] || m.kind));
    if (m.pinned) top.append(el("span", "chip soft", "Pinned"));
    if (m.subject) top.append(el("span", "kn-meta", m.subject));
    const text = el("div", "kn-text", m.content);
    const row = el("div", "kn-row");
    row.append(
      btn("Fix", true, () => edit(card, [["content", "What she should remember", m.content, "textarea"]], async v => {
        const r = await save("memories", m.id, v); if (r) Object.assign(m, r); draw();
      })),
      btn("Forget", true, () => remove("memories", m, { status: "archived" }, "She'll forget that.")));
    card.append(top, text, row);
    return card;
  }
  function promiseCard(c) {
    const card = el("div", "kn-item"), top = el("div", "kn-top");
    top.append(el("span", "chip" + (c.status === "slipped" ? "" : " soft"), c.status === "slipped" ? "Slipped" : c.status === "proposed" ? "Not confirmed" : due(c)));
    if (c.status !== "open") top.append(el("span", "kn-meta", due(c)));
    card.append(top, el("div", "kn-title", c.title));
    if (c.counterparty_text) card.append(el("div", "kn-meta", (c.direction === "i_owe" ? "For " : "From ") + c.counterparty_text));
    if (c.source_quote) card.append(el("div", "kn-quote", "“" + c.source_quote + "”"));
    const row = el("div", "kn-row");
    if (c.status === "proposed") row.append(btn("Keep it", false, async () => { const r = await save("promises", c.id, { status: "open" }); if (r) { Object.assign(c, r); draw(); } }));
    else row.append(btn("Done", false, () => remove("promises", c, { status: "done", completed_at: new Date().toISOString(), next_nudge_at: null }, "Marked done.")));
    row.append(
      btn("Fix", true, () => edit(card, [["title", "What it is", c.title, "textarea"], ["due", "Due date", c.due_at ? localDate(c.due_at) : "", "date"]], async v => {
        const fields = { title: v.title };
        if (v.due !== (c.due_at ? localDate(c.due_at) : "")) {
          // A date picked here is a soft, whole-day date; the nudge moves with it.
          const d = v.due ? new Date(v.due + "T09:00:00") : null;
          Object.assign(fields, { due_at: d && d.toISOString(), due_is_soft: true, next_nudge_at: d && d.toISOString() });
        }
        const r = await save("promises", c.id, fields); if (r) Object.assign(c, r); draw();
      })),
      btn("Drop", true, () => remove("promises", c, { status: "dropped", next_nudge_at: null }, "Dropped.")));
    card.append(row);
    return card;
  }
  function routineCard(r) {
    const card = el("div", "kn-item"), top = el("div", "kn-top");
    const days = (r.days || []).map(d => DAYS[d] || d).join(", ");
    if (days) top.append(el("span", "chip soft", days));
    if (r.starts_at) top.append(el("span", "kn-meta", time(r.starts_at) + (r.ends_at ? "–" + time(r.ends_at) : "")));
    card.append(top, el("div", "kn-title", r.title));
    const who = [r.who && "Who: " + r.who, r.otherwise && "Otherwise: " + r.otherwise + (r.otherwise_who ? " (" + r.otherwise_who + ")" : "")].filter(Boolean).join(" · ");
    if (who) card.append(el("div", "kn-meta", who));
    if (r.notes) card.append(el("div", "kn-text kn-meta", r.notes));
    const row = el("div", "kn-row");
    row.append(
      btn("Fix", true, () => edit(card, [["title", "Routine", r.title, "textarea"], ["notes", "Notes", r.notes || "", "textarea"]], async v => {
        const x = await save("routines", r.id, { title: v.title, notes: v.notes || null }); if (x) Object.assign(r, x); draw();
      })),
      btn("Remove", true, () => remove("routines", r, { status: "archived" }, "Routine removed.")));
    card.append(row);
    return card;
  }
  // Swaps a card's contents for a small form; fields are [key, label, value, "textarea"|"date"].
  function edit(card, fields, onSave) {
    const inputs = {};
    card.replaceChildren(...fields.flatMap(([key, label, value, type]) => {
      const lab = el("label", null, label);
      const inp = type === "textarea" ? el("textarea") : Object.assign(el("input"), { type });
      inp.value = value; inputs[key] = inp; return [lab, inp];
    }));
    const row = el("div", "kn-row");
    const ok = btn("Save", false, async () => {
      const v = {}; for (const k in inputs) v[k] = inputs[k].value.trim();
      if (fields[0][3] === "textarea" && !v[fields[0][0]]) { inputs[fields[0][0]].focus(); return; }
      ok.disabled = true; await onSave(v);
    });
    row.append(ok, btn("Cancel", true, draw));
    card.append(row);
    const first = card.querySelector("textarea, input"); first.focus();
  }

  function draw() {
    for (const b of sheet.querySelectorAll("#knTabs button")) {
      b.setAttribute("aria-selected", String(b.dataset.tab === tab));
      b.querySelector("span").textContent = data[b.dataset.tab].length || "";
    }
    const items = data[tab];
    if (!items.length) {
      list.replaceChildren(el("div", "kn-empty", { memories: "She hasn't saved any memories yet. Tell her “remember that…” in chat.",
        promises: "No open promises. Nice.", routines: "No routines yet. Say “routines interview” to set them up." }[tab]));
      return;
    }
    if (tab === "memories") list.replaceChildren(...items.map(memoryCard));
    else if (tab === "routines") list.replaceChildren(...items.map(routineCard));
    else {
      const mine = items.filter(c => c.direction !== "owed_to_me"), theirs = items.filter(c => c.direction === "owed_to_me");
      const out = [];
      if (mine.length) out.push(el("div", "kn-group", "You promised"), ...mine.map(promiseCard));
      if (theirs.length) out.push(el("div", "kn-group", "Waiting on others"), ...theirs.map(promiseCard));
      list.replaceChildren(...out);
    }
  }

  let started = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (!session || started || ev !== "SIGNED_IN" && ev !== "INITIAL_SESSION") return;
    started = true; open.hidden = false;
  });
  // Opening the app at #knows goes straight here.
  if (location.hash === "#knows") sb.auth.getSession().then(({ data: d }) => { if (d.session) open.click(); });
})();
