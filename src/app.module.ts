import { Module } from '@nestjs/common';
import { MediasoupModule } from './mediasoup/mediasoup.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggingModule } from './logging/logging.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'local'}`,
      isGlobal: true,
    }),
    LoggingModule,
    MediasoupModule,
  ],
})
export class AppModule {}
