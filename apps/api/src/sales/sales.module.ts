import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({ imports: [AuthModule, InventoryModule], controllers: [SalesController], providers: [SalesService] })
export class SalesModule {}
