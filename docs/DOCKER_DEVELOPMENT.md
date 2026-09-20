# Docker Development

The development stack runs PostgreSQL and the NestJS backend in Docker while
the Expo frontend continues to run on the host.

## Start

From the repository root:

```bash
npm run docker:dev
```

The backend is available at `http://localhost:3000`. Swagger is available at
`http://localhost:3000/docs`.

The backend and shared package source directories are bind-mounted into the
container. Nest watches backend changes and restarts automatically. The shared
package runs TypeScript in watch mode so its compiled output stays current.
Polling is enabled for both watchers because native filesystem events from
Windows bind mounts are not always delivered reliably to containers.

## Logs

```bash
npm run docker:dev:logs
```

## Stop

```bash
npm run docker:dev:down
```

The development override keeps the production Dockerfile and production
startup command unchanged. The first startup may build the image and prepare
the Prisma client/migrations; later source edits do not require an image
rebuild.

After changing Compose or watcher configuration, recreate the development
containers so the new command/configuration is applied:

```bash
npm run docker:dev:down
npm run docker:dev
```

Docker Desktop must be running. If file changes are not detected on Windows,
restart the stack after enabling Docker Desktop file sharing for the
repository drive.
