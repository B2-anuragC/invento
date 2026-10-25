# Upload storage

Product images, customer photos, sale bill photos and purchase reference files
use the shared `/api/files` service. The database stores relative file references
and attachment metadata, never the file bytes. Existing base64 product/sale
photos, purchase attachments and saved sync responses are converted at startup.
Conversion publishes files before updating records and is safe to retry.

Images are auto-oriented, stripped of metadata and compressed into WebP:
- Full-size: fits within 1600 × 1600, quality 80.
- Thumbnail: fits within 320 × 320, quality 65.
- Aspect ratio is preserved; small images are never enlarged.

The full-size image is the compressed version, not an untouched source copy.
PDF bytes remain unchanged. Poppler renders the first page into a WebP thumbnail.
Other purchase files get a generic document thumbnail. Uploads accept up to
10 MB; image decoding is limited to 40 megapixels. File downloads require a
signed-in user with active membership in the selected business. Purchase files
also respect the purchase-price visibility setting. Files are not public static
assets, and S3 objects are private.

## Local storage

`UPLOAD_STORAGE_PATH` chooses the server's app-owned directory (default
`apps/api/uploads` when launched from the backend directory). It contains:

```
<business-id>/<content-hash>/original
<business-id>/<content-hash>/thumbnail
<business-id>/<content-hash>/metadata.json
```

Docker uses `/app/uploads` in the persistent `upload_data` named volume. Keep
this volume alongside database backups. Recreating containers preserves files;
`docker compose down --volumes` removes the files as well as database volumes.
On a host without Docker, install `pdftoppm` (Poppler) for PDF previews.

Native devices first save selected files in the app's document directory.
Image versions are compressed locally; PDFs get a document icon while offline.
The actual PDF page preview is generated on the server when uploaded. Local
catalog records and transaction drafts store paths. On sync/save, local files
are uploaded before their records, and returned references are cached in a
physical sidecar file so retries reuse them. Previously viewed remote images
are cached in the app's document directory. Existing base64 offline snapshots
and drafts are converted to physical files when opened. Web selections upload
immediately and retain only returned references in form state/drafts.

## Optional S3 mirror

Without `S3_BUCKET`, uploads remain local. To enable S3 in Docker, put these
settings in the root `.env` (Compose passes them to the backend). For a backend
running directly, use `apps/api/.env` or process environment variables:

```dotenv
S3_BUCKET=my-private-bucket
S3_REGION=ap-south-1
S3_PREFIX=invento
# Optional static credentials; IAM/default AWS credentials also work.
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Optional for temporary credentials or an S3-compatible test server:
AWS_SESSION_TOKEN=
S3_ENDPOINT=
```

The backend writes both files locally first, then uploads both to S3 with their
content types. It keeps the local copy. Failed cloud uploads remain pending and
retry at startup and every 60 seconds; a failed cloud request does not lose the
attachment or block local use. Existing local uploads are also mirrored when S3
is enabled later. If a local file is missing and metadata confirms the cloud
upload completed, downloads can retrieve the object from S3. Required bucket
permissions are `s3:PutObject` and `s3:GetObject` for the configured prefix.
No public bucket policy is needed.

## Run the updated backend

```sh
npm run docker:dev
```

Or for the base Compose setup:

```sh
docker compose up -d --build backend
```

The image installs Poppler, startup refreshes dependencies, generates Prisma,
applies the customer-photo migration and builds/starts the current backend.
Keep the local upload volume even when cloud mirroring is enabled: sidecar
metadata and any pending files live there. Uploads are immutable and replacement
leaves prior files intact. Automatic orphan cleanup is not implemented.
