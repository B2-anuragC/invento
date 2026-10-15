import { BullModule } from '@nestjs/bullmq';
import { FileJobsService, FILE_QUEUE } from './file-jobs.service.js';
import { FileProcessor } from './file.processor.js';
import { FileMigrationService } from './file-migration.service.js';
import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';
@Global()
@Module({ imports: [AuthModule, BullModule.registerQueue({ name: FILE_QUEUE })], controllers: [FilesController], providers: [FilesService, FileMigrationService, FileJobsService, FileProcessor], exports: [FilesService] })
export class FilesModule {}
