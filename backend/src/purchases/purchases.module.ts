import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';

@Module({ imports: [AuthModule, InventoryModule], controllers: [PurchasesController], providers: [PurchasesService] })
export class PurchasesModule {}
