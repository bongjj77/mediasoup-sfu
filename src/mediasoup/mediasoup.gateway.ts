import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MediasoupService } from './mediasoup.service';
import * as mediasoup from 'mediasoup';
import { CustomLogger } from 'src/logging/custom-logger.service';

@WebSocketGateway(3001, { cors: { origin: '*' } })
export class MediasoupGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(
    private readonly mediasoupService: MediasoupService,
    private readonly logger: CustomLogger,
  ) {}

  async afterInit(): Promise<void> {
    await this.mediasoupService.initializeWorker();
  }

  /**
   * Socket.IO connected
   */
  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected - client(${client.id})`);
  }

  /**
   * Socket.IO disconnected
   */
  handleDisconnect(client: Socket): void {
    // 클라이언트가 속한 모든 방을 출력
    this.logger.debug(
      `Disconnecting client(${client.id}) rooms: ${Array.from(client.rooms)}`,
    );

    // 클라이언트 ID를 제외한 실제 방 ID 가져오기
    const roomId = Array.from(client.rooms).find((room) => room !== client.id);

    this.logger.debug(
      `Client disconnected - client(${client.id}) room(${roomId})`,
    );

    if (roomId) {
      this.mediasoupService.cleanupClientResources(roomId, client.id);
    } else {
      this.logger.warn(
        `Client(${client.id}) disconnected but no associated room found.`,
      );
    }
  }

  /**
   * Join Room
   */
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    client: Socket,
    { roomId }: { roomId: string },
  ): Promise<void> {
    this.logger.debug(`Client ${client.id} joined - room(${roomId})`);

    // 방 생성 (이미 존재하면 기존 방 반환)
    await this.mediasoupService.createRoom(roomId);

    // 클라이언트를 방에 추가
    client.join(roomId);

    // 방 목록 출력 (디버깅 용도)
    this.logger.debug(
      `Client(${client.id}) current rooms: ${Array.from(client.rooms)}`,
    );

    // 기존 Producer 목록 가져오기
    const producers = this.mediasoupService.getProducers(roomId);

    client.emit('joinedRoom', {
      roomId,
      producers: producers.map((producer) => ({
        producerId: producer.id,
        kind: producer.kind, // 'audio' or 'video'
        clientId: producer.appData.clientId, // 해당 Producer를 생성한 클라이언트 ID
      })),
    });
  }

  /**
   *
   */
  @SubscribeMessage('getRtpCapabilities')
  handleGetRtpCapabilities(client: Socket): void {
    try {
      client.emit(
        'getRtpCapabilitiesSuccess',
        this.mediasoupService.router.rtpCapabilities,
      );
    } catch (error) {
      client.emit('getRtpCapabilitiesError', {
        message: 'Failed to get RTP capabilities',
      });
    }
  }

  /**
   *
   */
  @SubscribeMessage('createTransport')
  async handleCreateTransport(
    client: Socket,
    { roomId, direction }: { roomId: string; direction: 'send' | 'recv' },
  ): Promise<void> {
    try {
      const transport = await this.mediasoupService.createTransport(
        roomId,
        client.id,
      );
      client.emit('createTransportSuccess', {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      this.logger.error('Error creating transport:', error);
      client.emit('createTransportError', { message: error.message });
    }
  }

  /**
   *
   */
  @SubscribeMessage('connectTransport')
  async handleConnectTransport(
    client: Socket,
    {
      roomId,
      transportId,
      dtlsParameters,
    }: {
      roomId: string;
      transportId: string;
      dtlsParameters: mediasoup.types.DtlsParameters;
    },
  ): Promise<void> {
    try {
      await this.mediasoupService.connectTransport(
        roomId,
        transportId,
        dtlsParameters,
      );
      client.emit('connectTransportSuccess', { transportId });
    } catch (error) {
      this.logger.error('Error connecting transport:', error.stack);
      client.emit('connectTransportError', { message: error.message });
    }
  }

  /**
   *
   */
  @SubscribeMessage('produce')
  async handleProduce(
    client: Socket,
    {
      roomId,
      transportId,
      kind,
      rtpParameters,
    }: {
      roomId: string;
      transportId: string;
      kind: mediasoup.types.MediaKind;
      rtpParameters: mediasoup.types.RtpParameters;
    },
  ): Promise<void> {
    try {
      const producer = await this.mediasoupService.createProducer(
        roomId,
        transportId,
        kind,
        rtpParameters,
      );

      // Producer 생성 성공 알림
      client.emit('produceSuccess', { producerId: producer.id });

      // 방의 다른 클라이언트에게 새로운 Producer 정보 브로드캐스트
      client.to(roomId).emit('newProducer', { producerId: producer.id });
    } catch (error) {
      this.logger.error('Error creating producer:', error.stack);
      client.emit('produceError', { error: error.message });
    }
  }

  /**
   *
   */
  @SubscribeMessage('consume')
  async handleConsume(
    client: Socket,
    {
      roomId,
      transportId,
      producerId,
      rtpCapabilities,
    }: {
      roomId: string;
      transportId: string;
      producerId: string;
      rtpCapabilities: mediasoup.types.RtpCapabilities;
    },
  ): Promise<void> {
    try {
      const consumer = await this.mediasoupService.createConsumer(
        roomId,
        transportId,
        producerId,
        rtpCapabilities,
      );

      client.emit('consumeSuccess', {
        consumerId: consumer.id,
        producerId: producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (error) {
      this.logger.error('Error creating consumer:', error.stack);
      client.emit('consumeError', { error: error.message });
    }
  }
}
