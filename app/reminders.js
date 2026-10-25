/* Holiday's reminders and phone pings.
   - Bell in the header: turns on pings (web push) on this phone. Holiday's PC sends them for
     reminders and for emails still waiting on Gavin; quiet hours are handled on the PC.
   - Reminder cards under her replies (related.reminder_ids when she sets one,
     related.reminder_due when it rings): Done, snooze, or cancel, straight in the brain.
   Uses `sb` and `log` from index.html. */
(() => {
  const css = `
  .rm { align-self: stretch; margin: -2px 0 2px; background: var(--surface); border: 1px solid var(--ring);
    border-radius: 16px; padding: 10px 13px; display: flex; flex-direction: column; gap: 6px; }
  .rm-kind { font-size: 12px; font-weight: 650; letter-spacing: .4px; text-transform: uppercase; color: var(--muted); }
  .rm-title { font-weight: 620; }
  .rm-meta { color: var(--muted); font-size: 14px; }
  .rm-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .rm-row .btn { padding: 8px 13px; font-size: 15px; }
  .rm[data-status="done"] .rm-meta { color: var(--accent); font-weight: 600; }
  .rm[data-status="dropped"] { opacity: .6; }
  #pingsBtn[aria-pressed="true"] { color: var(--accent); }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function note(body) { const n = el("div", "msg note", body); log.appendChild(n); log.scrollTop = log.scrollHeight; }

  /* ---------------- pings ---------------- */
  const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const btn = el("button", "icon-btn"); btn.id = "pingsBtn"; btn.hidden = true;
  btn.setAttribute("aria-label", "Pings on this phone"); btn.title = "Pings on this phone";
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const bar = document.getElementById("voiceToggle").parentElement; bar.insertBefore(btn, bar.firstChild);

  function keyBytes(b64) {
    const s = atob((b64 + "=".repeat((4 - b64.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }
  async function publicKey() {
    const { data } = await sb.from("settings").select("value").eq("key", "push_public_key").maybeSingle();
    return data && data.value;
  }
  async function save(sub) {
    const j = sub.toJSON();
    const { error } = await sb.from("push_subscriptions").upsert({
      endpoint: j.endpoint, p256dh: j.keys.p256dh, auth_secret: j.keys.auth, gone_at: null,
      device_label: /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : navigator.platform,
    }, { onConflict: "endpoint" });
    if (error) throw error;
  }
  async function subscribe(quietly) {
    const key = await publicKey();
    if (!key) { if (!quietly) note("Pings aren't ready yet: Holiday's PC sets them up the next time it starts."); return false; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey) {
      const had = new Uint8Array(sub.options.applicationServerKey), want = keyBytes(key);
      if (had.length !== want.length || had.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await save(sub);
    return true;
  }
  function show() { btn.setAttribute("aria-pressed", String(Notification.permission === "granted")); }
  btn.onclick = async () => {
    try {
      if (Notification.permission === "denied") { note("Pings are blocked. Turn them on in iPhone Settings, Notifications, Holiday."); return; }
      if (Notification.permission !== "granted" && await Notification.requestPermission() !== "granted") { show(); return; }
      if (await subscribe(false)) note("Pings are on. I'll nudge you for reminders and emails waiting on you, never between 9pm and 6am unless you set the time.");
    } catch (e) { note("Couldn't turn pings on: " + (e.message || e)); }
    show();
  };

  /* ---------------- reminder cards ---------------- */
  const cards = new Map();  // commitment id -> [card elements]
  const STATE = { done: "Done", dropped: "Cancelled" };
  function whenLabel(r) {
    const d = new Date(r.next_nudge_at || r.due_at);
    if (!r.next_nudge_at && !r.due_at) return "";
    const day = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    return r.due_is_soft && d.getHours() < 12 ? `${day}, morning` : `${day}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  async function patch(id, fields) {
    const { data, error } = await sb.from("commitments").update(fields).eq("id", id).select().single();
    if (error) { alert("That didn't go through: " + error.message); return; }
    update(data);
  }
  function tomorrowMorning() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(6, 45, 0, 0); return d; }

  function render(r, ringing) {
    const card = el("div", "rm"); card.dataset.status = r.status; card.dataset.id = r.id; card.dataset.ringing = ringing ? "1" : "";
    card.append(el("div", "rm-kind", "Reminder"), el("div", "rm-title", r.title));
    const open = r.status === "open" || r.status === "slipped";
    card.append(el("div", "rm-meta", open ? (r.next_nudge_at ? whenLabel(r) : "In your open loops until it's done") : STATE[r.status] || r.status));
    if (open) {
      const row = el("div", "rm-row");
      const b = (label, alt, fn) => { const x = el("button", alt ? "btn alt" : "btn", label); x.onclick = () => { row.querySelectorAll("button").forEach(y => y.disabled = true); fn(); }; row.append(x); };
      if (ringing || !r.next_nudge_at) {
        b("Done", false, () => patch(r.id, { status: "done", completed_at: new Date().toISOString(), next_nudge_at: null }));
        b("In an hour", true, () => patch(r.id, { next_nudge_at: new Date(Date.now() + 3600e3).toISOString(), due_is_soft: false }));
        b("Tomorrow", true, () => { const t = tomorrowMorning().toISOString(); patch(r.id, { next_nudge_at: t, due_at: t, due_is_soft: true }); });
      } else {
        b("Cancel", true, () => patch(r.id, { status: "dropped", next_nudge_at: null }));
      }
      card.append(row);
    }
    return card;
  }
  function update(r) {
    for (const old of cards.get(r.id) || []) {
      const fresh = render(r, old.dataset.ringing === "1"); old.replaceWith(fresh);
      cards.set(r.id, cards.get(r.id).map(c => c === old ? fresh : c));
    }
  }

  // Called by addMsg for each chat bubble, after it's in the log.
  async function attach(msgEl, m) {
    const rel = m.related || {};
    const ids = (rel.reminder_ids || []).concat(rel.reminder_due ? [rel.reminder_due] : []);
    if (!ids.length) return;
    const { data } = await sb.from("commitments").select("id,title,status,due_at,due_is_soft,next_nudge_at").in("id", ids);
    let after = msgEl;
    for (const r of (data || []).sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id))) {
      const card = render(r, r.id === rel.reminder_due);
      after.after(card); after = card;
      cards.set(r.id, (cards.get(r.id) || []).concat(card));
    }
    log.scrollTop = log.scrollHeight;
  }

  /* ---------------- iPhone Reminders link ----------------
     Open the app with #phone-reminders to make the private link the phone Shortcut uses.
     Only its hash is kept in the brain; making a new one turns the old one off. */
  const FEED = SUPABASE_URL + "/rest/v1/rpc/reminders_feed";
  function phoneSetup() {
    const card = el("div", "rm");
    card.append(el("div", "rm-kind", "iPhone Reminders"),
      el("div", "rm-meta", "Makes the private link your Shortcut uses. Making a new one turns off the old one."));
    const row = el("div", "rm-row"), go = el("button", "btn", "Make my link");
    row.append(go); card.append(row); log.appendChild(card); log.scrollTop = log.scrollHeight;
    go.onclick = async () => {
      go.disabled = true;
      const { data, error } = await sb.rpc("make_reminders_token");
      if (error) { alert("Couldn't make it: " + error.message); go.disabled = false; return; }
      row.replaceChildren();
      const parts = [["Token (paste into the Text step)", data], ["URL", FEED], ["apikey header", SUPABASE_KEY]];
      for (const [label, val] of parts) {
        const b = el("button", "btn alt", "Copy " + label.split(" ")[0]);
        b.onclick = async () => { try { await navigator.clipboard.writeText(val); b.textContent = "Copied"; } catch { prompt(label, val); } };
        card.insertBefore(el("div", "rm-meta", label), row); card.insertBefore(b, row);
      }
    };
  }

  let started = false;
  sb.auth.onAuthStateChange((ev, session) => {
    if (!session || started || ev !== "SIGNED_IN" && ev !== "INITIAL_SESSION") return;
    started = true;
    if (canPush) {
      btn.hidden = false; show();
      if (Notification.permission === "granted") subscribe(true).catch(() => {});  // keeps the phone's subscription fresh
    }
    if (location.hash === "#phone-reminders") setTimeout(phoneSetup, 1500);  // after the chat history
    sb.channel("holiday-reminders")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "commitments" }, p => update(p.new))
      .subscribe();
  });

  window.HolidayReminders = { attach };
})();
