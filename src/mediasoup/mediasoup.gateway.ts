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

@WebSocketGateway(3001, { cors: { origin: '*', credentials: true } })
export class MediasoupGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(private readonly mediasoupService: MediasoupService) {}

  async afterInit(): Promise<void> {
    await this.mediasoupService.initializeWorker();
  }

  /**
   * Socket.IO connected
   */
  handleConnection(client: Socket): void {
    console.log('Client connected:', client.id);
  }

  /**
   * Socket.IO disconnected
   */
  handleDisconnect(client: Socket): void {
    console.log('Client disconnected:', client.id);

    // 클라이언트가 참여한 roomId를 가져와 자원 정리
    const roomId = Array.from(client.rooms).find((room) => room !== client.id); // client.id는 자신의 기본 room이므로 제외
    if (roomId) {
      this.mediasoupService.cleanupClientResources(roomId, client.id);
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
    console.log(`Client ${client.id} joined room ${roomId}`);

    await this.mediasoupService.createRoom(roomId);
    client.join(roomId);
    client.emit('joinedRoom', { roomId });
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
      console.error('Error creating transport:', error);
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
      console.error('Error connecting transport:', error);
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

      client.emit('produceSuccess', { producerId: producer.id });
      client.to(roomId).emit('newProducer', { producerId: producer.id });
    } catch (error) {
      console.error('Error creating producer:', error);
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
      console.error('Error creating consumer:', error);
      client.emit('consumeError', { error: error.message });
    }
  }
}
