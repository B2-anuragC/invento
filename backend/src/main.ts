import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { globalValidationPipe } from './common/pipes/validation.pipe.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('APP_API_PREFIX', 'api');
  const appPort = configService.get<number>('PORT', 3000);

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(globalValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors();
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
      .setTitle('Invento API')
      .setDescription('API foundation for the Invento inventory management platform.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(appPort);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

await bootstrap();
