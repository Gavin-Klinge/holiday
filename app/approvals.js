/* Holiday's drafts: emails and calendar events waiting for Gavin's OK.
   Holiday's PC worker saves each draft as a pending row in `approvals` and links it from
   her chat reply (related.approval_ids). This shows each one as a card under that reply.
   - Email from his own address: "Send it" approves it and Holiday's PC sends it. Mail for
     another account: "Send from my mail" opens his own mail app and he presses Send there.
   - Event: "Add it" / "Move it" approves it and Holiday's PC changes his calendar.
     Emails and events wait HOLD_S seconds after the tap, with Undo (status 'cancelled').
     For a day after an event is added or moved, Undo adds an approved 'undo' row.
   - PC action (type, click, read a file): "Do it" approves it and Holiday's PC does it.
   Uses `sb` and `log` from index.html. */
(() => {
  const css = `
  .ap { align-self: stretch; margin: -2px 0 2px; background: var(--surface); border: 1px solid var(--ring);
    border-radius: 16px; padding: 11px 13px; display: flex; flex-direction: column; gap: 7px; }
  .ap-kind { font-size: 12px; font-weight: 650; letter-spacing: .4px; text-transform: uppercase; color: var(--muted); }
  .ap-title { font-weight: 620; }
  .ap-meta { color: var(--muted); font-size: 14px; }
  .ap textarea { width: 100%; min-height: 96px; resize: vertical; border: 1px solid var(--ring); background: var(--bg);
    border-radius: 12px; padding: 9px 11px; outline: none; }
  .ap textarea:focus { border-color: var(--accent); }
  .ap textarea[readonly] { border-color: transparent; background: transparent; padding: 0; min-height: 0; resize: none; }
  .ap-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .ap-row .btn { padding: 9px 14px; font-size: 15px; }
  .ap-link { color: var(--muted); font-size: 14px; background: none; border: 0; padding: 4px 2px; cursor: pointer; text-decoration: underline; }
  .ap-state { font-size: 14px; color: var(--muted); }
  .ap[data-status="executed"] .ap-state { color: var(--accent); font-weight: 600; }
  .ap[data-status="rejected"], .ap[data-status="expired"] { opacity: .6; }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const cards = new Map();  // approval id -> card element
  const latest = new Map();  // approval id -> newest row, for the countdown
  const HOLD_S = 30, UNDO_H = 24;  // match holiday_actions.py
  const isIOS = /iP(hone|ad|od)/.test(navigator.platform) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
  const STATE = {
    email_pending: "", event_pending: "",
    email_approved: "Opening your mail…", event_approved: "Adding it to your calendar…",
    email_executed: "Opened in your mail. Hit Send there.", event_executed: "On your calendar.",
    send_approved: "Sending…", send_executed: "Sent.", move_approved: "Moving it…", move_executed: "Moved.",
    email_rejected: "Skipped.", event_rejected: "Skipped.",
    email_expired: "Replaced by a newer draft.", event_expired: "Replaced by a newer draft.",
    email_cancelled: "Undone. Nothing went out.", event_cancelled: "Undone. Nothing changed.",
    pc_pending: "", pc_approved: "Doing it on your PC…", pc_executed: "Done on your PC.",
    pc_rejected: "Skipped.", pc_expired: "Expired.",
  };
  const isEmail = a => a.kind === "email_new" || a.kind === "email_reply";
  const isPC = a => a.kind === "pc_action";

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function addrOnly(to) { const m = /<([^>]+)>/.exec(to); return (m ? m[1] : to).trim(); }

  function composeUrl(p) {
    const q = (k, v) => `${k}=${encodeURIComponent(v || "")}`;
    const to = addrOnly(p.to);
    if (isIOS) return `googlegmail:///co?${q("to", to)}&${q("subject", p.subject)}&${q("body", p.body)}`;
    return `https://mail.google.com/mail/?view=cm&fs=1&${q("to", to)}&${q("su", p.subject)}&${q("body", p.body)}`;
  }
  function mailtoUrl(p) {
    return `mailto:${encodeURIComponent(addrOnly(p.to))}?subject=${encodeURIComponent(p.subject || "")}&body=${encodeURIComponent(p.body || "")}`;
  }
  function openMail(p) {
    const url = composeUrl(p);
    if (!isIOS) { window.open(url, "_blank"); return; }
    // No Gmail app on the phone: fall back to the default mail app.
    const t = setTimeout(() => { if (!document.hidden) location.href = mailtoUrl(p); }, 1200);
    document.addEventListener("visibilitychange", () => clearTimeout(t), { once: true });
    location.href = url;
  }
  function calendarUrl(p) {
    const fmt = s => s.replace(/[-:]/g, "").slice(0, p.all_day ? 8 : 15);
    const u = new URL("https://calendar.google.com/calendar/render");
    u.searchParams.set("action", "TEMPLATE"); u.searchParams.set("text", p.title);
    u.searchParams.set("dates", fmt(p.start) + "/" + fmt(p.end));
    if (!p.all_day) u.searchParams.set("ctz", p.timezone);
    if (p.location) u.searchParams.set("location", p.location);
    if (p.notes) u.searchParams.set("details", p.notes);
    return u.toString();
  }

  async function setStatus(a, status) {
    const { data, error } = await sb.from("approvals").update({ status }).eq("id", a.id).select().single();
    if (error) { alert("That didn't go through: " + error.message); return null; }
    return data;
  }

  // Seconds left before Holiday carries out an approved email or event (0 when it's due).
  function holdLeft(a) {
    if (a.status !== "approved" || !a.decided_at || isPC(a) || (isEmail(a) && !(a.payload || {}).send)) return 0;
    return Math.max(0, Math.ceil(HOLD_S - (Date.now() - Date.parse(a.decided_at)) / 1000));
  }
  function canUndoAfter(a) {
    const p = a.payload || {}, r = a.result || {};
    return a.kind === "calendar_change" && a.status === "executed" && (p.action === "create" || p.action === "move")
      && !r.undone && (r.event_id !== undefined || r.moved === true)
      && Date.now() - Date.parse(a.executed_at) < UNDO_H * 3600e3;
  }
  async function undoAfter(a, btn) {
    btn.disabled = true; btn.textContent = "Undoing…";
    const { error } = await sb.from("approvals").insert({
      kind: "calendar_change", title: "Undo: " + a.title, status: "approved", payload: { action: "undo", of: a.id } });
    if (error) { alert("Couldn't undo: " + error.message); btn.disabled = false; btn.textContent = "Undo"; }
  }

  function render(a) {
    const old = cards.get(a.id);
    latest.set(a.id, a);
    const card = el("div", "ap"); card.dataset.status = a.status; card.dataset.id = a.id;
    const p = a.payload || {}, email = isEmail(a), pc = isPC(a), send = email && p.send, move = p.action === "move";
    const key = (send && a.status in { approved: 1, executed: 1 } ? "send_" : move && a.status in { approved: 1, executed: 1 } ? "move_"
      : email ? "email_" : pc ? "pc_" : "event_") + a.status;
    card.append(el("div", "ap-kind", email ? (a.kind === "email_reply" ? "Reply draft" : "Email draft") : pc ? "On your PC" : move ? "Move event" : "New event"));
    card.append(el("div", "ap-title", email ? `To ${p.to}` : a.title));
    if (move) card.append(el("div", "ap-meta", a.summary || ""));
    if (email) card.append(el("div", "ap-meta", p.subject || "(no subject)"));
    else if (pc) {
      card.append(el("div", "ap-meta", a.summary || ""));
      if (p.action === "type") { const t = el("textarea"); t.value = p.text || ""; t.readOnly = true; card.append(t); }
      if (p.action === "read_file") card.append(el("div", "ap-meta", "She'll read it to answer you. The text goes to her AI, nowhere else."));
    }
    else if (!move && (p.location || p.notes)) card.append(el("div", "ap-meta", [p.location, p.notes].filter(Boolean).join(" · ")));
    let body = null;
    if (email) {
      body = el("textarea"); body.value = p.body || ""; body.readOnly = a.status !== "pending";
      body.setAttribute("aria-label", "Email text, you can edit it");
      card.append(body);
    }
    const row = el("div", "ap-row");
    if (a.status === "pending") {
      const yes = el("button", "btn", send ? "Send it" : email ? "Send from my mail" : pc ? "Do it" : move ? "Move it" : "Add it");
      const no = el("button", "btn alt", "Not now");
      yes.onclick = async () => {
        yes.disabled = no.disabled = true;
        if (send) {  // Holiday sends it after the Undo window; his edits are what gets approved
          const payload = { ...p, body: body.value.trim() };
          if (payload.body !== p.body) {
            const { error } = await sb.from("approvals").update({ payload }).eq("id", a.id);
            if (error) { alert("Couldn't save your edit: " + error.message); yes.disabled = no.disabled = false; return; }
          }
          const ok = await setStatus(a, "approved"); if (ok) update(ok);
        } else if (email) {
          const payload = { ...p, body: body.value.trim() };
          openMail(payload);  // first, straight from the tap, so the phone allows it
          if (payload.body !== p.body) {  // his edits are what gets approved
            const { error } = await sb.from("approvals").update({ payload }).eq("id", a.id);
            if (error) { alert("Couldn't save your edit: " + error.message); yes.disabled = no.disabled = false; return; }
          }
          const ok = await setStatus(a, "approved");
          if (ok) update(await setStatus(ok, "executed") || ok);
        } else {
          const ok = await setStatus(a, "approved"); if (ok) update(ok);
        }
      };
      no.onclick = async () => { yes.disabled = no.disabled = true; const r = await setStatus(a, "rejected"); if (r) update(r); };
      row.append(yes, no);
    } else if (holdLeft(a) > 0) {
      const left = holdLeft(a);
      row.append(el("span", "ap-state", `${send ? "Sending" : move ? "Moving it" : "Adding it"} in ${left}s`));
      const undo = el("button", "btn alt", "Undo");
      undo.onclick = async () => { undo.disabled = true; const r = await setStatus(a, "cancelled"); if (r) update(r); };
      row.append(undo);
      setTimeout(() => { const cur = latest.get(a.id); if (cur && cur.status === "approved") update(cur); }, 1000);
    } else {
      const r = a.result || {};
      row.append(el("span", "ap-state", r.undone ? (move ? "Undone. It's back where it was." : "Undone. Taken off your calendar.") : STATE[key] || a.status));
      if (email && !send && a.status === "executed") {
        const again = el("button", "ap-link", "Open again"); again.onclick = () => openMail(p); row.append(again);
      }
      if (canUndoAfter(a)) { const u = el("button", "ap-link", "Undo"); u.onclick = () => undoAfter(a, u); row.append(u); }
    }
    if (!email && !pc && !move && a.status !== "executed" && a.status !== "rejected" && a.status !== "expired" && a.status !== "cancelled") {
      const link = el("a", "ap-link", "Open in Google Calendar"); link.href = calendarUrl(p); link.target = "_blank"; link.rel = "noopener";
      row.append(link);
    }
    card.append(row);
    if (old) old.replaceWith(card);
    cards.set(a.id, card);
    return card;
  }
  function update(a) { if (cards.has(a.id)) render(a); }

  async function fetchMany(ids) {
    const { data } = await sb.from("approvals").select("id,kind,title,summary,payload,status,created_at,decided_at,executed_at,result").in("id", ids);
    return data || [];
  }

  // Called by addMsg for each chat bubble, after it's in the log.
  async function attach(msgEl, m) {
    const ids = (m.related && m.related.approval_ids) || [];
    if (!ids.length) return;
    let after = msgEl;
    for (const a of (await fetchMany(ids)).sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id))) {
      if (cards.has(a.id)) continue;
      const card = render(a); after.after(card); after = card;
    }
    log.scrollTop = log.scrollHeight;
  }

  // Drafts still waiting whose reply isn't on screen (older history) go at the bottom.
  async function loadWaiting() {
    const { data } = await sb.from("approvals").select("id,kind,title,summary,payload,status,created_at,decided_at,executed_at,result")
      .eq("status", "pending").order("created_at");
    for (const a of data || []) if (!cards.has(a.id)) log.appendChild(render(a));
  }

  let started = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (!session || started || ev !== "SIGNED_IN" && ev !== "INITIAL_SESSION") return;
    started = true;
    setTimeout(loadWaiting, 1500);  // after the chat history is drawn
    sb.channel("holiday-approvals")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "approvals" }, p => update(p.new))
      .subscribe();
  });

  window.HolidayApprovals = { attach };
})();
