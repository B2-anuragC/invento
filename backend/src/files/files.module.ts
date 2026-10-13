import { FileMigrationService } from './file-migration.service.js';
import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
@Global()
@Module({ imports: [AuthModule], controllers: [FilesController], providers: [FilesService, FileMigrationService], exports: [FilesService] })
export class FilesModule {}
