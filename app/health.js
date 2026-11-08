/* Holiday's self-check in the app.
   The PC writes one row per part in `health` (holiday_health.py). This shows a small banner
   above the chat while anything is broken, and when the chat worker's heartbeat goes stale,
   which is the one problem the PC can't announce itself.
   It also shows which mode she's in under her name (master plan Phase 3, step 1), so she never
   seems able to do more than she can right now.
   Uses `sb` and `log` from index.html. */
(() => {
  const STALE_MS = 3 * 60 * 1000;  // heartbeat is every minute
  const css = `
  .hl { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 0; padding: 9px 12px;
    background: var(--accent-soft); color: var(--text); border-radius: 14px; font-size: 14px; line-height: 1.35; }
  .hl b { font-weight: 650; }
  .mode { display: inline-block; margin-top: 2px; font-size: 12px; color: var(--muted); }
  .mode[data-level="warn"] { color: var(--amber); }
  .mode[data-level="down"] { color: var(--accent); }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const box = document.createElement("div"); box.className = "hl"; box.hidden = true;
  box.setAttribute("role", "status");
  log.parentElement.insertBefore(box, log);

  const mode = document.createElement("div"); mode.className = "mode"; mode.id = "mode";
  mode.setAttribute("aria-live", "polite"); mode.hidden = true;
  document.getElementById("status").insertAdjacentElement("afterend", mode);

  /* One line on what she can do right now. Read from the same rows as the banner. */
  function modeOf() {
    const chat = rows.get("chat"), writer = rows.get("writer"), google = rows.get("google");
    if (!chat) return null;
    if (Date.now() - new Date(chat.checked_at).getTime() > STALE_MS)
      return ["down", "Offline · your messages wait for the PC"];
    const w = writer && !writer.ok ? (writer.detail || "") : "";
    if (/holding/i.test(w)) return ["down", "No brain answering · holding your messages"];
    if (/local backup brain/i.test(w)) return ["warn", "Backup brain · short memory, no drafts or reminders"];
    if (google && !google.ok) return ["warn", "Connected · can't see mail or calendar"];
    if (/codex/i.test(w)) return ["ok", "Connected · Codex is thinking for her"];
    return ["ok", "Connected"];
  }

  const NAMES = { voice: "Voice", writer: "Thinking", google: "Google", calendar_adds: "Adding events",
                  brief: "Morning brief", wrap: "Evening wrap" };
  let rows = new Map();

  function render() {
    const lines = [];
    const chat = rows.get("chat");
    if (chat && Date.now() - new Date(chat.checked_at).getTime() > STALE_MS) {
      lines.push(["Offline", "Holiday isn't running on the PC right now. Messages will wait until she's back."]);
    }
    for (const r of rows.values()) {
      if (!r.ok && r.component !== "chat") lines.push([NAMES[r.component] || r.component, r.detail || "Not working."]);
    }
    box.replaceChildren(...lines.map(([name, text]) => {
      const d = document.createElement("div"); const b = document.createElement("b");
      b.textContent = name + ": "; d.append(b, text); return d;
    }));
    box.hidden = !lines.length;
    const m = modeOf();
    mode.hidden = !m;
    if (m) { mode.dataset.level = m[0]; mode.textContent = m[1]; }
  }

  async function load() {
    const { data, error } = await sb.from("health").select("component, ok, detail, checked_at");
    if (error || !data) return;
    rows = new Map(data.map(r => [r.component, r])); render();
  }

  let started = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (!session || started || ev !== "SIGNED_IN" && ev !== "INITIAL_SESSION") return;
    started = true;
    load();
    sb.channel("holiday-health")
      .on("postgres_changes", { event: "*", schema: "public", table: "health" }, p => {
        if (p.new && p.new.component) { rows.set(p.new.component, p.new); render(); }
      })
      .subscribe();
    setInterval(render, 30 * 1000);  // notice a stale heartbeat even with no new rows
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  });
})();
