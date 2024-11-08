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

@WebSocketGateway(3001, { cors: { origin: '*', credentials: true } })
export class MediasoupGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(private readonly mediasoupService: MediasoupService) {}

  async afterInit(): Promise<void> {
    await this.mediasoupService.initializeWorker();
  }

  handleConnection(client: Socket): void {
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket): void {
    console.log('Client disconnected:', client.id);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    client: Socket,
    payload: { roomId: string },
  ): Promise<void> {
    const { roomId } = payload;
    console.log(`Client ${client.id} joined room ${roomId}`);

    await this.mediasoupService.createRoom(roomId);
    client.join(roomId);
    client.emit('joinedRoom', { roomId });
  }

  @SubscribeMessage('getRtpCapabilities')
  handleGetRtpCapabilities(client: Socket): void {
    client.emit(
      'rtpCapabilities',
      this.mediasoupService.router.rtpCapabilities,
    );
  }

  @SubscribeMessage('createTransport')
  async handleCreateTransport(
    client: Socket,
    { direction }: { direction: 'send' | 'recv' },
  ): Promise<void> {
    const transport = await this.mediasoupService.createTransport();
    client.emit('transportCreated', {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  }

  @SubscribeMessage('connectTransport')
  async handleConnectTransport(
    client: Socket,
    { transportId, dtlsParameters },
  ): Promise<void> {
    const transport = this.mediasoupService.getTransport(transportId);
    if (!transport) {
      console.error('Transport not found');

      // 클라이언트에 transport not found 오류 응답 전송
      client.emit('transportConnectionError', { error: 'Transport not found' });
    }

    try {
      await transport.connect({ dtlsParameters });
      client.emit('transportConnected', { transportId });
    } catch (error) {
      console.error('Error connecting transport:', error);
      client.emit('transportConnectionError', { error: error.message });
    }
  }

  @SubscribeMessage('produce')
  async handleProduce(
    client: Socket,
    { roomId, transportId, kind, rtpParameters },
  ): Promise<void> {
    const transport = this.mediasoupService.getTransport(transportId);
    if (!transport) {
      console.error('Transport not found');
      client.emit('producerCreationError', { error: 'Transport not found' });
      return;
    }

    try {
      const producer = await transport.produce({ kind, rtpParameters });
      client.emit('producerCreated', { producerId: producer.id });

      // 첫 번째는 소켓 ID, 두 번째는 방 ID
      // const roomId = Array.from(client.rooms)[1];

      // MediasoupService를 통해 producer를 room에 추가
      this.mediasoupService.addProducer(roomId, producer);

      // 방에 있는 다른 클라이언트들에게 `newProducer` 이벤트 전파

      client.to(roomId).emit('newProducer', { producerId: producer.id });
    } catch (error) {
      console.error('Error creating producer:', error);
      client.emit('producerCreationError', { error: error.message });
    }
  }

  @SubscribeMessage('consume')
  async handleConsume(
    client: Socket,
    { roomId, transportId, producerId, rtpCapabilities },
  ): Promise<void> {
    const transport = this.mediasoupService.getTransport(transportId);
    if (!transport) {
      console.log('Transport  not found for consuming');
      return;
    }

    const producer = this.mediasoupService.getProducer(roomId, producerId);
    if (!producer) {
      console.log('Producer not found for consuming');
      return;
    }

    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities,
    });

    await consumer.resume();

    client.emit('consumerCreated', {
      consumerId: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  }
}
