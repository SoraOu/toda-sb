/* Auth gate + loading shell. Loaded INSTEAD of app.js on every app page.
   0. draw the sidebar and a skeleton right away (so the page is never blank)
   1. no session -> login.html
   2. session but no row in mtpfms_roles -> sign out, login.html?err=norole
   3. otherwise load records, then app.js takes over and replaces the skeleton */
(function () {
  "use strict";
  var T0 = performance.now(), marks = [];
  function mark(n) { marks.push(n + " " + Math.round(performance.now() - T0) + "ms"); }

  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  window.sb = sb;

  window.logout = function () {
    sb.auth.signOut().finally(function () {
      try { localStorage.removeItem("mtpfms-role"); } catch (e) {}
      location.href = "login.html";
    });
  };

  /* ---------- loading shell (cosmetic only; real access is enforced by the database) ---------- */
  // Keep in step with PAGES and MENU in app.js.
  var PAGES = { "Dashboard": "dashboard.html", "Franchise Holders": "holders.html", "TODA Holders": "toda.html", "PODA Holders": "poda.html", "All Franchise": "all-franchise.html", "Expiration Monitoring": "expiration.html", "Renewal Season": "renewal.html", "Reports": "reports.html", "Data Quality": "data-quality.html", "Public Directory": "directory.html", "Activity Logs": "activity.html" };
  var MENU = {
    super_admin: ["Dashboard", "TODA Holders", "PODA Holders", "Franchise Holders", "All Franchise", "Expiration Monitoring", "Renewal Season", "Reports", "Data Quality", "Public Directory", "Activity Logs"],
    admin: ["Dashboard", "TODA Holders", "PODA Holders", "Franchise Holders", "Expiration Monitoring", "Renewal Season", "Reports", "Data Quality", "Public Directory"],
    viewer: ["Dashboard", "Franchise Holders", "Expiration Monitoring"]
  };


  /* ---------- shared navigation (grouped, Lucide icons). app.js reuses window.mtNav. ---------- */
  var IC = {
    "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    "bike": '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    "bus": '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
    "id-card": '<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
    "layers": '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    "bar-chart": '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    "shield-check": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    "activity": '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    "palette": '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    "bell": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    "menu": '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    "x-circle": '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    "hourglass": '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    "building": '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    "database": '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
    "plus": '<path d="M5 12h14"/><path d="M12 5v14"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>'
  };
  window.mtIcon = function (n) { return '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (IC[n] || "") + "</svg>"; };
  var GROUPS = [
    ["Overview", [["Dashboard", "layout-dashboard"]]],
    ["Registry", [["TODA Holders", "bike"], ["PODA Holders", "bus"], ["Franchise Holders", "id-card"], ["All Franchise", "layers"]]],
    ["Monitoring", [["Expiration Monitoring", "clock"], ["Renewal Season", "refresh-cw"], ["Reports", "bar-chart"]]],
    ["Administration", [["Data Quality", "shield-check"], ["Public Directory", "globe"], ["Activity Logs", "activity"]]]
  ];
  /* items = the role's MENU; spa = true once app.js can navigate without reloading */
  window.mtNav = function (items, active, spa) {
    var h = "";
    GROUPS.forEach(function (g) {
      var rows = g[1].filter(function (m) { return items.indexOf(m[0]) >= 0; });
      if (!rows.length) return;
      h += '<div class="ng" role="group" aria-label="' + g[0] + '"><div class="nh">' + g[0] + "</div>";
      rows.forEach(function (m) {
        var on = m[0] === active;
        h += '<a href="' + PAGES[m[0]] + '" title="' + m[0] + '"' + (on ? ' class="on" aria-current="page"' : "") + (spa ? " onclick=\"return spa(event,'" + m[0] + "')\"" : "") + ">" + window.mtIcon(m[1]) + "<span>" + m[0] + "</span></a>";
      });
      h += "</div>";
    });
    h += '<div class="ng" role="group" aria-label="System"><div class="nh">System</div>' +
      '<a role="button" tabindex="0" title="Customization" onclick="window.openCust&&openCust()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.openCust&&openCust()}">' + window.mtIcon("palette") + "<span>Customization</span></a>" +
      '<a role="button" tabindex="0" title="Logout" onclick="logout()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();logout()}">' + window.mtIcon("log-out") + "<span>Logout</span></a></div>";
    return h;
  };
  window.toggleNav = function () {
    var nav = document.getElementById("nav");
    if (window.innerWidth > 760) {
      var c = document.body.classList.toggle("nav-collapsed");
      try { localStorage.setItem("mtpfms-nav", c ? "1" : "0"); } catch (e) {}
    } else if (nav) nav.classList.toggle("open");
  };
  try { if (localStorage.getItem("mtpfms-nav") === "1") document.body.classList.add("nav-collapsed"); } catch (e) {}

  function shell() {
    var nav = document.getElementById("nav"), main = document.getElementById("main");
    if (!nav || !main) return;
    var st = document.createElement("style");
    st.textContent =
      "@keyframes mtspin{to{transform:rotate(360deg)}}" +
      "@keyframes mtsh{0%{background-position:200% 0}100%{background-position:-200% 0}}" +
      ".mt-spin{width:22px;height:22px;flex:none;border:3px solid var(--border,#ccc);border-top-color:var(--primary,#800);border-radius:50%;animation:mtspin .8s linear infinite}" +
      ".mt-sk{border-radius:6px;background:linear-gradient(90deg,var(--border,#ddd) 25%,var(--surface,#eee) 50%,var(--border,#ddd) 75%);background-size:200% 100%;animation:mtsh 1.4s linear infinite}" +
      ".mt-row{display:flex;align-items:center;gap:10px;margin-bottom:16px;color:var(--text-primary,#222)}" +
      "@media (prefers-reduced-motion:reduce){.mt-spin,.mt-sk{animation:none}}";
    document.head.appendChild(st);

    var cached = null;
    try { cached = localStorage.getItem("mtpfms-role"); } catch (e) {}
    var items = MENU[cached], h = "";
    if (items) {
      h = window.mtNav(items, window.PAGE, false);
    } else {
      for (var i = 0; i < 7; i++) h += '<div class="mt-sk" style="height:16px;margin:14px 18px;width:' + (60 + (i * 13) % 30) + '%"></div>';
    }
    nav.innerHTML = h;

    var cards = "";
    for (var c = 0; c < 4; c++) cards += '<div class="mt-sk" style="height:66px"></div>';
    var rows = "";
    for (var r = 0; r < 6; r++) rows += '<div class="mt-sk" style="height:30px;margin-bottom:8px"></div>';
    main.innerHTML =
      '<div class="mt-row" role="status" aria-live="polite"><div class="mt-spin"></div><b>Loading records…</b></div>' +
      '<div class="mt-sk" style="height:26px;width:220px;margin-bottom:16px"></div>' +
      '<div class="cards">' + cards + "</div>" + rows;
  }
  shell();

  /* ---------- helpers ---------- */
  function loadScript(src) {
    return new Promise(function (ok, no) {
      var el = document.createElement("script");
      el.src = src; el.onload = ok; el.onerror = function () { no(new Error("Could not load " + src)); };
      document.body.appendChild(el);
    });
  }

  function fail(err) {
    console.error(err);
    var box = document.createElement("div");
    box.style.cssText = "max-width:560px;margin:6vh auto;padding:20px;font:15px system-ui;border:1px solid #b00020;border-radius:6px;background:var(--surface,#fff);color:var(--text-primary,#222)";
    var h = document.createElement("b"); h.textContent = "Could not load the records.";
    var p = document.createElement("p"); p.textContent = (err && err.message) || String(err);
    var b = document.createElement("button"); b.textContent = "Reload"; b.onclick = function () { location.reload(); };
    var o = document.createElement("button"); o.textContent = "Sign out"; o.style.marginLeft = "8px"; o.onclick = window.logout;
    box.appendChild(h); box.appendChild(p); box.appendChild(b); box.appendChild(o);
    var host = document.getElementById("main") || document.body;   // keep the sidebar if it is there
    host.innerHTML = ""; host.appendChild(box);
  }

  function bounce(err) {
    location.replace("login.html" + (err ? "?err=" + err : ""));
  }

  ["js/db.js", "js/app.js"].forEach(function (u) {   // start downloading while we check the login
    var l = document.createElement("link"); l.rel = "preload"; l.as = "script"; l.href = u; document.head.appendChild(l);
  });

  sb.auth.getSession().then(function (r) {
    mark("login checked");
    var session = r.data && r.data.session;
    if (!session) return bounce();
    // role check and record loading run at the same time
    var rolesQ = sb.from("mtpfms_roles").select("role,full_name").eq("user_id", session.user.id).maybeSingle();
    var dataQ = loadScript("js/db.js").then(function () { return window.DB.load(); }).then(function () { mark("records loaded"); });
    dataQ.catch(function () {});                       // handled below, once the role is known
    return rolesQ.then(function (q) {
      mark("role checked");
      if (q.error) return fail(q.error);
      if (!q.data) return sb.auth.signOut().finally(function () { bounce("norole"); });
      window.AUTH = { user: session.user, role: q.data.role, name: q.data.full_name };
      try { localStorage.setItem("mtpfms-role", q.data.role); } catch (e) {}
      return dataQ.then(function () { return loadScript("js/app.js"); })
        .then(function () { if (window.DB && window.DB.live) window.DB.live(); })
        .then(function () { mark("page drawn"); console.info("[MTPFMS load] " + marks.join(" | ")); })
        .catch(fail);
    });
  }).catch(function () { bounce("net"); });
})();
