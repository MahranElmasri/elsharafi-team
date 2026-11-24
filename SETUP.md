# Production setup

This guide takes the app from this repository to production:

- **Database:** Supabase project `jvmehkgacwozfmuyiuyo` (EU)
- **App:** Vercel, at `https://plan.mvz-elsharafi.de`

Do the steps in order. Every command runs in the project folder on your Mac.

---

## 0. What you need

- Access to the Supabase project in the Supabase dashboard.
- Access to the Vercel project that serves `plan.mvz-elsharafi.de`.
- The database password of the Supabase project. If you don't have it, reset it under Dashboard → Project Settings → Database.
- Node.js and the dependencies (`npm install`).
- The SMTP login of the practice mailbox (host, port, user, password).

> Keys and passwords never go into git, chat or this file. Put them only into the Vercel and Supabase dashboards, or into a local `.env*` file (these are git-ignored).

---

## 1. Database: apply the migrations

The tables, functions, security rules (RLS) and scheduled jobs are all defined in `supabase/migrations/`. One command copies them to production.

1. Log in to the Supabase CLI. This opens the browser once:
   ```bash
   npx supabase login
   ```
2. Connect this folder to the production project. The CLI asks for the database password:
   ```bash
   npx supabase link --project-ref jvmehkgacwozfmuyiuyo
   ```
3. See which migrations production is missing. This changes nothing:
   ```bash
   npx supabase migration list
   npx supabase db push --dry-run
   ```
4. Apply them:
   ```bash
   npx supabase db push
   ```
5. Check again. Every line in `migration list` must now have the same name under **Local** and **Remote**:
   ```bash
   npx supabase migration list
   ```

Rules:
- Never edit a migration that is already applied. A change always goes into a new migration file.
- Never run `npx supabase db reset` against production. It deletes all data.

---

## 2. Database: secrets for reminders and push

The database calls the app every day for reminders, and whenever a push notification is due. It needs two values stored in the Supabase Vault.

1. Make a random secret on your Mac, and keep it for step 4 (Vercel):
   ```bash
   openssl rand -hex 32
   ```
2. In the Supabase dashboard, open **SQL Editor** and run the following. Replace `<SECRET>` with the value from step 1:
   ```sql
   select vault.create_secret('https://plan.mvz-elsharafi.de', 'app_url');
   select vault.create_secret('<SECRET>', 'cron_secret');
   ```
   If a secret already exists, this gives an error. To change it instead:
   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'cron_secret'),
     '<SECRET>'
   );
   ```
3. Check that both are there (this shows names only):
   ```sql
   select name from vault.secrets;
   ```

The migrations already schedule the jobs (`daily-reminders` at 06:00 UTC, `purge-health-data` monthly). To see them:
```sql
select jobname, schedule from cron.job;
```

---

## 3. Supabase Auth settings

In the Supabase dashboard, under **Authentication**:

- **Sign In / Providers → Email:** enabled.
- **Sign In / Providers → "Allow new users to sign up":** **off**. Accounts are only created by the admin in the app.
- **URL Configuration → Site URL:** `https://plan.mvz-elsharafi.de`

---

## 4. Vercel: environment variables

In Vercel, open the project → **Settings → Environment Variables**, and set these for **Production**:

| Variable | Value / where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jvmehkgacwozfmuyiuyo.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → `anon` / publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` / secret. Server only, never in the browser. |
| `APP_URL` | `https://plan.mvz-elsharafi.de` |
| `CRON_SECRET` | The same value as `cron_secret` in step 2 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | The practice mailbox. Port `465` uses SSL; any other port uses STARTTLS. |
| `MAIL_FROM` | Sender shown in emails, e.g. `MVZ El-Sharafi <kontakt@mvz-elsharafi.de>` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Make them once with `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:` plus an admin address, e.g. `mailto:kontakt@mvz-elsharafi.de` |

If SMTP is missing, the app sends no emails and only writes them to the log. If the VAPID keys are missing, push notifications are off.

After you change a variable, deploy again (step 5). The new values only apply to new deployments.

---

## 5. Vercel: domain and deploy

1. **Domain:** in Vercel → project → **Settings → Domains**, add `plan.mvz-elsharafi.de`. Then set the DNS record that Vercel shows at your domain provider.
2. **Deploy:** the project is connected to GitHub. Every push to the `main` branch deploys to production automatically:
   ```bash
   git push origin main
   ```
   You can follow the build in Vercel → **Deployments**. It takes about one minute.
3. **Order matters:** when a release contains a new migration, run `npx supabase db push` (step 1) **before** you push to `main`. Otherwise the new app code can call database functions that don't exist yet.

> There are currently three Vercel projects that deploy this repository (`elsharafi-team`, `team-plan.elsharfi`, `elsharafi-plan-team`). Only the one that owns `plan.mvz-elsharafi.de` is needed. Delete the others, so that every push builds only once.

---

## 6. First admin and staff

**First admin.** This is only needed once, on an empty database. Put the production values from step 4 into a local file `.env.production.local`, then run:
```bash
node --env-file=.env.production.local scripts/create-admin.mjs <username> "<Full Name>" '<password>' [email]
```
The admin logs in at `https://plan.mvz-elsharafi.de/login` and changes the password.

**Staff.** Add staff in the app under **Mitarbeitende**. Each person then gets an invite link (by email or QR code) and sets their own password.

**Staff from another database (SQL file).** If you received a `.sql` file with staff accounts, open Supabase → **SQL Editor**, paste the whole file and click **Run**. These files skip people who already exist, so running one twice is safe. Afterwards, send each new person an invite from **Mitarbeitende**.

---

## 7. Check that production works

1. Open `https://plan.mvz-elsharafi.de/login`. You see the login form with "Angemeldet bleiben".
2. Log in as admin. You see the month grid.
3. **Email:** add an employee with your own address and send an invite. The email arrives.
4. **Push:** on a phone, add the app to the home screen, then turn on notifications in Meldungen.
5. **Reminders:** in the SQL Editor, run the line below. Then open Vercel → **Logs**: `/api/cron/reminders` must answer with status `200`, not `401`. A `401` means `CRON_SECRET` and the Vault `cron_secret` are not the same.
   ```sql
   select public.call_reminders_endpoint();
   ```

---

## 8. Later updates (routine)

1. Develop and test locally (`npm test`, `npx supabase test db`, `npm run test:e2e`).
2. If there is a new file in `supabase/migrations/`, run `npx supabase db push --dry-run`, then `npx supabase db push`.
3. Merge into `main` and push. Vercel deploys.
4. Open the production site and check the change.

**Going back:** in Vercel → **Deployments**, choose the previous deployment → **Promote to Production**. This rolls back the app only, not the database. A database change is undone with a new migration.

**Backup:** an admin can download the JSON backup in the app at any time. On a paid Supabase plan, Supabase also keeps daily backups, under Dashboard → Database → Backups.
