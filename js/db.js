/* Data layer: loads holders from Supabase and saves every change back.
   app.js keeps its in-memory model; persist() calls DB.flush(), which diffs and writes. */
(function () {
  "use strict";
  var sb = window.sb, BUCKET = "holder-photos", PAGE = 1000;
  var ASSOC = { byName: {}, byId: {} }, SNAP = new Map(), CH = new Map();

  /* ---------- helpers ---------- */
  async function all(table, cols, order, asc) {
    var out = [], from = 0;
    for (;;) {
      var q = await sb.from(table).select(cols).order(order, { ascending: asc !== false }).range(from, from + PAGE - 1);
      if (q.error) throw q.error;
      out = out.concat(q.data);
      if (q.data.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }
  function group(rows) {
    var m = new Map();
    rows.forEach(function (r) { if (!m.has(r.holder_id)) m.set(r.holder_id, []); m.get(r.holder_id).push(r); });
    return m;
  }
  function friendly(e) {
    var c = e && e.code, m = (e && e.message) || String(e);
    if (c === "23505") return "That MTOP No. is already in the database.";
    if (c === "42501" || /row-level security/i.test(m)) return "Your account is not allowed to make that change.";
    if (c === "23514") return "A required field is missing or invalid (" + m + ").";
    return m;
  }

  /* ---------- DB row <-> app record ---------- */
  function rowOf(r) {
    var drv = r.cls === "Driver", a = ASSOC.byName[r.assoc];
    if (!a) throw new Error("Unknown association: " + r.assoc);
    return {
      classification: r.cls, operator_id: drv ? r.asg : null, name: r.name, address: r.addr,
      barangay: r.brgy, phone: r.phone || "", category: r.cat, association_id: a,
      mtop_no: drv ? null : (r.mtop || null), or_no: r.or || null, or_date: r.ordate || null,
      issued_on: r.issued || null, expires_on: drv ? null : (r.exp || null),
      status: drv ? null : (r.status || null), plate_no: r.plate || null,
      vehicle_type: r.vtype || null, vehicle_model: r.model || null, color: r.color || null, engine_no: r.engine || null,
      is_public: !!r.pub, archived_on: r.arch || null
    };
  }
  function fromRow(h) {
    return {
      id: h.id, cls: h.classification, asg: h.operator_id, name: h.name, addr: h.address, brgy: h.barangay,
      phone: h.phone || "", cat: h.category, assoc: ASSOC.byId[h.association_id], mtop: h.mtop_no || "",
      or: h.or_no || "", ordate: h.or_date || "", issued: h.issued_on || "", exp: h.expires_on || "",
      status: h.status || "", plate: h.plate_no || "", vtype: h.vehicle_type || "", model: h.vehicle_model || "",
      color: h.color || "", chassis: "", engine: h.engine_no || "", pub: !!h.is_public, photo: null, arch: h.archived_on || null,
      hist: [], sh: [], tr: [], _db: true, _pp: h.photo_path || null, _ph: null
    };
  }

  /* ---------- activity log text ---------- */
  var LBL = { expires_on: "expiry", issued_on: "issued", status: "status", name: "name", address: "address",
    barangay: "barangay", phone: "contact", association_id: "association", mtop_no: "MTOP", plate_no: "plate",
    or_no: "OR no.", or_date: "OR date", vehicle_type: "vehicle type", vehicle_model: "model", color: "color", engine_no: "engine no.",
    is_public: "public", category: "type", operator_id: "operator", classification: "class", photo_path: "photo" };
  function show(k, v) {
    if (v === null || v === undefined || v === "") return "—";
    if (k === "association_id") return ASSOC.byId[v] || v;
    return String(v);
  }
  function fmtLog(l) {
    var d = l.detail || {}, n = d.name || ("#" + l.row_id);
    if (l.action === "INSERT") return "Added " + n;
    if (l.action === "ARCHIVE") return "Archived " + n;
    if (l.action === "RESTORE") return "Restored " + n;
    var ch = d.changed || {}, parts = Object.keys(ch).map(function (k) {
      return (LBL[k] || k) + ": " + show(k, ch[k].from) + " → " + show(k, ch[k].to);
    });
    return "Edited " + n + (parts.length ? ": " + parts.join("; ") : "");
  }

  /* ---------- load (before app.js starts) ---------- */
  async function load() {
    // all reads go out at the same time (they used to run one after another)
    var R = await Promise.all([
      all("associations", "id,name", "id"),
      all("holders", "*", "id"),
      all("holder_chassis", "holder_id,chassis_no", "holder_id"),          // admin-only: viewers get []
      all("holder_renewals", "*", "id", false),
      all("holder_status_history", "*", "id", false),
      all("holder_transfers", "*", "id", false),
      sb.from("activity_log").select("*").order("id", { ascending: false }).limit(500)   // super_admin only
    ]);
    R[0].forEach(function (a) { ASSOC.byName[a.name] = a.id; ASSOC.byId[a.id] = a.name; });

    var data = R[1].map(fromRow), byId = new Map(data.map(function (r) { return [r.id, r]; }));
    R[2].forEach(function (c) { var r = byId.get(c.holder_id); if (r) { r.chassis = c.chassis_no; CH.set(r.id, c.chassis_no); } });

    var rn = group(R[3]), sh = group(R[4]), tr = group(R[5]);
    data.forEach(function (r) {
      (rn.get(r.id) || []).forEach(function (e) { r.hist.push({ at: e.renewed_on, from: e.old_expiry, to: e.new_expiry, role: e.by_role, _id: e.id }); });
      (sh.get(r.id) || []).forEach(function (e) { r.sh.push({ date: e.changed_on, from: e.from_status || "", to: e.to_status, reason: e.reason || "", by: e.decided_by || "", role: e.by_role, _id: e.id }); });
      (tr.get(r.id) || []).forEach(function (e) { r.tr.push({ date: e.transferred_on, fromName: e.from_name, toName: e.to_name, fromAssoc: ASSOC.byId[e.from_assoc], toAssoc: ASSOC.byId[e.to_assoc], note: e.note || "", by: e.approved_by, role: e.by_role, _id: e.id }); });
    });

    var log = [];
    if (!R[6].error && R[6].data) log = R[6].data.map(function (l) { return [new Date(l.at).toLocaleString(), l.role, fmtLog(l)]; });

    // photos: private bucket -> signed URLs (4 hours), batches in parallel
    var withPh = data.filter(function (r) { return r._pp; }), jobs = [];
    for (var i = 0; i < withPh.length; i += 200) (function (chunk) {
      jobs.push(sb.storage.from(BUCKET).createSignedUrls(chunk.map(function (r) { return r._pp; }), 14400).then(function (s) {
        if (!s.error && s.data) s.data.forEach(function (x, k) { if (x.signedUrl) { chunk[k].photo = x.signedUrl; chunk[k]._ph = x.signedUrl; } });
      }));
    })(withPh.slice(i, i + 200));
    await Promise.all(jobs);

    data.forEach(function (r) { SNAP.set(r.id, JSON.stringify(rowOf(r))); });
    window.DB_SEED = { data: data, log: log };
  }

  /* ---------- save (diff and write) ---------- */
  var queue = Promise.resolve(), remapped = false;

  function remap(oldId, newId) {
    remapped = true;
    data.forEach(function (d) { if (d.asg === oldId) d.asg = newId; });
  }

  async function insertNew(list) {
    for (var i = 0; i < list.length; i += 100) {
      var chunk = list.slice(i, i + 100);
      var res = await sb.from("holders").insert(chunk.map(rowOf)).select("id");
      if (res.error) throw res.error;
      var chRows = [];
      res.data.forEach(function (x, k) {
        var r = chunk[k], old = r.id;
        r.id = x.id; r._db = true; remap(old, x.id);
        SNAP.set(r.id, JSON.stringify(rowOf(r)));
        var c = (r.chassis || "").trim();
        if (c) chRows.push({ holder_id: r.id, chassis_no: c });
      });
      if (chRows.length) {
        var cr = await sb.from("holder_chassis").insert(chRows);
        if (cr.error) throw cr.error;
        chRows.forEach(function (c) { CH.set(c.holder_id, c.chassis_no); });
      }
    }
  }

  async function run() {
    remapped = false;
    var unsavedOp = function (r) { return r.cls === "Driver" && r.asg >= 1e9; };

    // 1. new records: operators first so drivers can point at real ids
    await insertNew(data.filter(function (r) { return !r._db && r.cls !== "Driver"; }));
    await insertNew(data.filter(function (r) { return !r._db && r.cls === "Driver" && !unsavedOp(r); }));

    // 2. changed records (operators before drivers)
    var live = data.filter(function (r) { return r._db; })
      .sort(function (a, b) { return (a.cls === "Driver") - (b.cls === "Driver"); });
    for (var r of live) {
      var row = rowOf(r), now = JSON.stringify(row);
      if (now !== SNAP.get(r.id)) {
        var u = await sb.from("holders").update(row).eq("id", r.id);
        if (u.error) throw u.error;
        SNAP.set(r.id, now);
      }
      var c = (r.chassis || "").trim(), oc = CH.get(r.id) || "";
      if (c !== oc) {
        var cq = c ? await sb.from("holder_chassis").upsert({ holder_id: r.id, chassis_no: c })
                   : await sb.from("holder_chassis").delete().eq("holder_id", r.id);
        if (cq.error) throw cq.error;
        if (c) CH.set(r.id, c); else CH.delete(r.id);
      }
    }

    // 3. new history entries
    for (var h of live) {
      for (var e of (h.hist || []).slice().reverse()) if (!e._id) {
        var a = await sb.from("holder_renewals").insert({ holder_id: h.id, renewed_on: e.at, old_expiry: e.from, new_expiry: e.to }).select("id").single();
        if (a.error) throw a.error; e._id = a.data.id;
      }
      for (var s of (h.sh || []).slice().reverse()) if (!s._id) {
        var b = await sb.from("holder_status_history").insert({ holder_id: h.id, changed_on: s.date, from_status: s.from || null, to_status: s.to, reason: s.reason || null, decided_by: s.by || null }).select("id").single();
        if (b.error) throw b.error; s._id = b.data.id;
      }
      for (var t of (h.tr || []).slice().reverse()) if (!t._id) {
        var d = await sb.from("holder_transfers").insert({ holder_id: h.id, transferred_on: t.date, from_name: t.fromName, to_name: t.toName, from_assoc: ASSOC.byName[t.fromAssoc], to_assoc: ASSOC.byName[t.toAssoc], note: t.note || null, approved_by: t.by }).select("id").single();
        if (d.error) throw d.error; t._id = d.data.id;
      }
    }

    // 4. photos
    for (var p of live) {
      var cur = p.photo || null;
      if (cur && cur !== p._ph && cur.indexOf("data:") === 0) {
        var blob = await (await fetch(cur)).blob(), path = p.id + ".jpg";
        var up = await sb.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
        if (up.error) throw up.error;
        var pu = await sb.from("holders").update({ photo_path: path }).eq("id", p.id);
        if (pu.error) throw pu.error;
        p._ph = cur; p._pp = path;
      } else if (!cur && p._ph) {
        await sb.storage.from(BUCKET).remove([p._pp || (p.id + ".jpg")]);
        var pd = await sb.from("holders").update({ photo_path: null }).eq("id", p.id);
        if (pd.error) throw pd.error;
        p._ph = null; p._pp = null;
      }
    }
    if (remapped && typeof draw === "function") draw();
  }

  function banner(msg) {
    var b = document.getElementById("dberr");
    if (!msg) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("div"); b.id = "dberr"; b.setAttribute("role", "alert");
      b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#b00020;color:#fff;padding:10px 16px;font-size:14px";
      document.body.appendChild(b);
    }
    b.innerHTML = "";
    b.appendChild(document.createTextNode("Not saved: " + msg + " "));
    var bt = document.createElement("button"); bt.textContent = "Try again";
    bt.style.cssText = "margin-left:8px;padding:3px 10px"; bt.onclick = function () { DB.flush(); };
    b.appendChild(bt);
  }

  var loadedAt = Date.now();

  /* Re-read everything from the database (other devices may have changed it). */
  async function refresh(quiet) {
    var bad = document.getElementById("dberr");
    if (bad) {
      if (quiet) return;
      if (!window.confirm("Some changes were not saved. Refreshing will lose them. Continue?")) return;
    }
    await queue;
    var s0 = new Map(SNAP), c0 = new Map(CH);
    SNAP.clear(); CH.clear();
    try { await load(); }
    catch (e) {
      s0.forEach(function (v, k) { SNAP.set(k, v); }); c0.forEach(function (v, k) { CH.set(k, v); });
      if (!quiet && typeof toast === "function") toast("Could not refresh: " + friendly(e));
      return;
    }
    data = window.DB_SEED.data.map(norm);
    log.length = 0; window.DB_SEED.log.forEach(function (l) { log.push(l); });
    loadedAt = Date.now();
    draw();
    if (!quiet && typeof toast === "function") toast("Records refreshed");
  }

  // coming back to the tab after 5+ minutes: refresh quietly (only if nothing is open or unsaved)
  document.addEventListener("visibilitychange", function () {
    var m = document.getElementById("modal");
    if (document.visibilityState === "visible" && Date.now() - loadedAt > 300000 && m && !m.innerHTML) refresh(true);
  });

  /* ---------- live updates (Supabase Realtime) ---------- */
  var busy = false, pend = [], drawT = null, downFlag = false, lastNote = 0;
  var FIELDS = ["cls","asg","name","addr","brgy","phone","cat","assoc","mtop","or","ordate","issued","exp","status","plate","vtype","model","color","pub","arch"];

  function find(id) { for (var i = 0; i < data.length; i++) if (data[i].id === id) return data[i]; return null; }
  function signPhoto(r) {
    if (!r._pp) return;
    sb.storage.from(BUCKET).createSignedUrl(r._pp, 14400).then(function (s) {
      if (s.data && s.data.signedUrl) { r.photo = s.data.signedUrl; r._ph = r.photo; schedDraw(); }
    });
  }
  function schedDraw() { clearTimeout(drawT); drawT = setTimeout(tryDraw, 300); }
  function tryDraw() {
    var a = document.activeElement;   // never redraw under someone who is typing in a field
    if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.closest && a.closest("main")) { drawT = setTimeout(tryDraw, 2000); return; }
    draw();
    if (Date.now() - lastNote > 10000 && typeof toast === "function") { lastNote = Date.now(); toast("Records updated from another device"); }
  }

  // returns true when the in-memory data changed
  function apply(t, p, fromQueue) {
    var n = p.new, o = p.old, h, v;
    if (t === "holders") {
      if (p.eventType === "DELETE") {
        var i = data.findIndex(function (x) { return x.id === o.id; });
        if (i < 0) return false;
        data.splice(i, 1); SNAP.delete(o.id); return true;
      }
      var cur = find(n.id), nr = fromRow(n), sig = JSON.stringify(rowOf(nr));
      if (nr.arch && role !== "super_admin") {                 // archived records are hidden from non-super users
        if (!cur) return false;
        data.splice(data.indexOf(cur), 1); SNAP.delete(cur.id); return true;
      }
      if (!cur) { data.push(nr); SNAP.set(nr.id, sig); signPhoto(nr); return true; }
      var photoChanged = !fromQueue && (n.photo_path || null) !== (cur._pp || null);
      if (SNAP.get(n.id) === sig && !photoChanged) return false;          // our own echo, nothing new
      if (JSON.stringify(rowOf(cur)) !== SNAP.get(cur.id)) return false;  // we have unsaved edits: keep ours
      FIELDS.forEach(function (k) { cur[k] = nr[k]; });
      SNAP.set(cur.id, sig);
      if (photoChanged) { cur._pp = n.photo_path || null; if (cur._pp) signPhoto(cur); else { cur.photo = null; cur._ph = null; } }
      return true;
    }
    if (t === "holder_chassis") {
      var hid = (n || o).holder_id; h = find(hid); if (!h) return false;
      v = p.eventType === "DELETE" ? "" : n.chassis_no;
      if ((CH.get(hid) || "") === v) return false;
      h.chassis = v; if (v) CH.set(hid, v); else CH.delete(hid); return true;
    }
    if (t === "holder_renewals" && p.eventType === "INSERT") {
      h = find(n.holder_id); if (!h || h.hist.some(function (e) { return e._id === n.id; })) return false;
      h.hist.unshift({ at: n.renewed_on, from: n.old_expiry, to: n.new_expiry, role: n.by_role, _id: n.id }); return true;
    }
    if (t === "holder_status_history" && p.eventType === "INSERT") {
      h = find(n.holder_id); if (!h || h.sh.some(function (e) { return e._id === n.id; })) return false;
      h.sh.unshift({ date: n.changed_on, from: n.from_status || "", to: n.to_status, reason: n.reason || "", by: n.decided_by || "", role: n.by_role, _id: n.id }); return true;
    }
    if (t === "holder_transfers" && p.eventType === "INSERT") {
      h = find(n.holder_id); if (!h || h.tr.some(function (e) { return e._id === n.id; })) return false;
      h.tr.unshift({ date: n.transferred_on, fromName: n.from_name, toName: n.to_name, fromAssoc: ASSOC.byId[n.from_assoc], toAssoc: ASSOC.byId[n.to_assoc], note: n.note || "", by: n.approved_by, role: n.by_role, _id: n.id }); return true;
    }
    if (t === "activity_log" && p.eventType === "INSERT") {
      if (window.AUTH && window.AUTH.user && n.user_id === window.AUTH.user.id) return false;   // own actions are already listed
      log.unshift([new Date(n.at).toLocaleString(), n.role, fmtLog(n)]); return true;
    }
    return false;
  }

  function onChange(t, p) {
    if (busy) { pend.push([t, p]); return; }      // our own save is running: handle its echoes afterwards
    try { if (apply(t, p, false)) schedDraw(); } catch (e) { console.error("live update", e); }
  }
  function drain() {
    var changed = false;
    pend.splice(0).forEach(function (e) { try { if (apply(e[0], e[1], true)) changed = true; } catch (x) { console.error("live update", x); } });
    if (changed) schedDraw();
  }

  function live() {
    if (!sb.channel) return;
    var ch = sb.channel("mtpfms-live");
    ["holders", "holder_chassis", "holder_renewals", "holder_status_history", "holder_transfers", "activity_log"].forEach(function (t) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, function (p) { onChange(t, p); });
    });
    ch.subscribe(function (status) {
      if (status === "SUBSCRIBED") { if (downFlag) { downFlag = false; refresh(true); } }   // missed events while offline -> reload once
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") downFlag = true;
    });
  }

  window.DB = {
    load: load,
    refresh: refresh,
    live: live,
    _apply: apply,
    flush: function () {
      queue = queue.then(function () { busy = true; return run(); }).then(function () { banner(null); }, function (e) {
        console.error("DB save failed", e);
        banner(friendly(e));
        if (typeof toast === "function") toast("Not saved: " + friendly(e));
      }).then(function () { busy = false; drain(); });
      return queue;
    }
  };
})();
