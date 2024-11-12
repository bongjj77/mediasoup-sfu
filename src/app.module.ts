import { Module } from '@nestjs/common';
import { MediasoupModule } from './mediasoup/mediasoup.module';

@Module({
  imports: [MediasoupModule],
})
export class AppModule {}
