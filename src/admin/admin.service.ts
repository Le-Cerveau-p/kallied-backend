/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProcurementStatus, ProjectStatus, Role, User } from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';
import { ChatService } from 'src/chat/chat.service';
import { ProjectsService } from 'src/projects/projects.service';
import { ProcurementService } from 'src/procurements/procurement.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly projectsService: ProjectsService,
    private readonly procurementService: ProcurementService,
  ) {}

  async getDashboardSummary() {
    const [
      totalProjects,
      pendingProjects,
      inProgressProjects,
      completedProjects,
      activeClients,
      pendingProcurements,
      procurementValue,
      newClientsThisMonth,
      projectsByStatus,
      recentActivity,
    ] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.project.count({ where: { status: ProjectStatus.PENDING } }),
      this.prisma.project.count({
        where: { status: ProjectStatus.IN_PROGRESS },
      }),
      this.prisma.project.count({ where: { status: ProjectStatus.COMPLETED } }),
      this.prisma.user.count({ where: { role: Role.CLIENT } }),
      this.prisma.procurementRequest.count({
        where: { status: ProcurementStatus.SUBMITTED },
      }),
      this.prisma.procurementItem
        .findMany({
          where: {
            pRequest: {
              status: ProcurementStatus.SUBMITTED,
            },
          },
          select: {
            quantity: true,
            estimatedCost: true,
          },
        })
        .then((items) =>
          items.reduce(
            (sum, i) => sum + (i.estimatedCost ?? 0) * i.quantity,
            0,
          ),
        ),
      this.prisma.user.count({
        where: {
          role: 'CLIENT',
          createdAt: {
            gte: startOfMonth(new Date()),
            lte: endOfMonth(new Date()),
          },
        },
      }),
      this.prisma.project.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { actor: true },
      }),
    ]);
    const procurementByRequest = await this.prisma.procurementItem.groupBy({
      by: ['requestId'],
      _sum: {
        estimatedCost: true,
      },
    });

    const procurementByProjectMap = new Map<string, number>();

    for (const row of procurementByRequest) {
      const request = await this.prisma.procurementRequest.findUnique({
        where: { id: row.requestId },
        select: {
          project: {
            select: { name: true },
          },
        },
      });

      if (!request?.project) continue;

      const projectName = request.project.name;
      const amount = row._sum.estimatedCost ?? 0;

      procurementByProjectMap.set(
        projectName,
        (procurementByProjectMap.get(projectName) ?? 0) + amount,
      );
    }

    const procurementByProject = Array.from(
      procurementByProjectMap.entries(),
    ).map(([project, amount]) => ({
      project,
      amount,
    }));

    return {
      stats: {
        totalProjects,
        pendingProjects,
        inProgressProjects,
        completedProjects,
        activeClients,
        pendingProcurements,
        procurementValue,
        newClientsThisMonth,
        projectsByStatus,
        procurementByProject,
      },
      recentActivity,
    };
  }

  async getPendingProjects() {
    return this.prisma.project.findMany({
      where: { status: ProjectStatus.PENDING },
      include: {
        client: true,
        staff: { include: { staff: true } },
      },
    });
  }

  async getPendingProcurements() {
    return this.prisma.procurementRequest.findMany({
      where: { status: ProcurementStatus.SUBMITTED },
      include: {
        project: true,
        createdBy: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getChartData() {
    const projectsByStatus = await this.prisma.project.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const procurementsByStatus = await this.prisma.procurementRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const projectsOverTime = await this.prisma.$queryRaw<
      { month: string; count: number }[]
    >`
    SELECT 
      to_char("createdAt", 'YYYY-MM') AS month,
      COUNT(*)::int AS count
    FROM "Project"
    GROUP BY month
    ORDER BY month ASC
  `;

    return {
      projectsByStatus,
      procurementsByStatus,
      projectsOverTime,
    };
  }

  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async getCompanyUsers() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: [Role.ADMIN, Role.STAFF],
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async getUserProjects(userId: string) {
    return this.prisma.projectStaff.findMany({
      where: { staffId: userId },
      include: {
        project: true,
      },
    });
  }

  async assignStaff(projectId: string, staffId: string) {
    await this.prisma.projectStaff.create({
      data: { projectId, staffId },
    });

    await this.chatService.addStaffToProjectThreads(projectId, staffId);

    return { message: 'Staff assigned successfully' };
  }

  async removeStaff(projectId: string, staffId: string, admin: User) {
    return this.projectsService.removeStaffFromProject(
      projectId,
      staffId,
      admin,
    );
  }

  async getProjectsManagementData() {
    return this.prisma.project.findMany({
      include: {
        client: true,
        staff: {
          include: {
            staff: true,
          },
        },
        updates: true,
        procurements: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getAllForAdmin() {
    return this.prisma.procurementRequest.findMany({
      include: {
        project: true,
        createdBy: true,
        approvedBy: true,
        items: true,
        purchaseOrder: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdForAdmin(id: string) {
    const req = await this.prisma.procurementRequest.findUnique({
      where: { id },
      include: {
        project: true,
        createdBy: true,
        approvedBy: true,
        items: true,
        purchaseOrder: true,
        documents: {
          include: {
            documents: { orderBy: { version: 'desc' } },
          },
        },
      },
    });

    if (!req) throw new NotFoundException('Procurement not found');
    return req;
  }

  async approve(id: string, admin: User) {
    return this.procurementService.approve(id, admin);
  }

  async reject(id: string, reason: string, admin: User) {
    return this.procurementService.reject(id, reason, admin);
  }

  async generatePurchaseOrder(id: string, admin: User) {
    return this.procurementService.generatePurchaseOrder(id, admin);
  }

  async markAsOrdered(id: string, admin: User) {
    return this.procurementService.markAsOrdered(id, admin);
  }

  async markAsDelivered(id: string, admin: User) {
    return this.procurementService.markAsDelivered(id, admin);
  }

  async getActivityLogs(query?: {
    page?: number;
    limit?: number;
    entity?: string;
    actorId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = query?.page ?? 1;
    const limit = parseInt(`${query?.limit ?? 20}`);

    const where: any = {};

    if (query?.entity && query.entity !== 'all') {
      where.entity = query.entity;
    }

    if (query?.actorId && query.actorId !== 'all') {
      where.actorId = query.actorId;
    }

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};

      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }

      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
