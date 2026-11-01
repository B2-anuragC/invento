# Deployment: Render + Supabase

```
 mobile (Expo) ─┐
                ├──► Render: invento-api (Docker, Singapore)
 admin ─────────┘      │  persistent disk /app/uploads
 (Render static site)  ├──► Supabase Postgres (session pooler)
                       └──► Supabase Storage bucket (S3 mirror of uploads)
```

- **API**: the existing [apps/api/Dockerfile](../apps/api/Dockerfile) on a Render
  web service, with no code changes. Migrations run on container start (`prisma migrate deploy`).
- **Database**: Supabase Postgres. The Postgres-backed upload queue (BullMQ) lives in the `invento_queue` schema of the same database.
- **Files**: written to the Render disk, then copied to a private Supabase
  Storage bucket by the existing S3 mirror. If a local file is lost, it's
  re-read from the bucket.
- **Admin**: Render static site.
- **Config**: both services are defined in [render.yaml](../render.yaml).

Keep **Render and Supabase in the same region (Singapore)**. Each API request
makes several DB queries, so distance between the two adds up quickly.

---

## 1. Supabase

1. **Create the project** at supabase.com → New project. Region **Southeast Asia (Singapore)**. Save the database password.
   Use the Pro plan for production: daily backups and no pausing when idle.
2. **Database connection string**: Connect → **Session pooler**. Copy the URI and append `?connection_limit=5`:
   ```
   postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?connection_limit=5
   ```
   - Use the *session* pooler (port 5432), not the transaction pooler (6543). The
     upload queue needs a session connection, and Render can't reach the
     IPv6-only "direct" host.
   - URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, …).
3. **Lock down the Data API.** Supabase exposes the `public` schema over REST,
   and the app doesn't use it. Under Project Settings → Data API, turn it off or
   remove `public` from the exposed schemas. Otherwise anyone with the project's
   anon key can read and write the tables.
4. **Storage bucket**: Storage → New bucket → `invento-files`, **private**, file size limit 10 MB.
5. **S3 keys**: Project Settings → Storage → S3 Connection. Copy the **Endpoint**
   (`https://<ref>.storage.supabase.co/storage/v1/s3`) and **Region**, then
   create an **access key** pair. These become `S3_ENDPOINT`, `S3_REGION`,
   `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

## 2. Render

1. Push this branch (with `render.yaml`) to GitHub and merge it into `master`.
2. Go to dashboard.render.com → **New → Blueprint**, connect the `invento` repo, and select `render.yaml`.
3. Fill in the secrets it asks for:

   | Service | Key | Value |
   |---|---|---|
   | invento-api | `DATABASE_URL` | Session pooler URI from step 1.2 |
   | invento-api | `S3_ENDPOINT` | Storage S3 endpoint |
   | invento-api | `S3_REGION` | e.g. `ap-southeast-1` |
   | invento-api | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Storage S3 key pair |
   | invento-admin | `VITE_API_URL` | `https://invento-api.onrender.com/api` (or your custom domain) |

   The JWT secrets are generated automatically. Keep them stable: changing them signs everyone out.
4. **Apply.** The first API deploy builds the image, runs every Prisma migration against Supabase, and starts the server.
5. **Verify**:
   ```sh
   curl https://invento-api.onrender.com/api/health
   # {"status":"ok","database":"connected",...}
   ```
   - Open `https://invento-api.onrender.com/docs` (Swagger).
   - Sign up, create a product with a photo, then confirm the object appears in
     Supabase Storage under `invento/<businessId>/…`.
6. **Platform admin**: grant the first admin user with
   [grant-platform-admin.mjs](../apps/api/scripts/grant-platform-admin.mjs).
   Run it from your machine with `DATABASE_URL` set to the Supabase URI, or from
   the Render service's Shell tab.

### Custom domains (optional)

Render service → Settings → Custom Domains. For example, `api.<domain>` for the
API and `admin.<domain>` for the admin app. Add the CNAME records it shows, and
TLS is issued automatically. Then update `VITE_API_URL` and the mobile app's API
URL.

## 3. Mobile app

Set the production API URL before building, either in the EAS build profile env
or in `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=https://invento-api.onrender.com/api
```

Then build with EAS (or the local APK flow in [LOCAL_ANDROID_APK.md](LOCAL_ANDROID_APK.md)).

## 4. Day-to-day

- **Deploys**: merging to `master` deploys whichever service's files changed
  (`buildFilter`). Each API deploy causes a few seconds of downtime, because a
  service with a disk runs as a single instance.
- **Migrations**: create them locally with `npm --workspace @invento/api run prisma:migrate:dev`
  and commit them. Production applies them on the next deploy. Keep migrations
  backward-compatible: add columns as nullable first.
- **Rollback**: Render service → Events → pick an earlier deploy → Rollback. A
  rollback doesn't undo migrations, which is another reason to keep them
  additive.
- **Logs and shell**: Render service → Logs and Shell tabs.
- **Backups**: Supabase backs up the database. Supabase Storage holds a copy of
  every upload, and Render also snapshots the disk daily.

## 5. Moving data from the existing Docker install (only if needed)

1. Run the current backend once with the old data, so legacy base64 photos are converted to files.
2. Copy the database, skipping the old queue schema:
   ```sh
   pg_dump --no-owner --no-acl -N invento_queue -Fc "postgresql://invento:invento@localhost:5432/invento_dev" > invento.dump
   pg_restore --no-owner --no-acl -d "<supabase session pooler URI>" invento.dump
   ```
3. Files: run the local backend against the old `uploads` folder with the
   Supabase `S3_*`/`AWS_*` values set. Its retry loop copies every file to the
   bucket.
4. Then copy the `uploads` folder onto the Render disk. Run
   `tar czf uploads.tgz -C <uploads dir> .` locally, upload the archive, and
   extract it into `/app/uploads` from the Render Shell. Alternatively, skip this
   step: missing local files are read from the bucket automatically, but only if
   their `metadata.json` exists on the disk, so the folder of manifests still
   has to be copied.

## Known limits

- **Single API instance** while uploads depend on the local disk. Scaling
  out needs the uploads to move fully to Storage, with manifests in the database.
- **CORS is open** (`app.enableCors()` in [main.ts](../apps/api/src/main.ts)).
  Restrict it to the admin origin once domains are fixed.
- **TLS to Supabase**: Prisma already uses TLS when the server supports it. The
  upload queue's `pg` connection doesn't. To enforce TLS for it, turn on "Enforce
  SSL" in Supabase and add `sslmode=require` to `DATABASE_URL`. Test it on
  staging first: newer `pg` versions also verify the certificate, which may need
  Supabase's CA certificate.
