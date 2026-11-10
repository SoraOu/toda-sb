# MTPFMS: multi-page demo

The original single-file demo (`spec/ui-demo.html`) split into one HTML file per page,
with shared `css/` and `js/app.js`. Data is still the demo's browser `localStorage`
(Supabase comes next), so this is a structural step only.

## Run it
Serve the folder (opening files directly can break URL/localStorage handling in some browsers):

    python3 -m http.server 8000     # then open http://localhost:8000

Or push it to GitHub Pages as-is.

## What changed from the demo
- Each menu item is its own file and URL (`dashboard.html`, `toda.html`, `holders.html`, ...). Refreshing stays on the same page.
- Search, filters, sort and page number are kept in the URL query string, so a refresh keeps your filtered view.
- The demo role (Super Admin / Admin / Viewer) is remembered across pages. A role that can't see a page is sent to its first allowed page.
- Logo moved to `assets/logo.jpg`; styles to `css/`; all logic to `js/app.js`.
- Register, Edit, Import and the profile are still pop-ups (they become pages in the rebuild; see `spec/PAGE-MAP.md`).
- Vehicle Registry and Associations have no page: they were not in any role's menu in the demo.
