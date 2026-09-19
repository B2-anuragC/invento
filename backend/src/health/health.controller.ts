import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async getHealth() {
    let databaseStatus = 'connected';

    try {
      await this.prismaService.ping();
    } catch {
      databaseStatus = 'disconnected';
    }

    return {
      status: databaseStatus === 'connected' ? 'ok' : 'degraded',
      database: databaseStatus,
      uptime: Number(process.uptime().toFixed(3)),
      timestamp: new Date().toISOString(),
    };
  }
}
