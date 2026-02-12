/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProcurementStatus,
  ProjectStatus,
  Role,
  User,
  InvoiceStatus,
  AuditAction,
  AuditEntity,
  TimesheetStatus,
} from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';
import { ChatService } from 'src/chat/chat.service';
import { ProjectsService } from 'src/projects/projects.service';
import { ProcurementService } from 'src/procurements/procurement.service';
import { AuditService } from 'src/audit/audit.service';
import * as fs from 'fs';
import {
  buildInvoicePdf,
  buildReceiptPdf,
  resolveUploadsPath,
} from 'src/invoices/invoice-pdf';

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly projectsService: ProjectsService,
    private readonly procurementService: ProcurementService,
    private readonly auditService: AuditService,
  ) {}

  async getDashboard(userId: string) {
    /**
     * 1️⃣ Assigned Projects
     */
    const assignedProjects = await this.prisma.projectStaff.findMany({
      where: { staffId: userId },
      include: {
        project: {
          include: {
            updates: {
              orderBy: { createdAt: 'desc' },
              take: 1, // latest progress only
            },
          },
        },
      },
    });

    /**
     * 2️⃣ Stats
     */
    const assignedCount = assignedProjects.length;

    const activeCount = assignedProjects.filter(
      (p) => p.project.status === 'IN_PROGRESS',
    ).length;

    const completedCount = assignedProjects.filter(
      (p) => p.project.status === 'COMPLETED',
    ).length;

    /**
     * 3️⃣ Notifications
     */
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const unreadNotifications = notifications.filter((n) => !n.read).length;

    /**
     * 4️⃣ Project Progress
     */
    const projectProgress = assignedProjects.map((p) => ({
      id: p.project.id,
      name: p.project.name,
      progress: p.project.updates[0]?.progress ?? 0,
      status: p.project.status,
    }));

    /**
     * 5️⃣ Activity Feed (Nice Upgrade)
     */
    const activity = await this.prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      stats: {
        assignedProjects: assignedCount,
        activeProjects: activeCount,
        completedProjects: completedCount,
        unreadNotifications,
      },

      projectProgress,

      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        createdAt: n.createdAt,
      })),

      activity,
    };
  }

  async getMyProjects(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        staff: {
          some: {
            staffId: userId,
          },
        },
      },
      include: {
        client: true,
        staff: {
          include: {
            staff: true,
          },
        },
        updates: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1, // latest update for progress
        },
      },
    });

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      clientName: project.client.name,
      status: project.status,
      progress: project.updates[0]?.progress ?? 0,
      assignedStaff: project.staff.map((ps) => ({
        id: ps.staff.id,
        name: ps.staff.name,
        role: ps.staff.role,
      })),
      createdDate: project.createdAt,
      deadline: project.eCD,
    }));
  }

  async getProjectById(id: string) {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id },
      include: {
        client: true,
        staff: {
          include: {
            staff: true,
          },
        },

        updates: {
          include: {
            staff: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },

        documentGroup: {
          include: {
            documents: {
              include: {
                uploadedBy: true,
              },
              orderBy: {
                version: 'desc',
              },
            },
          },
        },

        procurements: {
          include: {
            items: true,
          },
        },
      },
    });

    const documents = project.documentGroup
      .map((group) => {
        const latestDoc = group.documents[0];
        if (!latestDoc) return null;

        return {
          id: latestDoc.id,
          name: latestDoc.name,
          category: group.category,
          version: latestDoc.version,
          uploadedBy: latestDoc.uploadedBy.name,
          uploadedDate: latestDoc.createdAt,
          fileUrl: latestDoc.fileUrl,
        };
      })
      .filter(Boolean);

    return {
      id: project.id,
      name: project.name,
      description: project.description,

      clientName: project.client.name,
      clientInfo: {
        name: project.client.name,
        email: project.client.email,
      },

      status: project.status,
      progress: project.updates[0]?.progress ?? 0,

      assignedStaff: project.staff,
      createdDate: project.createdAt,
      deadline: project.eCD,

      updates: project.updates,
      latestUpdate: project.updates[0]?.note ?? null,

      documents, // 🔥 THIS IS NEW
      procurementRequests: project.procurements,
    };
  }

  async getInvoices(staffId: string) {
    const assignedProjects = await this.prisma.projectStaff.findMany({
      where: { staffId },
      select: { projectId: true },
    });
    const projectIds = assignedProjects.map((p) => p.projectId);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        projectId: { in: projectIds },
      },
      include: {
        project: { select: { name: true } },
        client: { select: { name: true, email: true } },
        lineItems: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      projectName: invoice.project.name,
      projectId: invoice.projectId,
      clientName: invoice.client.name,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      notes: invoice.notes,
      rejectionReason: invoice.rejectionReason,
      clientMarkedPaid: invoice.clientMarkedPaid,
      clientMarkedPaidAt: invoice.clientMarkedPaidAt,
      paidAt: invoice.paidAt,
      paymentConfirmedAt: invoice.paymentConfirmedAt,
      lineItems: invoice.lineItems,
      invoiceUrl: `/staff/invoices/${invoice.id}/pdf`,
      receiptUrl: invoice.receiptUrl
        ? `/staff/invoices/${invoice.id}/receipt`
        : null,
    }));
  }

  async createInvoice(
    staffId: string,
    data: {
      projectId: string;
      dueDate: string;
      lineItems: Array<{ description: string; quantity: number; rate: number }>;
      tax?: number;
      notes?: string;
    },
    actor: User,
  ) {
    const assignment = await this.prisma.projectStaff.findFirst({
      where: { staffId, projectId: data.projectId },
      include: { project: true },
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    const subtotal = data.lineItems.reduce(
      (sum, item) => sum + item.quantity * item.rate,
      0,
    );
    const tax = data.tax ?? 0;
    const total = subtotal + tax;

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(
      100000 + Math.random() * 900000,
    )}`;

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        status: InvoiceStatus.PENDING,
        projectId: data.projectId,
        clientId: assignment.project.clientId,
        createdById: staffId,
        dueDate: new Date(data.dueDate),
        subtotal,
        tax,
        total,
        notes: data.notes,
        lineItems: {
          create: data.lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.quantity * item.rate,
          })),
        },
      },
      include: { lineItems: true, project: true, client: true },
    });

    await this.auditService.log(
      actor,
      AuditAction.CREATE,
      AuditEntity.INVOICE,
      invoice.id,
      'Staff created invoice',
    );

    return invoice;
  }

  async getInvoiceFile(staffId: string, invoiceId: string, actor: User) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        project: {
          staff: { some: { staffId } },
        },
      },
      include: { project: true, client: true, lineItems: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      invoice.status !== InvoiceStatus.APPROVED &&
      invoice.status !== InvoiceStatus.PAID
    ) {
      throw new BadRequestException('Invoice not approved yet');
    }

    if (invoice.fileUrl) {
      const path = resolveUploadsPath(invoice.fileUrl);
      if (fs.existsSync(path)) {
        return {
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
          content: await fs.promises.readFile(path),
        };
      }
    }

    await this.auditService.log(
      actor,
      AuditAction.DOWNLOAD,
      AuditEntity.INVOICE,
      invoice.id,
      'Staff downloaded invoice',
    );

    return {
      filename: `invoice-${invoice.invoiceNumber}.pdf`,
      content: await buildInvoicePdf(invoice),
    };
  }

  async getReceiptFile(staffId: string, invoiceId: string, actor: User) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        project: {
          staff: { some: { staffId } },
        },
      },
      include: { project: true, client: true, lineItems: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.receiptUrl) {
      const path = resolveUploadsPath(invoice.receiptUrl);
      if (fs.existsSync(path)) {
        return {
          filename: `receipt-${invoice.invoiceNumber}.pdf`,
          content: await fs.promises.readFile(path),
        };
      }
    }

    await this.auditService.log(
      actor,
      AuditAction.DOWNLOAD,
      AuditEntity.RECEIPT,
      invoice.id,
      'Staff downloaded receipt',
    );

    return {
      filename: `receipt-${invoice.invoiceNumber}.pdf`,
      content: await buildReceiptPdf(invoice),
    };
  }

  async getTimesheets(staffId: string) {
    const entries = await this.prisma.timesheetEntry.findMany({
      where: { staffId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { entryDate: 'desc' },
    });

    return entries.map((entry) => ({
      id: entry.id,
      projectId: entry.projectId,
      projectName: entry.project.name,
      clientId: entry.project.client.id,
      clientName: entry.project.client.name,
      date: entry.entryDate,
      hours: entry.hours,
      notes: entry.notes,
      status: entry.status,
      submittedAt: entry.submittedAt,
      reviewedAt: entry.reviewedAt,
      rejectionReason: entry.rejectionReason,
    }));
  }

  async createTimesheet(
    staffId: string,
    data: {
      projectId: string;
      date: string;
      hours: number;
      notes?: string;
    },
  ) {
    if (!data.projectId || !data.date || !data.hours) {
      throw new BadRequestException('Project, date, and hours are required');
    }

    if (data.hours <= 0) {
      throw new BadRequestException('Hours must be greater than zero');
    }

    const entryDate = new Date(data.date);
    if (Number.isNaN(entryDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    const assignment = await this.prisma.projectStaff.findFirst({
      where: { staffId, projectId: data.projectId },
      include: { project: { include: { client: true } } },
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    const entry = await this.prisma.timesheetEntry.create({
      data: {
        projectId: data.projectId,
        staffId,
        entryDate,
        hours: data.hours,
        notes: data.notes,
        status: TimesheetStatus.PENDING,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      id: entry.id,
      projectId: entry.projectId,
      projectName: entry.project.name,
      clientId: entry.project.client.id,
      clientName: entry.project.client.name,
      date: entry.entryDate,
      hours: entry.hours,
      notes: entry.notes,
      status: entry.status,
      submittedAt: entry.submittedAt,
      reviewedAt: entry.reviewedAt,
      rejectionReason: entry.rejectionReason,
    };
  }

  async deleteTimesheet(staffId: string, timesheetId: string) {
    const entry = await this.prisma.timesheetEntry.findFirst({
      where: { id: timesheetId, staffId },
    });

    if (!entry) {
      throw new NotFoundException('Timesheet entry not found');
    }

    if (entry.status !== TimesheetStatus.PENDING) {
      throw new ForbiddenException('Only pending entries can be deleted');
    }

    await this.prisma.timesheetEntry.delete({ where: { id: timesheetId } });
    return { message: 'Timesheet entry deleted' };
  }

  // PDF generation handled in src/invoices/invoice-pdf.ts
}
