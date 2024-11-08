import { Module } from '@nestjs/common';
import { MediasoupGateway } from './mediasoup/mediasoup.gateway';
import { MediasoupService } from './mediasoup/mediasoup.service';
import { MediasoupModule } from './mediasoup/mediasoup.module';

@Module({
  imports: [MediasoupModule],
})
export class AppModule {}
