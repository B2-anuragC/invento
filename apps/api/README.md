<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

### Background file processing (BullMQ)

Start Redis with `docker compose up -d redis` before running the backend locally.
The backend explicitly depends on `ioredis` and configures BullMQ’s client
factory so Redis connections work in native ESM and close with BullMQ. After
dependency changes, restart the Docker backend to rerun its startup install:
`docker compose up -d --build --force-recreate backend`.

Configure `REDIS_HOST`, `REDIS_PORT`, optional `REDIS_PASSWORD`, and `REDIS_DB`
using `.env.example`. Docker configures Redis automatically and persists its
queue with AOF; eviction is disabled.

`POST /api/files/jobs` accepts the same `{ name, mimeType, base64, kind }` body
as the existing upload endpoint and returns HTTP 202 with `{ jobId, statusUrl }`.
Poll `GET /api/files/jobs/:jobId` using the same access token and business header.
When `state` is `completed`, `result` contains the stored attachment URLs, ready
for use in product, customer, sale, or purchase requests. When `state` is `failed`,
show `error` and let the user submit a corrected file. The global API response
wrapper applies to these endpoints as usual. Only active owners/admins can
submit or inspect jobs; job lookups are scoped to their business.

`POST /api/files` remains compatible: it queues processing and waits up to two
minutes for the existing attachment response. A timeout returns HTTP 503 with
the job ID and status URL so clients can check progress. Internal legacy data-URL
conversion and migration still use `FilesService` directly.

The Nest worker runs alongside the API with concurrency 2, three attempts, and
exponential retry delays. Invalid files fail without retries. Image resizing,
PDF previews (requiring Poppler), and the initial S3 mirror run in the worker;
existing S3 recovery behavior remains in place. Sources are staged under
`UPLOAD_STORAGE_PATH/.jobs`; Redis stores only metadata and file references.
All API/worker replicas must share that persistent upload directory. Successful
jobs remove their source; failed sources remain for diagnosis/retry. Periodically
remove staging files for expired jobs and orphaned submissions (after checking
Redis and allowing for active uploads). Completed job status is retained up to
24 hours/1,000 jobs; failed status up to seven days/1,000 jobs. File attachments
remain available independently of job retention.

Additional long-running tasks can register their own queues using the root
BullMQ connection and a Nest `WorkerHost` processor.

### Product photo galleries

Products accept an optional `images` array of up to six objects containing an
uploaded `imageOriginal` reference (and optional `imageThumbnail`). Every original
must belong to the same business and be a product upload. The server derives
thumbnail references and rejects duplicate originals. Array order determines the
cover: the first photo also populates the existing `imageOriginal` and
`imageThumbnail` fields used by product grids. An empty array removes all photos;
omitting image fields preserves them on update. Legacy single-photo requests
remain supported, and older products display their existing photo as a gallery
fallback. Product detail and offline snapshots include the gallery; list responses
retain the compact cover fields.

Apply the `20261015000000_product_gallery` migration before running this version:
`npm --prefix apps/api run prisma:migrate:deploy` followed by
`npm --prefix apps/api run prisma:generate`. Docker startup performs these steps.
## Platform administration

The separate `apps/admin/` workspace uses this backend's `/api/platform-admin` module.
See [admin setup, access policy, migrations, and verification](../admin/README.md).
Platform and business permissions remain separate; restrictions are stored and checked
in PostgreSQL. Redis and BullMQ are not required for this feature.

## Centralized business authorization

Business-local roles and granular permissions are shared by web and mobile. See [authorization model, API contracts, preservation migration, and tests](../../docs/AUTHORIZATION.md). Apply `20261025000000_business_permissions` and regenerate Prisma before deploying the backend and clients together. Business roles cannot grant platform privileges.
