import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({ imports: [AuthModule, InventoryModule], controllers: [ProductsController], providers: [ProductsService] })
export class ProductsModule {}
