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

  async getUserThreads(user: User) {
    const where =
      user.role === Role.ADMIN
        ? {}
        : {
            participants: {
              some: {
                userId: user.id,
                leftAt: null,
              },
            },
          };

    const threads = await this.prisma.chatThread.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        participants: {
          where: { leftAt: null },
          include: {
            user: {
              select: { id: true, name: true, role: true, email: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, name: true, role: true } },
            attachments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      threads.map(async (thread) => {
        const isJoined = thread.participants.some(
          (participant) => participant.userId === user.id,
        );
        const unreadCount =
          user.role === Role.ADMIN && !isJoined
            ? 0
            : await this.getUnreadCount(thread.id, user.id);
        const lastMessage = thread.messages[0];
        const lastMessageText =
          lastMessage?.content ??
          (lastMessage?.type === 'IMAGE'
            ? 'Sent an image'
            : lastMessage?.type === 'FILE'
              ? 'Sent a file'
              : null);

        return {
          id: thread.id,
          projectId: thread.projectId,
          projectName: thread.project?.name ?? 'Unknown Project',
          projectStatus: thread.project?.status ?? null,
          type: thread.type,
          participants: thread.participants.map((participant) => ({
            id: participant.user.id,
            name: participant.user.name,
            role: participant.user.role,
            email: participant.user.email,
          })),
          lastMessage: lastMessageText,
          lastMessageAt: lastMessage?.createdAt ?? null,
          unreadCount,
          adminJoined: user.role === Role.ADMIN ? isJoined : true,
        };
      }),
    );
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

    const threadWhere =
      user.role === Role.ADMIN
        ? { projectId }
        : {
            projectId,
            participants: {
              some: {
                userId: user.id,
                leftAt: null,
              },
            },
          };

    const threads = await this.prisma.chatThread.findMany({
      where: threadWhere,
      include: {
        participants: {
          where: { leftAt: null },
          include: { user: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return Promise.all(
      threads.map(async (thread) => {
        const isJoined = thread.participants.some(
          (participant) => participant.userId === user.id,
        );
        const unreadCount =
          user.role === Role.ADMIN && !isJoined
            ? 0
            : await this.getUnreadCount(thread.id, user.id);
        const lastMessage = thread.messages[0];
        const lastMessageText =
          lastMessage?.content ??
          (lastMessage?.type === 'IMAGE'
            ? 'Sent an image'
            : lastMessage?.type === 'FILE'
              ? 'Sent a file'
              : null);

        return {
          id: thread.id,
          projectId: thread.projectId,
          type: thread.type,
          participants: thread.participants.map((participant) => ({
            id: participant.user.id,
            name: participant.user.name,
            role: participant.user.role,
            email: participant.user.email,
          })),
          lastMessage: lastMessageText,
          lastMessageAt: lastMessage?.createdAt ?? null,
          unreadCount,
        };
      }),
    );
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

    const messages = await this.prisma.chatMessage.findMany({
      where: { threadId },
      include: {
        sender: true,
        attachments: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const unreadMessageIds = messages
      .filter((message) => message.senderId !== user.id)
      .map((message) => message.id);

    if (unreadMessageIds.length > 0) {
      await this.prisma.messageRead.createMany({
        data: unreadMessageIds.map((messageId) => ({
          messageId,
          userId: user.id,
        })),
        skipDuplicates: true,
      });
    }

    return messages;
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

  async markThreadRead(threadId: string, userId: string) {
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

    const messageIds = await this.prisma.chatMessage.findMany({
      where: {
        threadId,
        senderId: { not: userId },
      },
      select: { id: true },
    });

    if (messageIds.length === 0) return;

    await this.prisma.messageRead.createMany({
      data: messageIds.map((message) => ({
        messageId: message.id,
        userId,
      })),
      skipDuplicates: true,
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
