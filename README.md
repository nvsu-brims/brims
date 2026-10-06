# NVSU-BRIMS

> NVSU-BRIMS is the Nueva Vizcaya State University Borrowing and Returning Items & Equipment Management System. It replaces logbooks and walk-in requests with one web platform for the Sports Development Office and the University Culture and the Arts Office.

Borrowers browse the catalog and submit borrow requests. Office admins approve or reject requests, track borrowed items, manage inventory and users, and review activity logs. Super admins also approve sign-ups and manage accounts.

## Tech Stack

- **Next.js 16** (App Router, Server Actions)
- **React 19**
- **Prisma 7** with `@prisma/adapter-pg` and PostgreSQL
- **Supabase** for Postgres hosting and item image storage
- **Resend** for transactional email
- **Tailwind CSS 4** and shadcn/ui components
- **TypeScript**

## Features

- **Borrowers:** browse the item catalog, submit borrow requests with an expected return date, view request and borrowing history.
- **Admins:** approve or reject requests, mark items as returned, add/edit/delete inventory (with item photos), view history and activity logs.
- **Super admins:** approve or reject sign-up requests, add/edit/deactivate/reactivate users, reset passwords.
- **Email notifications** for requests, approvals, rejections, returns, and daily unreturned-item reminders (11 emails via Resend).
- **Overdue marking** via a daily cron route (`/api/cron/mark-overdue`).
- **Custom JWT session** (`jose`, HttpOnly cookie) with revocable tokens and sign-in throttling.
- **Activity logging** on every admin action, borrower action, sign-in, sign-out, and unauthorized access attempt.

## Prerequisites

- Node.js 20 or newer
- A Supabase project (provides the PostgreSQL database and item image storage)
- A Resend account and API key (for email)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create two env files in the project root. Both are gitignored.

   **`.env`** (read by the Prisma CLI and `prisma.config.ts`):

   ```env
   # Supabase Postgres "Session pooler" string (port 5432)
   DATABASE_URL="postgresql://postgres.<PROJECT_REF>:<DB_PASSWORD>@<POOLER_HOST>:5432/postgres?sslmode=require"
   ```

   **`.env.local`** (read by Next.js):

   ```env
   # Supabase client
   NEXT_PUBLIC_SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<sb_publishable_key>"

   # Supabase service role — SERVER ONLY. Never prefix with NEXT_PUBLIC_.
   # Used by lib/storage/item-images.ts for item picture uploads.
   SUPABASE_SERVICE_ROLE_KEY=""

   # Custom JWT session secret (HS256). Use a long random string.
   SESSION_SECRET=""

   # Shared secret for GET /api/cron/mark-overdue.
   # Use a long random string (e.g. openssl rand -hex 32).
   # If missing, the route refuses to run.
   CRON_SECRET=""

   # Email (Resend)
   RESEND_API_KEY=""
   EMAIL_FROM="BRIMS <onboarding@resend.dev>"
   EMAIL_SANDBOX="true"
   EMAIL_SANDBOX_TO=""        # your Resend account email (dev only)
   APP_BASE_URL="http://localhost:3000"
   ```

   Local development uses email sandbox mode — every email goes to `EMAIL_SANDBOX_TO`. Set it to your own Resend account email.

3. Run `supabase-item-images-bucket.sql` in the Supabase SQL editor to create the item image storage bucket.

4. Generate the Prisma client:

   ```bash
   npx prisma generate
   ```

5. Run `prisma/seed.sql` in the Supabase SQL editor to seed initial data.

## Usage

Start the development server:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). Restart the server after editing either env file.

Run the overdue job by hand during local development:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/mark-overdue
```

Other scripts:

```bash
npm run build    # production build
npm run start    # run the production build
npm run lint     # lint the project
```

## Deployment

`vercel.json` schedules the overdue job daily at midnight UTC (8:00 AM Manila) on Vercel production.

Before going to production:

- Set `EMAIL_SANDBOX="false"`
- Set `EMAIL_FROM` using a domain verified in Resend (e.g. `BRIMS <no-reply@your-domain>`)
- Set `APP_BASE_URL` to the real site address
- Set a production `RESEND_API_KEY`
- Remove `allowedDevOrigins` from `next.config.js` (the ngrok tunnel entry — `serverActions.bodySizeLimit` stays)
- Delete `app/dev/email-test/` (temporary dev page)

See `PROJECT-OVERVIEW.md` for the full pre-production checklist.

## Project Structure

```
nvsu-brims/
├── app/
│   ├── (dashboard)/
│   │   ├── admin/
│   │   │   ├── borrowed-items/   (actions.ts, borrowed-items-table.tsx, page.tsx)
│   │   │   ├── history/          (history-table.tsx, page.tsx)
│   │   │   ├── items/            (actions.ts, items-table.tsx, page.tsx)
│   │   │   ├── logs/             (logs-table.tsx, page.tsx)
│   │   │   ├── requests/         (actions.ts, page.tsx, requests-table.tsx)
│   │   │   ├── sign-up-requests/ (actions.ts, page.tsx, sign-up-requests-table.tsx)
│   │   │   ├── users/            (actions.ts, page.tsx, users-table.tsx)
│   │   │   ├── home-view.tsx
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── borrower/
│   │   │   ├── borrowed-items/   (borrowed-items-table.tsx, page.tsx)
│   │   │   ├── catalog/          (actions.ts, catalog-view.tsx, page.tsx)
│   │   │   ├── history/          (history-table.tsx, page.tsx)
│   │   │   ├── requests/         (actions.ts, page.tsx, requests-table.tsx)
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── actions.ts
│   │   └── layout.tsx
│   ├── (public)/
│   │   ├── (sections)/
│   │   │   ├── about/page.tsx
│   │   │   ├── faqs/page.tsx
│   │   │   └── items-equipment/  (items-equipment-view.tsx, page.tsx)
│   │   ├── sign-in/              (actions.ts, page.tsx)
│   │   ├── sign-out/actions.ts
│   │   ├── sign-up/              (actions.ts, page.tsx)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/
│   │   ├── back-to-home/route.ts
│   │   ├── borrowed-items-count/route.ts
│   │   ├── borrower/borrowed-items-count/route.ts
│   │   ├── cron/mark-overdue/route.ts
│   │   ├── me/route.ts
│   │   ├── pending-requests-count/route.ts
│   │   ├── pending-sign-ups-count/route.ts
│   │   ├── session-expired/route.ts
│   │   └── unauthorized-access/route.ts
│   ├── dev/email-test/           (TEMPORARY — delete before production)
│   ├── globals.css
│   ├── layout.tsx
│   └── not-found.tsx
├── components/
│   ├── shared/
│   │   ├── dashboard/            (confirm-dialog, data-table, date-picker, filter-bar,
│   │   │                          form-dialog, form-field, header, profile-dialog,
│   │   │                          sidebar, under-construction)
│   │   ├── app-toaster.tsx
│   │   └── empty-state.tsx
│   └── ui/                       (shadcn/ui primitives — never edit directly)
├── data/colleges.ts
├── hooks/
│   ├── use-hover-menu.ts
│   ├── use-media-query.ts
│   └── use-mobile.ts
├── lib/
│   ├── generated/prisma/         (generated Prisma Client — do not edit)
│   ├── email/
│   │   ├── templates/            (12 email templates + shared layout)
│   │   ├── config.ts
│   │   ├── notify.ts
│   │   ├── recipients.ts
│   │   └── send.ts
│   ├── repositories/             (activity-logs, borrowings, inventory, users)
│   ├── storage/item-images.ts
│   ├── supabase/admin.ts         (service-role client for Storage writes)
│   ├── contact-number.ts
│   ├── dates.ts
│   ├── id-number.ts
│   ├── pending-counts.ts
│   ├── reject-reasons.ts
│   ├── require-admin.ts
│   ├── require-borrower.ts
│   ├── roles.ts
│   ├── session.ts
│   └── session-config.ts
├── prisma/
│   ├── schema.prisma
│   ├── db.ts
│   └── seed.sql
├── .env.example
├── next.config.js
├── package.json
├── prisma.config.ts
├── proxy.ts
├── tsconfig.json
└── vercel.json                   (daily cron schedule)
```

Notes:

- `app/dev/email-test/` is a temporary dev-only page. Delete it before production.
- `lib/generated/prisma/` is generated by `npx prisma generate`. Do not edit it.
- `next.config.js` contains an `allowedDevOrigins` key for ngrok testing. Remove it before deploying. The `serverActions.bodySizeLimit` setting stays.
- `prisma/seed.sql` is run once by hand in the Supabase SQL editor.
- `lib/supabase/admin.ts` is the only Supabase SDK file in use — `client.ts` and `server.ts` were removed (unused; all DB access goes through Prisma).
- `PROJECT-OVERVIEW.md` lists every server action and the pre-production checklist. `PROJECT-STRUCTURE.md` has the sandbox filename map used in this chat.

## Author

👤 **reddokunn**

## Show your support

Give a ⭐️ if this project helped you!