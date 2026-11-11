/* Auth gate. Loaded INSTEAD of app.js on every app page.
   1. no session -> login.html
   2. session but no row in mtpfms_roles -> sign out, login.html?err=norole
   3. otherwise store the real role, then load app.js */
(function () {
  "use strict";
  var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  window.sb = sb;

  window.logout = function () {
    sb.auth.signOut().finally(function () {
      try { localStorage.removeItem("mtpfms-role"); } catch (e) {}
      location.href = "login.html";
    });
  };

  document.documentElement.style.visibility = "hidden";   // no flash of protected page

  function loadScript(src) {
    return new Promise(function (ok, no) {
      var el = document.createElement("script");
      el.src = src; el.onload = ok; el.onerror = function () { no(new Error("Could not load " + src)); };
      document.body.appendChild(el);
    });
  }

  function fail(err) {
    console.error(err);
    document.documentElement.style.visibility = "";
    var box = document.createElement("div");
    box.style.cssText = "max-width:560px;margin:10vh auto;padding:20px;font:15px system-ui;border:1px solid #b00020;border-radius:6px";
    var h = document.createElement("b"); h.textContent = "Could not load the records.";
    var p = document.createElement("p"); p.textContent = (err && err.message) || String(err);
    var b = document.createElement("button"); b.textContent = "Reload"; b.onclick = function () { location.reload(); };
    var o = document.createElement("button"); o.textContent = "Sign out"; o.style.marginLeft = "8px"; o.onclick = window.logout;
    box.appendChild(h); box.appendChild(p); box.appendChild(b); box.appendChild(o);
    document.body.innerHTML = ""; document.body.appendChild(box);
  }

  function bounce(err) {
    location.replace("login.html" + (err ? "?err=" + err : ""));
  }

  sb.auth.getSession().then(function (r) {
    var session = r.data && r.data.session;
    if (!session) return bounce();
    return sb.from("mtpfms_roles").select("role,full_name").eq("user_id", session.user.id).maybeSingle()
      .then(function (q) {
        if (q.error) return fail(q.error);
        if (!q.data) return sb.auth.signOut().finally(function () { bounce("norole"); });
        window.AUTH = { user: session.user, role: q.data.role, name: q.data.full_name };
        try { localStorage.setItem("mtpfms-role", q.data.role); } catch (e) {}
        return loadScript("js/db.js").then(function () { return window.DB.load(); })
          .then(function () { return loadScript("js/app.js"); })
          .then(function () { document.documentElement.style.visibility = ""; })
          .catch(function (err) { fail(err); });
      });
  }).catch(function () { bounce("net"); });
})();
