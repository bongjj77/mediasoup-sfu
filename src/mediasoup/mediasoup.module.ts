import { Module } from '@nestjs/common';
import { MediasoupGateway } from './mediasoup.gateway';
import { MediasoupService } from './mediasoup.service';

@Module({
  providers: [MediasoupGateway, MediasoupService],
  exports: [MediasoupService],
})
export class MediasoupModule {}
