import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatThreadType, Role, User } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createProjectThreads(projectId: string) {
    // MAIN THREAD
    await this.prisma.chatThread.upsert({
      where: {
        projectId_type: {
          projectId,
          type: ChatThreadType.MAIN,
        },
      },
      update: {},
      create: {
        projectId,
        type: ChatThreadType.MAIN,
      },
    });

    // STAFF THREAD
    await this.prisma.chatThread.upsert({
      where: {
        projectId_type: {
          projectId,
          type: ChatThreadType.STAFF_ONLY,
        },
      },
      update: {},
      create: {
        projectId,
        type: ChatThreadType.STAFF_ONLY,
      },
    });
  }

  async addClientToMainThread(projectId: string, clientId: string) {
    const thread = await this.prisma.chatThread.findFirst({
      where: { projectId, type: ChatThreadType.MAIN },
    });

    if (!thread) return;

    await this.prisma.chatParticipant.upsert({
      where: {
        threadId_userId: {
          threadId: thread.id,
          userId: clientId,
        },
      },
      update: { leftAt: null },
      create: {
        threadId: thread.id,
        userId: clientId,
      },
    });
  }

  async addStaffToProjectThreads(projectId: string, staffId: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: { projectId },
    });

    for (const thread of threads) {
      if (
        thread.type === ChatThreadType.STAFF_ONLY ||
        thread.type === ChatThreadType.MAIN
      ) {
        await this.prisma.chatParticipant.upsert({
          where: {
            threadId_userId: {
              threadId: thread.id,
              userId: staffId,
            },
          },
          update: { leftAt: null },
          create: {
            threadId: thread.id,
            userId: staffId,
          },
        });
      }
    }
  }

  async removeUserFromProjectChats(projectId: string, userId: string) {
    await this.prisma.chatParticipant.updateMany({
      where: {
        userId,
        thread: { projectId },
      },
      data: {
        leftAt: new Date(),
      },
    });
  }

  // 🔹 Get threads for a project
  async getThreads(projectId: string, user: User) {
    // Must be client of project OR assigned staff OR admin
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { staff: true },
    });

    if (!project) throw new NotFoundException('Project not found');

    const isStaffAssigned = project.staff.some((s) => s.staffId === user.id);

    if (user.role === Role.CLIENT && project.clientId !== user.id) {
      throw new ForbiddenException();
    }

    if (user.role === Role.STAFF && !isStaffAssigned) {
      throw new ForbiddenException();
    }

    return this.prisma.chatThread.findMany({
      where: {
        projectId,
        participants: {
          some: {
            userId: user.id,
            leftAt: null,
          },
        },
      },
      include: {
        participants: {
          include: { user: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  // 🔹 Get messages in a thread
  async getMessages(threadId: string, user: User) {
    const participant = await this.prisma.chatParticipant.findFirst({
      where: {
        threadId,
        userId: user.id,
        leftAt: null,
      },
    });

    if (!participant && user.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }

    return this.prisma.chatMessage.findMany({
      where: { threadId },
      include: {
        sender: true,
        attachments: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // 🔹 Send message
  async createMessage(
    payload: {
      threadId: string;
      type: 'TEXT' | 'FILE' | 'IMAGE';
      content?: string;
      file?: {
        name: string;
        mimeType: string;
        buffer: Buffer;
      };
    },
    userId: string,
  ) {
    await this.ensureUserInThread(payload.threadId, userId);

    if (!payload.content && !payload.file) {
      throw new ForbiddenException('Message is empty');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        threadId: payload.threadId,
        senderId: userId,
        content: payload.content,
        type: payload.type,
      },
    });

    if (payload.file) {
      const uploadDir = path.join(
        process.cwd(),
        'uploads',
        'chats',
        payload.threadId,
      );

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filename = `${Date.now()}-${payload.file.name}`;
      const filePath = path.join(uploadDir, filename);

      fs.writeFileSync(filePath, payload.file.buffer);

      const fileUrl = `/uploads/chats/${payload.threadId}/${filename}`;

      await this.prisma.chatAttachment.create({
        data: {
          messageId: message.id,
          fileUrl,
          mimeType: payload.file.mimeType,
          isImage: payload.type === 'IMAGE',
        },
      });
    }

    return this.prisma.chatMessage.findUnique({
      where: { id: message.id },
      include: {
        sender: true,
        attachments: true,
      },
    });
  }

  async markRead(messageId: string, userId: string) {
    await this.prisma.messageRead.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      update: {},
      create: {
        messageId,
        userId,
      },
    });
  }

  async getUnreadCount(threadId: string, userId: string) {
    return this.prisma.chatMessage.count({
      where: {
        threadId,
        reads: {
          none: {
            userId,
          },
        },
        senderId: { not: userId },
      },
    });
  }

  //🔹 Admin join/leave
  async adminJoin(threadId: string, admin: User) {
    if (admin.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }

    return this.prisma.chatParticipant.upsert({
      where: {
        threadId_userId: {
          threadId,
          userId: admin.id,
        },
      },
      update: { leftAt: null },
      create: {
        threadId,
        userId: admin.id,
      },
    });
  }

  async adminLeave(threadId: string, admin: User) {
    if (admin.role !== Role.ADMIN) {
      throw new ForbiddenException();
    }

    return this.prisma.chatParticipant.update({
      where: {
        threadId_userId: {
          threadId,
          userId: admin.id,
        },
      },
      data: {
        leftAt: new Date(),
      },
    });
  }

  async ensureUserInThread(threadId: string, userId: string) {
    const participant = await this.prisma.chatParticipant.findFirst({
      where: {
        threadId,
        userId,
        leftAt: null,
      },
    });

    if (!participant) {
      throw new ForbiddenException('Not part of this chat');
    }
  }
}
