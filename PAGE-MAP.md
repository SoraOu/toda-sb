# MTPFMS: Page Division Map

Derived from `ui-demo.html` (keep it in the repo as `/spec/ui-demo.html`). Line numbers refer to that file.
Stack assumed: Next.js App Router, `output: 'export'` (static, GitHub Pages), Supabase backend.

## 1. Pages (routes)

| Route | Demo view | Source (line) | Roles | URL params |
|---|---|---|---|---|
| `/login` | none (demo has fake Logout) | n/a | public | n/a |
| `/dashboard` | Dashboard | `dash` 872 | all | none |
| `/holders` | Franchise Holders (TODA+PODA) | `reg(null)` 886 | all | `q, st, br, cl, exp, assoc, sort, dir, page, size, archived` |
| `/holders/toda` | TODA Holders | `reg("TODA")` | super_admin, admin | same |
| `/holders/poda` | PODA Holders | `reg("PODA")` | super_admin, admin | same |
| `/holders/view?id=` | Profile modal | `prof` 1014 | all (viewer: read-only) | `id`, panel (`renew`/`transfer`) |
| `/holders/new` | Register form (modal) | `openForm` 1043, `save` 1068 | admin+ | none |
| `/holders/edit?id=` | Edit form (modal) | `openForm`, `fillForm` 1055 | admin+ | `id` |
| `/holders/import` | CSV import (modal) | `openImport` 920 to `doImp` 955 | admin+ | none |
| `/franchise-by-year` | All Franchise | `allfr` 959 | super_admin only | `year` |
| `/expiration` | Expiration Monitoring | `expiry` 996 | all | none |
| `/renewal` | Renewal Season | `renew` 969 | admin+ | `year, assoc` |
| `/renewal/notices` | Print notices | `printNotices` 977 | admin+ | `year, assoc` |
| `/reports` | Reports | `reports` 986 | admin+ | none |
| `/data-quality` | Data Quality | `dq` 1117, `dqData` 1110 | admin+ | none |
| `/directory` | Public Directory | `pubdir` 998 | admin+ (see note 3) | none |
| `/activity` | Activity Logs | `logs` 1010 | super_admin only | `page` |
| `/settings/appearance` | Customization drawer | `renderCust` 1004 | all | none (stays a drawer) |

Access per role comes from the `MENU` object at line 859. Enforce it in two places: hide the nav item, **and** block it with database row-level security.

## 2. Modals: page, dialog, or in-page panel

- **Own pages (data-entry, can lose work):** Register, Edit, CSV import.
- **In-page panels on the profile page:** Renew, Transfer (`PA` state, `trPanel` 1098), Archive/Restore.
- **Real dialogs (safe to dismiss):** confirm dialogs, "possible duplicate" warning.
- **Stays a drawer:** Customization.
- Form rules: no click-outside dismiss, "Discard changes?" when dirty, draft auto-save, leave-page warning (photo excluded from the draft).

## 3. Things found in the demo that need a decision

1. **Dead views:** `Vehicle Registry` (994) and `Associations` (995) exist in the view map but appear in **no** role's menu. Keep, drop, or add to the menu?
2. **Viewer print:** viewers cannot print (`body.vw` hides everything on print). Keep?
3. **Public Directory** is currently an admin menu page that shows rows flagged `pub`. A real public version (no login) needs an anonymous-readable view exposing only category, association, and status. Confirm the audience.
4. **Viewer logging:** non-admins opening a profile writes "Viewed <name>" to the log (1014). These are excluded from the unsaved-change counter. Keep as audit trail?
5. **Chassis/contact visibility** for viewers: chassis is hidden for non-admins (994). Confirm whether phone should also be hidden.

## 4. Shared modules (build once)

- `lib/constants`: associations (`A`), statuses (`ST`), barangays (`BR`), classifications (`CL`), vehicle types (`VT`), themes (`TH`). Associations should become a table later.
- `lib/dates`: `iso`, `days`, `dec31`, effective status `eff` (Active past expiry shows as Expired).
- `lib/csv`: `parseCSV`, `pDate`, `cq`, download helper `dlf`.
- `lib/records`: `norm`, the duplicate and validation rules from `save` (1068), which become database constraints too.
- `components`: Pill, BarChart (`bars`), DataTable (sortable, paginated, collapses to cards under 640px), FilterBar, Toast, Modal/Drawer, PhotoCapture (camera + upload + crop 320x400), PrintSheet.
- `theme`: 13 themes x light/dark as CSS variables (lines 8 to 737), saved per user.
- `styles/print`: the two `@media print` blocks (832, 833).

## 5. State that moves out of memory

| Demo variable | New home |
|---|---|
| `view` | the route |
| `flt` (search, filters, sort, page) | URL query string |
| `role` (dropdown) | `mtpfms_roles` table via real login |
| `theme`, `mode` | user profile (fallback: localStorage) |
| `data`, `nextId` | `holders` table (identity id) |
| `hist`, `sh`, `tr` arrays | `holder_renewals`, `holder_status_history`, `holder_transfers` |
| `log` | `activity_log` (written by the database) |
| `lastBk`, `chg`, export/import banner | removed; replaced by server backups |
| `photo` (base64) | private Storage bucket, path on the record |

## 6. Cross-links to preserve

- Dashboard cards jump to `/holders` with filters (`DC` array, 870 to 875): status, expiry window (30/60/90), due for renewal.
- Profile opens from any table row. Transfer and renew return to the profile.
- Reports and All Franchise export CSV; Renewal Season prints notices per association.

## 7. Proposed folder layout

```
spec/ui-demo.html
spec/PAGE-MAP.md
supabase/migrations/
src/app/
  login/page.tsx
  (app)/layout.tsx           # shell: header, role-aware nav, theme
  (app)/dashboard/page.tsx
  (app)/holders/page.tsx
  (app)/holders/[cat]/page.tsx   # toda | poda (static params)
  (app)/holders/view/page.tsx    # ?id=
  (app)/holders/new/page.tsx
  (app)/holders/edit/page.tsx    # ?id=
  (app)/holders/import/page.tsx
  (app)/expiration/page.tsx
  (app)/renewal/page.tsx
  (app)/renewal/notices/page.tsx
  (app)/reports/page.tsx
  (app)/data-quality/page.tsx
  (app)/directory/page.tsx
  (app)/activity/page.tsx
  (app)/franchise-by-year/page.tsx
src/lib/  src/components/  src/styles/
```
