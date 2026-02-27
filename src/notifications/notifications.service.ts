import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUsers(
    userIds: string[],
    payload: { title: string; message: string; type: string },
  ) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) return;

    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        title: payload.title,
        message: payload.message,
        type: payload.type,
      })),
    });
  }

  async createForRoles(
    roles: Role[],
    payload: { title: string; message: string; type: string },
    excludeUserIds: string[] = [],
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: roles },
        id: { notIn: excludeUserIds },
      },
      select: { id: true },
    });

    await this.createForUsers(
      users.map((user) => user.id),
      payload,
    );
  }

  async projectRecipients(params: {
    projectId: string;
    includeAdmins?: boolean;
    includeClient?: boolean;
    includeStaff?: boolean;
    excludeUserIds?: string[];
  }) {
    const {
      projectId,
      includeAdmins = false,
      includeClient = false,
      includeStaff = false,
      excludeUserIds = [],
    } = params;

    const userIds = new Set<string>();

    if (includeAdmins) {
      const admins = await this.prisma.user.findMany({
        where: { role: Role.ADMIN },
        select: { id: true },
      });
      admins.forEach((admin) => userIds.add(admin.id));
    }

    if (includeClient) {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { clientId: true },
      });
      if (project?.clientId) userIds.add(project.clientId);
    }

    if (includeStaff) {
      const staff = await this.prisma.projectStaff.findMany({
        where: { projectId },
        select: { staffId: true },
      });
      staff.forEach((member) => userIds.add(member.staffId));
    }

    excludeUserIds.forEach((id) => userIds.delete(id));
    return [...userIds];
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    return { count };
  }

  async getForUser(userId: string, limit = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}

