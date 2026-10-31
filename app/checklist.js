/* Checklists Holiday drafts for Gavin's one OK (first one: Cooper's newborn paperwork).
   The card is a pending `approvals` row, kind 'other', payload.type 'checklist':
     { type, heading, intro, time: "09:00", items: [{ key, title, date, why, on }] }
   Gavin ticks what he wants, can change any date, and taps once. Each ticked item becomes
   one of his normal reminders (a `commitments` row, source 'chat', direction 'i_owe'), so
   Holiday's PC rings it on the day, puts it on his calendar and sends it to his phone.
   Then the card is marked executed with the reminder ids in result. Nothing else runs on
   the PC for this card. Used by approvals.js; uses `sb` from index.html. */
(() => {
  const css = `
  .ck { gap: 10px; padding: 14px 14px 12px; box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 6px 18px rgba(60,35,20,.07); }
  .ck-head { display: flex; gap: 11px; align-items: center; }
  .ck-badge { flex: none; width: 38px; height: 38px; border-radius: 12px; background: var(--accent-soft); color: var(--accent);
    display: grid; place-items: center; font-size: 19px; }
  .ck-heading { font-weight: 680; font-size: 17px; line-height: 1.2; }
  .ck-sub { color: var(--muted); font-size: 13.5px; margin-top: 2px; }
  .ck-intro { color: var(--text); font-size: 14.5px; line-height: 1.4; margin: 0; }
  .ck-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
    border: 1px solid var(--ring); border-radius: 14px; overflow: hidden; background: var(--bg); }
  .ck-item { display: grid; grid-template-columns: 26px 1fr auto; gap: 4px 10px; align-items: start;
    padding: 11px 12px; border-top: 1px solid var(--ring); transition: opacity .15s; }
  .ck-item:first-child { border-top: 0; }
  .ck-item.off { opacity: .5; }
  .ck-item.off .ck-title { text-decoration: line-through; text-decoration-color: var(--muted); }
  .ck-box { appearance: none; -webkit-appearance: none; width: 22px; height: 22px; margin: 1px 0 0; border-radius: 7px;
    border: 2px solid var(--ring); background: var(--surface); display: grid; place-items: center; cursor: pointer; }
  .ck-box:checked { background: var(--accent); border-color: var(--accent); }
  .ck-box:checked::after { content: ""; width: 6px; height: 11px; border: solid #fff; border-width: 0 2.5px 2.5px 0;
    transform: translateY(-1px) rotate(45deg); }
  .ck-box:focus-visible, .ck-date:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .ck-title { font-weight: 600; font-size: 15px; line-height: 1.3; cursor: pointer; }
  .ck-why { grid-column: 2 / 4; color: var(--muted); font-size: 13.5px; line-height: 1.35; }
  .ck-date { position: relative; font: inherit; font-size: 13px; font-weight: 600; color: var(--accent);
    background: var(--accent-soft); border-radius: 999px; padding: 4px 10px; white-space: nowrap; cursor: pointer; }
  .ck-date input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; border: 0; }
  .ck-item.done .ck-date { background: transparent; color: var(--muted); padding-right: 0; cursor: default; }
  .ck-foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .ck-foot .btn { padding: 10px 16px; font-size: 15px; }
  .ck-foot .btn[disabled] { opacity: .55; cursor: default; }
  .ck-note { color: var(--muted); font-size: 13px; flex-basis: 100%; }
  .ck-done { color: var(--accent); font-weight: 650; font-size: 14.5px; }`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const TZ = "America/Chicago";
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const parseDay = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const dayLabel = s => parseDay(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

  // "2026-11-02" + "09:00" in his time zone -> ISO with the right offset (DST-safe).
  function localISO(day, hm) {
    const [y, mo, d] = day.split("-").map(Number), [h, mi] = hm.split(":").map(Number);
    let t = Date.UTC(y, mo - 1, d, h, mi);
    for (let i = 0; i < 2; i++) {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date(t)).map(x => [x.type, x.value]));
      t -= Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Date.UTC(y, mo - 1, d, h, mi);
    }
    return new Date(t).toISOString();
  }

  const owns = a => a.kind === "other" && (a.payload || {}).type === "checklist";

  function render(a, update) {
    const p = a.payload || {}, r = a.result || {}, pending = a.status === "pending";
    const items = (pending ? p.items : r.items || p.items || []).map(it => ({ ...it, on: pending ? it.on !== false : true }));
    const card = el("div", "ap ck"); card.dataset.status = a.status; card.dataset.id = a.id;

    const head = el("div", "ck-head");
    head.append(el("div", "ck-badge", p.icon || "✓"));
    const ht = el("div"); ht.append(el("div", "ck-heading", p.heading || a.title), el("div", "ck-sub", p.sub || ""));
    head.append(ht); card.append(head);
    if (pending && p.intro) card.append(el("p", "ck-intro", p.intro));

    const list = el("ul", "ck-list");
    const foot = el("div", "ck-foot");
    const go = el("button", "btn"), no = el("button", "btn alt", "Not now");
    const count = () => {
      const n = items.filter(i => i.on).length;
      go.textContent = n ? `Set ${n} reminder${n > 1 ? "s" : ""}` : "Tick at least one";
      go.disabled = !n;
    };
    items.forEach(it => {
      const li = el("li", "ck-item" + (pending ? "" : " done") + (it.on ? "" : " off"));
      const box = el("input", "ck-box"); box.type = "checkbox"; box.checked = it.on; box.disabled = !pending;
      box.setAttribute("aria-label", it.title);
      const title = el("div", "ck-title", it.title);
      const date = el("label", "ck-date", dayLabel(it.date));
      if (pending) {
        const pick = el("input"); pick.type = "date"; pick.value = it.date; pick.min = today();
        pick.setAttribute("aria-label", "Change the date for " + it.title);
        pick.onchange = () => { if (pick.value) { it.date = pick.value; date.firstChild.textContent = dayLabel(it.date); } };
        date.append(pick);
        const flip = () => { it.on = box.checked; li.classList.toggle("off", !it.on); count(); };
        box.onchange = flip;
        title.onclick = () => { box.checked = !box.checked; flip(); };
      }
      li.append(box, title, date);
      if (it.why) li.append(el("div", "ck-why", it.why));
      list.append(li);
    });
    card.append(list);

    if (pending) {
      count();
      go.onclick = async () => {
        go.disabled = no.disabled = true; go.textContent = "Setting them…";
        try { update(await approve(a, items.filter(i => i.on), p.time || "09:00")); }
        catch (e) { alert("That didn't go through: " + e.message); count(); no.disabled = false; }
      };
      no.onclick = async () => {
        go.disabled = no.disabled = true;
        const { data, error } = await sb.from("approvals").update({ status: "rejected" }).eq("id", a.id).select().single();
        if (error) { alert("That didn't go through: " + error.message); count(); no.disabled = false; return; }
        update(data);
      };
      foot.append(go, no, el("span", "ck-note", `Each one rings at ${hm12(p.time || "09:00")} on its day, and goes on your calendar and phone like your other reminders.`));
    } else {
      const n = (r.reminder_ids || []).length;
      foot.append(el("span", a.status === "executed" ? "ck-done" : "ap-state",
        a.status === "executed" ? `✓ ${n} reminder${n === 1 ? "" : "s"} set. I'll nudge you on each day.`
          : a.status === "approved" ? "Setting them…"
          : a.status === "rejected" ? "Skipped. Ask me for it again any time." : "Expired."));
    }
    card.append(foot);
    return card;
  }
  const hm12 = hm => { const [h, m] = hm.split(":").map(Number); return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "am" : "pm"}`; };

  async function approve(a, chosen, time) {
    const now = Date.now(), ref = k => `checklist:${a.id}:${k}`;
    // A retry after a half-finished tap must not make doubles.
    const { data: have, error: e0 } = await sb.from("commitments").select("id,source_ref").like("source_ref", `checklist:${a.id}:%`);
    if (e0) throw e0;
    const got = new Map((have || []).map(c => [c.source_ref, c.id]));
    const rows = chosen.filter(it => !got.has(ref(it.key))).map(it => {
      let at = localISO(it.date, time);
      if (Date.parse(at) < now) at = new Date(now + 3600e3).toISOString();  // a day already gone: in an hour
      return { direction: "i_owe", title: it.title.slice(0, 200), details: it.why || null, area: p_area(a), due_at: at,
        due_is_soft: true, status: "open", source: "chat", source_ref: ref(it.key), next_nudge_at: at, created_by: "holiday" };
    });
    if (rows.length) {
      const { data, error } = await sb.from("commitments").insert(rows).select("id,source_ref");
      if (error) throw error;
      data.forEach(c => got.set(c.source_ref, c.id));
    }
    const ids = chosen.map(it => got.get(ref(it.key))).filter(Boolean);
    const result = { reminder_ids: ids, items: chosen.map(({ key, title, date, why }) => ({ key, title, date, why })) };
    let { error } = await sb.from("approvals").update({ status: "approved" }).eq("id", a.id);
    if (error) throw error;
    const { data, error: e2 } = await sb.from("approvals").update({ status: "executed", result }).eq("id", a.id).select().single();
    if (e2) throw e2;
    return data;
  }
  const p_area = a => ["work", "family", "home", "personal"].includes((a.payload || {}).area) ? a.payload.area : "family";

  window.HolidayChecklist = { owns, render };
})();
