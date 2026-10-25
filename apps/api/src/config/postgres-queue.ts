import { BullModule } from '@nestjs/bullmq';
import { createPostgresBackend, withBackend, type ConnectionOptions, type PostgresPoolConfig } from 'bullmq';

// Nest's public class hooks keep producers and decorated workers on the same backend.
export const postgresQueues = withBackend(createPostgresBackend);
BullModule.queueClass = postgresQueues.Queue;
BullModule.workerClass = postgresQueues.Worker;
BullModule.flowProducerClass = postgresQueues.FlowProducer;

export function postgresQueueConnection(databaseUrl: string): PostgresPoolConfig {
  const url = new URL(databaseUrl);
  // Prisma's namespace parameter is not a node-postgres option. Queue tables
  // always live in their own schema, independently of the application's schema.
  url.searchParams.delete('schema');
  return { connectionString: url.toString(), schema: 'invento_queue', migrate: true, max: 4 };
}

export function nestQueueConnection(databaseUrl: string): ConnectionOptions {
  // @nestjs/bullmq still declares Redis-only connection types. Its runtime passes
  // this object unchanged to the PostgreSQL classes registered above.
  return postgresQueueConnection(databaseUrl) as unknown as ConnectionOptions;
}
