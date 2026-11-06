/* Holiday's shared family list.
   - List button in the header opens a sheet: open items grouped by list, tap to tick off,
     type to add. Holiday adds to the same list when Gavin says "add diapers" in chat.
   - Ticked items stay in the brain as done (nothing is ever removed); tapping it again brings it back.
   Uses `sb` from index.html. */
(() => {
  const css = `
  .ls-back { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 40; display: flex; align-items: flex-end; justify-content: center; }
  .ls { background: var(--bg); width: 100%; max-width: 560px; max-height: 82vh; border-radius: 20px 20px 0 0;
    padding: 14px 16px calc(14px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 10px; }
  .ls-head { display: flex; align-items: center; justify-content: space-between; }
  .ls-head b { font-size: 18px; }
  .ls-body { overflow-y: auto; display: flex; flex-direction: column; gap: 12px; -webkit-overflow-scrolling: touch; }
  .ls-group h3 { margin: 0 0 4px; font-size: 12px; font-weight: 650; letter-spacing: .4px; text-transform: uppercase; color: var(--muted); }
  .ls-item { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--ring); cursor: pointer; }
  .ls-item i { width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--ring); flex: none; }
  .ls-item small { color: var(--muted); margin-left: auto; }
  .ls-item.done { opacity: .5; text-decoration: line-through; }
  .ls-item.done i { background: var(--accent); border-color: var(--accent); }
  .ls-empty { color: var(--muted); text-align: center; padding: 18px 0; }
  .ls-add { display: flex; gap: 8px; }
  .ls-add input { flex: 1; min-width: 0; border: 1px solid var(--ring); background: var(--surface); border-radius: 12px; padding: 10px 12px; outline: none; }
  .ls-add input:focus { border-color: var(--accent); }
  .ls-add .btn { padding: 10px 14px; }
  #listBtn .ls-count { position: absolute; top: -2px; right: -2px; background: var(--accent); color: #fff; border-radius: 999px;
    font-size: 11px; font-weight: 700; min-width: 17px; height: 17px; line-height: 17px; text-align: center; padding: 0 4px; }
  #listBtn { position: relative; }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  const btn = el("button", "icon-btn"); btn.id = "listBtn"; btn.hidden = true;
  btn.setAttribute("aria-label", "Family list"); btn.title = "Family list";
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" })) svg.setAttribute(k, v);
  for (const d of ["M9 6h11M9 12h11M9 18h11", "m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"]) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); svg.appendChild(p); }
  btn.appendChild(svg);
  const count = el("span", "ls-count"); count.hidden = true; btn.appendChild(count);
  const bar = document.getElementById("voiceToggle").parentElement; bar.insertBefore(btn, bar.firstChild);

  let items = new Map();       // id -> row (open, plus ones ticked while the sheet is open)
  let sheet = null;

  async function load() {
    const { data, error } = await sb.from("list_items").select("id,list,text,qty,status,created_at")
      .eq("status", "open").order("created_at");
    if (error) throw error;
    const keep = [...items.values()].filter(r => r.status === "done" && sheet);
    items = new Map(data.concat(keep).map(r => [r.id, r]));
    paint();
  }
  function paint() {
    const open = [...items.values()].filter(r => r.status === "open").length;
    count.textContent = open; count.hidden = !open;
    if (!sheet) return;
    const body = sheet.querySelector(".ls-body"); body.textContent = "";
    const groups = {};
    for (const r of items.values()) if (r.status !== "removed") (groups[r.list] = groups[r.list] || []).push(r);
    const names = Object.keys(groups).sort((a, b) => (a === "shopping" ? -1 : b === "shopping" ? 1 : a.localeCompare(b)));
    if (!names.length) body.appendChild(el("div", "ls-empty", 'Nothing on the list. Add something here, or tell Holiday "add diapers".'));
    for (const n of names) {
      const g = el("div", "ls-group"); g.appendChild(el("h3", null, n));
      for (const r of groups[n]) {
        const row = el("div", "ls-item" + (r.status === "done" ? " done" : ""));
        row.appendChild(el("i")); row.appendChild(el("span", null, r.text));
        if (r.qty) row.appendChild(el("small", null, r.qty));
        row.onclick = () => toggle(r);
        g.appendChild(row);
      }
      body.appendChild(g);
    }
  }
  async function toggle(r) {
    const done = r.status === "open";
    const fields = done ? { status: "done", done_at: new Date().toISOString() } : { status: "open", done_at: null };
    const { data, error } = await sb.from("list_items").update(fields).eq("id", r.id).select().single();
    if (!error) { items.set(r.id, data); paint(); }
  }
  async function add(text, list) {
    text = text.trim(); if (!text) return;
    const { data, error } = await sb.from("list_items").insert({ text: text.slice(0, 120), list }).select().single();
    if (!error) { items.set(data.id, data); paint(); }
  }
  function open() {
    if (sheet) return;
    const back = el("div", "ls-back"); const box = el("div", "ls");
    box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Family list");
    const head = el("div", "ls-head"); head.appendChild(el("b", null, "Family list"));
    const close = el("button", "pill ghost", "Done"); head.appendChild(close);
    const form = el("form", "ls-add");
    const input = el("input"); input.placeholder = "Add to shopping"; input.enterKeyHint = "done";
    const go = el("button", "btn", "Add"); form.append(input, go);
    form.onsubmit = e => { e.preventDefault(); add(input.value, "shopping"); input.value = ""; };
    box.append(head, el("div", "ls-body"), form); back.appendChild(box);
    back.onclick = e => { if (e.target === back) shut(); };
    close.onclick = shut;
    document.body.appendChild(back); sheet = back;
    paint(); load().catch(() => {});
  }
  function shut() {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    for (const [id, r] of items) if (r.status !== "open") items.delete(id);
    paint();
  }
  btn.onclick = open;

  let started = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (!session || started || ev !== "SIGNED_IN" && ev !== "INITIAL_SESSION") return;
    started = true; btn.hidden = false;
    load().catch(() => {});
    sb.channel("holiday-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "list_items" }, p => {
        const r = p.new;
        if (!r || !r.id) return;
        if (r.status === "open" || (sheet && items.has(r.id))) items.set(r.id, r); else items.delete(r.id);
        paint();
      })
      .subscribe();
  });
})();
