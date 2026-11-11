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

  function bounce(err) {
    location.replace("login.html" + (err ? "?err=" + err : ""));
  }

  sb.auth.getSession().then(function (r) {
    var session = r.data && r.data.session;
    if (!session) return bounce();
    return sb.from("mtpfms_roles").select("role,full_name").eq("user_id", session.user.id).maybeSingle()
      .then(function (q) {
        if (q.error || !q.data) return sb.auth.signOut().finally(function () { bounce("norole"); });
        window.AUTH = { user: session.user, role: q.data.role, name: q.data.full_name };
        try { localStorage.setItem("mtpfms-role", q.data.role); } catch (e) {}
        var s = document.createElement("script");
        s.src = "js/app.js";
        s.onload = function () { document.documentElement.style.visibility = ""; };
        document.body.appendChild(s);
      });
  }).catch(function () { bounce("net"); });
})();
