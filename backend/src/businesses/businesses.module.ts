import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BusinessesController } from './businesses.controller.js';
import { BusinessesService } from './businesses.service.js';

@Module({ imports: [AuthModule], controllers: [BusinessesController], providers: [BusinessesService] })
export class BusinessesModule {}
