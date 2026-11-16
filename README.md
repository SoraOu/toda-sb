# MTPFMS – Phase 1 foundation (INCOMPLETE)
Updated to match the revised demo (mtpfms-demo.html).
## Done
- supabase/migrations/001_core.sql: schema, TODA/PODA association integrity, per-category unique franchise numbers,
  RLS by role, restricted tables for contact/motor/chassis, audit triggers, delete blocking, public_directory view, private buckets.
- supabase/migrations/002_classification_camera.sql (run after 001): holder classification (Operator / Driver / Driver-Operator),
  drivers assigned to an operator's franchise (a Driver holds no franchise or vehicle; category/association come from the assigned franchise),
  fixed Mogpog barangay list, MTOP and OR numbers, vehicle-type list, case-insensitive franchise numbers, `holder_registry` view.
  Checked on plain Postgres 16 with stand-ins for Supabase auth/storage; NOT yet run on a real Supabase project.
- src/lib/associations.ts: associations, barangays, classifications, vehicle types, validation (operator vs driver rules), derived expiry status.
- src/components/FranchiseForm.tsx: Add Franchise Holder form with sections A-D, required-field markers, operator/driver switching,
  duplicate franchise-number check, and an error box that scrolls into view (a failed save is never silent, including errors thrown by `onSubmit`).
  Props: `onSubmit(values)` and `franchises` (existing franchises for the operator list and duplicate check).
- src/components/CameraCapture.tsx: Section D camera (Start / Capture / Retake / Remove, plus Upload fallback). Photo is cropped to 320x400 JPEG
  and returned as a data URL in `values.photo`. Camera needs https or localhost; it switches off when the form closes.
## Demo (index.html) and colors
All colors come from the `<style id="themes">` block inside `index.html` (11 themes, light + dark; the file is self-contained). Pick a theme and mode with the **Customization** button in the header (opens a side panel) (saved in the browser), or set the default via
`data-theme` / `data-mode` on the `<html>` tag in `index.html`, or edit the tokens in that block. Default theme: Maroon · Gold (the classic look). Franchise expiry is always December 31 of the issuance year.
## Demo features
Register, edit, renew, **Remove** (archives the record; tick "Show removed records" to Restore), CSV import/export with error report, duplicate checks (MTOP must be unique), search by name/MTOP/plate/OR no., activity log with before/after values, phone-friendly tables, backup reminder.
## Setup
1. Create a Supabase project; run 001 then 002 in the SQL editor. 2. Copy .env.example to .env.local and fill in values.
3. Create users in Supabase Auth, then insert matching rows in `profiles` (first one as super_admin).
4. npm install && npm run dev.
## NOT built yet
App shell/pages/auth screens, dashboard & charts, registries, server save action (must upload `values.photo` to the private `photos` bucket,
store its path in `franchise_holders.photo_path`, and create the holder, franchise, vehicle and private rows), vehicle history UI,
document upload, ID card + QR, camera on the profile page for existing holders, expiry module, reports/exports, import, public directory page,
backup guide, manual, automated tests in the repo.
## Needs you
Supabase project/keys, hosting & domain, authorized seal image, DPO/municipal review of privacy settings (RA 10173), including holder
photos (stored admin-only in a private bucket).
"# toda-sb" 
