/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtWsGuard } from '../auth/jwt-ws.guard';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
@UseGuards(JwtWsGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    const userId = client.data.userId;
    if (!userId) {
      client.disconnect();
      return;
    }

    // Join all project rooms (staff)
    const projects = await this.prisma.projectStaff.findMany({
      where: { staffId: userId },
    });

    projects.forEach((p) => {
      void client.join(`project:${p.projectId}`);
    });

    // Join all thread rooms where the user is a participant
    const threadMemberships = await this.prisma.chatParticipant.findMany({
      where: { userId, leftAt: null },
      select: { threadId: true },
    });

    threadMemberships.forEach((membership) => {
      void client.join(`thread:${membership.threadId}`);
    });
  }

  async handleDisconnect(client: Socket) {}

  // 🔹 Join a chat thread room
  @SubscribeMessage('join-thread')
  async joinThread(
    @MessageBody() threadId: string,
    @ConnectedSocket() client: Socket,
  ) {
    await this.chatService.ensureUserInThread(threadId, client.data.userId);

    client.join(`thread:${threadId}`);
  }

  // 🔹 Send message (REAL-TIME)
  @SubscribeMessage('send-message')
  async sendMessage(
    @MessageBody()
    payload: {
      threadId: string;
      content?: string;
      file?: {
        name: string;
        mimeType: string;
        base64: string;
      };
    },
    @ConnectedSocket() client: Socket,
  ) {
    const isImage = payload.file?.mimeType.startsWith('image/');

    const message = await this.chatService.createMessage(
      {
        threadId: payload.threadId,
        type: payload.file ? (isImage ? 'IMAGE' : 'FILE') : 'TEXT',
        content: payload.content,
        file: payload.file
          ? {
              name: payload.file.name,
              mimeType: payload.file.mimeType,
              buffer: Buffer.from(payload.file.base64, 'base64'),
            }
          : undefined,
      },
      client.data.userId,
    );

    if (!message) {
      return;
    }

    const thread = await this.prisma.chatThread.findUnique({
      where: { id: message.threadId },
      select: { projectId: true },
    });

    this.server.to(`thread:${payload.threadId}`).emit('new-message', message);
    this.server.to(`thread:${message.threadId}`).emit('unread-update', {
      threadId: message.threadId,
    });
    this.server.to(`thread:${message.threadId}`).emit('thread-updated', {
      threadId: message.threadId,
      projectId: thread?.projectId,
    });

    return message;
  }

  // 🔹 Mark message as read
  @SubscribeMessage('read-message')
  async readMessage(
    @MessageBody() messageId: string,
    @ConnectedSocket() client: Socket,
  ) {
    await this.chatService.markRead(messageId, client.data.userId);

    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return;
    }

    this.server.to(`thread:${message.threadId}`).emit('message-read', {
      messageId,
      userId: client.data.userId,
    });
  }

  emitUserRemovedFromProject(projectId: string, userId: string) {
    this.server.to(`project:${projectId}`).emit('user-removed-from-project', {
      projectId,
      userId,
    });
  }
}
