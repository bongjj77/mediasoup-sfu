import { Injectable } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { CustomLogger } from 'src/logging/custom-logger.service';

type Room = {
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
};

@Injectable()
export class MediasoupService {
  public worker: mediasoup.types.Worker;
  public router: mediasoup.types.Router;
  private rooms = new Map<string, Room>();

  constructor(private readonly logger: CustomLogger) {}
  /**
   * 초기화
   * - worker/router 생성
   */
  async initializeWorker(): Promise<void> {
    this.worker = await mediasoup.createWorker({
      rtcMinPort: 40000, // 최소 포트
      rtcMaxPort: 49999, // 최대 포트
    });
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
   * Room client 리소스 정리
   */
  cleanupClientResources(roomId: string, clientId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      this.logger.warn(
        `Cleanup requested for client(${clientId}), but room(${roomId}) not found.`,
      );
      return;
    }

    for (const [transportId, transport] of room.transports) {
      if (transport.appData.clientId === clientId) {
        transport.close();
        room.transports.delete(transportId);
        this.logger.debug(`Transport(${transportId}) closed and removed.`);
      }
    }

    for (const [producerId, producer] of room.producers) {
      if (producer.appData.clientId === clientId) {
        producer.close();
        room.producers.delete(producerId);
        this.logger.debug(`Producer(${producerId}) closed and removed.`);
      }
    }

    // 모든 자원이 정리된 경우 방 삭제
    if (room.transports.size === 0 && room.producers.size === 0) {
      this.rooms.delete(roomId);
      this.logger.debug(`Room(${roomId}) deleted as no resources remain.`);
    }
  }

  /**
   * Room 생성
   */
  async createRoom(roomId: string) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        transports: new Map<string, mediasoup.types.WebRtcTransport>(),
        producers: new Map<string, mediasoup.types.Producer>(),
      });
    }
    return this.rooms.get(roomId);
  }

  /**
   * Room의 모든 Producers 반환
   */
  getProducers(roomId: string): mediasoup.types.Producer[] {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }
    return Array.from(room.producers.values());
  }

  /**
   * Room 찾기
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Transport 생성
   */
  async createTransport(roomId: string, clientId: string) {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const transport = await this.router.createWebRtcTransport({
      listenIps: [
        { ip: '0.0.0.0', announcedIp: '3.38.19.181' }, // EC2 퍼블릭 IP 또는 도메인
      ],
      enableUdp: true,
      enableTcp: true,
      appData: { clientId }, // clientId 저장
    });
    room.transports.set(transport.id, transport);
    return transport;
  }

  /**
   * Room의 Transport를 연결 (connect)
   */
  async connectTransport(
    roomId: string,
    transportId: string,
    dtlsParameters: mediasoup.types.DtlsParameters,
  ): Promise<void> {
    const transport = this.getTransport(roomId, transportId);

    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }

    await transport.connect({ dtlsParameters });
  }

  /**
   * Transport 조회
   */
  getTransport(
    roomId: string,
    transportId: string,
  ): mediasoup.types.WebRtcTransport | undefined {
    const room = this.getRoom(roomId);
    return room?.transports.get(transportId);
  }

  /**
   * Room에서 Producer 추가
   */
  addProducer(roomId: string, producer: mediasoup.types.Producer): void {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }
    room.producers.set(producer.id, producer);
  }

  /**
   * Room 내 특정 Producer 조회
   */
  getProducer(
    roomId: string,
    producerId: string,
  ): mediasoup.types.Producer | undefined {
    const room = this.getRoom(roomId);
    return room?.producers.get(producerId);
  }

  /**
   *
   */
  async createProducer(
    roomId: string,
    transportId: string,
    kind: mediasoup.types.MediaKind,
    rtpParameters: mediasoup.types.RtpParameters,
  ): Promise<mediasoup.types.Producer> {
    const transport = this.getTransport(roomId, transportId);
    if (!transport) {
      throw new Error(
        `Transport not found for roomId: ${roomId}, transportId: ${transportId}`,
      );
    }

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { clientId: transport.appData.clientId },
    });
    this.addProducer(roomId, producer);

    return producer;
  }

  /**
   *
   */
  async createConsumer(
    roomId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: mediasoup.types.RtpCapabilities,
  ): Promise<mediasoup.types.Consumer> {
    const transport = this.getTransport(roomId, transportId);
    if (!transport) {
      throw new Error(
        `Transport not found for roomId: ${roomId}, transportId: ${transportId}`,
      );
    }

    const producer = this.getProducer(roomId, producerId);
    if (!producer) {
      throw new Error(
        `Producer not found for roomId: ${roomId}, producerId: ${producerId}`,
      );
    }

    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities,
    });

    // await consumer.resume(); // 클라이언트 측에서 준비가 완료되면 resume 호출
    return consumer;
  }
}
