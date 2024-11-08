import { Injectable } from '@nestjs/common';
import { resolveObjectURL } from 'buffer';
import * as mediasoup from 'mediasoup';

type Room = {
  producers: Map<string, mediasoup.types.Producer>;
};

@Injectable()
export class MediasoupService {
  public worker: mediasoup.types.Worker;
  public router: mediasoup.types.Router;
  private transports = new Map<string, mediasoup.types.WebRtcTransport>();
  private rooms = new Map<string, Room>();

  /**
   * 초기화
   */
  async initializeWorker(): Promise<void> {
    this.worker = await mediasoup.createWorker();
    this.router = await this.worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
        },
      ],
    });
  }

  /**
   * Room 생성
   */
  async createRoom(roomId: string) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        producers: new Map<string, mediasoup.types.Producer>(),
      });
    }
    return this.rooms.get(roomId);
  }

  /**
   * Room 찾기
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Room에서 producer 추가
   */
  addProducer(roomId: string, producer: mediasoup.types.Producer): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.error(`Room ${roomId} not found when adding producer`);
      return;
    }

    room.producers.set(producer.id, producer);
  }

  /**
   * Room에서 producer 조회
   */
  getProducer(
    roomId: string,
    producerId: string,
  ): mediasoup.types.Producer | undefined {
    const room = this.rooms.get(roomId);
    return room?.producers.get(producerId);
  }

  /**
   * Transport 생성
   */
  async createTransport(): Promise<mediasoup.types.WebRtcTransport> {
    const transport = await this.router.createWebRtcTransport({
      listenIps: [{ ip: '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true,
    });
    this.transports.set(transport.id, transport);
    return transport;
  }

  /**
   * Transport 조회
   */
  getTransport(
    transportId: string,
  ): mediasoup.types.WebRtcTransport | undefined {
    return this.transports.get(transportId);
  }
}
