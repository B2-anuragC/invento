import { FilesModule } from './files/files.module.js';
import { BullModule } from '@nestjs/bullmq';
import { createIORedisClient, RedisConnection } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PlatformAdminModule } from './platform-admin/platform-admin.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { appConfig, envValidationSchema } from './config/app.config.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BusinessesModule } from './businesses/businesses.module.js';
import { ProductsModule } from './products/products.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { SalesModule } from './sales/sales.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { SyncModule } from './sync/sync.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validationSchema: envValidationSchema,
      load: [appConfig],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Explicit driver loading also works when BullMQ runs as native ESM.
        // Factory-created connections remain owned and closed by BullMQ.
        RedisConnection.clientFactory = (options) => createIORedisClient(new Redis(options));
        return {
          connection: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD') || undefined,
            db: config.get<number>('REDIS_DB', 0),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    PrismaModule,
    FilesModule,
    PlatformAdminModule,
    HealthModule,
    AuthModule,
    BusinessesModule,
    ProductsModule,
    InventoryModule,
    SuppliersModule,
    PurchasesModule,
    CustomersModule,
    SalesModule,
    DashboardModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
