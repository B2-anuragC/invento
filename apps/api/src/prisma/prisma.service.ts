import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    super({
      datasourceUrl: configService.get<string>('DATABASE_URL'),
    });
  }

  async onModuleInit() {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      this.logger.log('Test environment detected. Prisma connection is skipped.');
      return;
    }

    await this.$connect();
    this.logger.log('Prisma connected successfully.');
  }

  async onModuleDestroy() {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }

    await this.$disconnect();
    this.logger.log('Prisma disconnected successfully.');
  }

  async ping() {
    await this.$queryRaw`SELECT 1 as ok`;
  }
}
