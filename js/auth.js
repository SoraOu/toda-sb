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
      items.forEach(function (m) { h += '<a href="' + PAGES[m] + '"' + (m === window.PAGE ? ' class="on"' : "") + ">" + m + "</a>"; });
      h += '<a onclick="logout()">Logout</a>';
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
