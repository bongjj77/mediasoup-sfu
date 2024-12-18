import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CustomLogger } from './logging/custom-logger.service';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Winston Logger 가져오기
  const logger = app.get(CustomLogger);
  app.useLogger(logger); // NestJS의 Logger 설정

  const configService = app.get(ConfigService);
  const env = configService.get<string>('NODE_ENV');
  const startTime = new Date();
  logger.log(`App Start(${startTime.toISOString()}) env(${env})`);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
