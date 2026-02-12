/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectStatus,
  AuditEntity,
  DocumentCategory,
  InvoiceStatus,
  AuditAction,
  User,
  TimesheetStatus,
} from '@prisma/client';
import { AuditService } from 'src/audit/audit.service';
import * as fs from 'fs';
import {
  buildInvoicePdf,
  buildReceiptPdf,
  resolveUploadsPath,
} from 'src/invoices/invoice-pdf';
import { CompanyService } from 'src/company/company.service';

@Injectable()
export class ClientService {
  constructor(
    private prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly companyService: CompanyService,
  ) {}

  async getDashboard(clientId: string) {
    /**
     * 1️⃣ Get Client Projects
     */
    const projects = await this.prisma.project.findMany({
      where: {
        clientId,
      },
      include: {
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    /**
     * 2️⃣ Summary Stats
     */
    const totalActiveProjects = projects.filter(
      (p) => p.status !== ProjectStatus.COMPLETED,
    ).length;

    const projectsInProgress = projects.filter(
      (p) => p.status === ProjectStatus.IN_PROGRESS,
    ).length;

    const completedProjects = projects.filter(
      (p) => p.status === ProjectStatus.COMPLETED,
    ).length;

    /**
     * Pending actions = awaiting approval OR notifications unread
     */
    const pendingApprovals = projects.filter(
      (p) => p.status === ProjectStatus.AWAITING_APPROVAL,
    ).length;

    const unreadNotifications = await this.prisma.notification.count({
      where: {
        userId: clientId,
        read: false,
      },
    });

    const pendingActions = pendingApprovals + unreadNotifications;

    /**
     * 3️⃣ Project Health Cards
     */
    const activeProjects = projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: this.mapProjectStatus(p.status),
      progress: p.updates[0]?.progress ?? 0,
      milestone: p.updates[0]?.note ?? 'No updates yet',
      lastUpdate: p.updates[0]?.createdAt ?? p.createdAt,
      statusColor: this.getStatusColor(p.status),
    }));

    /**
     * 4️⃣ Activity Feed
     */

    // Notifications
    const notifications = await this.prisma.notification.findMany({
      where: { userId: clientId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Project Updates
    const updates = await this.prisma.projectUpdate.findMany({
      where: {
        project: {
          clientId,
        },
      },
      include: {
        project: true,
        staff: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Document uploads via audit log
    const documentActivities = await this.prisma.auditLog.findMany({
      where: {
        entity: AuditEntity.DOCUMENT,
      },
      include: {
        actor: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    /**
     * Normalize Activity Feed
     */
    const activityFeed = [
      ...notifications.map((n) => ({
        id: n.id,
        type: 'notification',
        title: n.title,
        description: n.message,
        timestamp: n.createdAt,
        unread: !n.read,
      })),

      ...updates.map((u) => ({
        id: u.id,
        type: 'update',
        title: 'Project Update',
        description: `${u.project.name} - ${u.note}`,
        timestamp: u.createdAt,
        unread: false,
      })),

      ...documentActivities.map((a) => ({
        id: a.id,
        type: 'document',
        title: 'Document Activity',
        description: a.message ?? 'Document updated',
        timestamp: a.createdAt,
        unread: false,
      })),
    ]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 15);

    /**
     * FINAL RETURN
     */
    return {
      summaryStats: {
        totalActiveProjects,
        projectsInProgress,
        completedProjects,
        pendingActions,
      },

      activeProjects,

      recentActivities: activityFeed,
    };
  }

  async getProjects(clientId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        clientId,
      },
      include: {
        updates: {
          include: {
            staff: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return projects.map((project) => {
      const latestUpdate = project.updates[0];
      const milestones = project.updates.map((update, index) => {
        let status: 'completed' | 'in-progress' | 'pending' = 'completed';

        if (project.status === ProjectStatus.COMPLETED) {
          status = 'completed';
        } else if (index === 0) {
          status = 'in-progress';
        } else if (update.progress === 0) {
          status = 'pending';
        }

        return {
          id: update.id,
          name: update.note || 'Project update',
          dueDate: update.createdAt,
          status,
        };
      });

      return {
        id: project.id,
        name: project.name,
        status: this.mapProjectStatus(project.status),
        startDate: project.createdAt,
        expectedCompletion: project.eCD,
        progress: latestUpdate?.progress ?? 0,
        milestones,
        latestUpdate: latestUpdate
          ? {
              note: latestUpdate.note,
              timestamp: latestUpdate.createdAt,
              author: latestUpdate.staff?.name ?? 'System',
            }
          : null,
      };
    });
  }

  async getReports(clientId: string) {
    const groups = await this.prisma.documentGroup.findMany({
      where: {
        project: {
          clientId,
        },
        category: {
          in: [
            DocumentCategory.REPORT,
            DocumentCategory.CONTRACT,
            DocumentCategory.ANALYTICS,
          ],
        },
      },
      include: {
        project: {
          select: {
            name: true,
          },
        },
        documents: {
          orderBy: { version: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reports = groups.flatMap((group) =>
      group.documents.map((doc) => {
        const fileType = this.getFileType(doc.fileUrl);
        return {
          id: doc.id,
          name: doc.name,
          category: this.mapCategory(group.category),
          version: `v${doc.version}`,
          uploadDate: doc.createdAt,
          fileType,
          fileSize: null,
          projectName: group.project?.name ?? 'Unknown Project',
          canPreview: this.canPreviewFile(fileType),
          fileUrl: doc.fileUrl,
        };
      }),
    );

    return reports.sort(
      (a, b) => b.uploadDate.getTime() - a.uploadDate.getTime(),
    );
  }

  async getInvoices(clientId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        clientId,
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.PAID] },
      },
      include: {
        project: { select: { name: true } },
        lineItems: true,
        client: {
          select: {
            name: true,
            email: true,
            companyName: true,
            department: true,
            address: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const companyInfo = await this.companyService.getProfile();

    return invoices.map((invoice) => {
      const status = this.mapClientInvoiceStatus(
        invoice.status,
        invoice.dueDate,
      );
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        projectName: invoice.project.name,
        projectId: invoice.projectId,
        amount: invoice.total,
        dueDate: invoice.dueDate,
        issueDate: invoice.issueDate,
        status,
        paidDate: invoice.paidAt,
        lineItems: invoice.lineItems,
        notes: invoice.notes,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        total: invoice.total,
        clientMarkedPaid: invoice.clientMarkedPaid,
        clientMarkedPaidAt: invoice.clientMarkedPaidAt,
        receiptUrl:
          invoice.status === InvoiceStatus.PAID
            ? `/client/invoices/${invoice.id}/receipt`
            : null,
        invoiceUrl: `/client/invoices/${invoice.id}/pdf`,
        canDownload:
          invoice.status === InvoiceStatus.APPROVED ||
          invoice.status === InvoiceStatus.PAID,
        companyInfo,
        clientInfo: {
          name: invoice.client.name,
          email: invoice.client.email,
          companyName: invoice.client.companyName,
          department: invoice.client.department,
          address: invoice.client.address,
          phone: invoice.client.phone,
        },
      };
    });
  }

  async markInvoicePaid(clientId: string, invoiceId: string, actor: User) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clientId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        clientMarkedPaid: true,
        clientMarkedPaidAt: new Date(),
      },
    });

    await this.auditService.log(
      actor,
      AuditAction.REQUEST,
      AuditEntity.INVOICE,
      invoiceId,
      'Client marked invoice as paid',
    );

    return updated;
  }

  async getTimesheets(
    clientId: string,
    query?: { projectId?: string; status?: string; staffId?: string },
  ) {
    const where: any = {
      project: { clientId },
    };

    if (query?.projectId) {
      where.projectId = query.projectId;
    }

    if (query?.staffId) {
      where.staffId = query.staffId;
    }

    if (
      query?.status &&
      Object.values(TimesheetStatus).includes(query.status as TimesheetStatus)
    ) {
      where.status = query.status;
    }

    const entries = await this.prisma.timesheetEntry.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { entryDate: 'desc' },
    });

    return entries.map((entry) => ({
      id: entry.id,
      projectId: entry.projectId,
      projectName: entry.project.name,
      staffId: entry.staffId,
      staffName: entry.staff.name,
      staffEmail: entry.staff.email,
      date: entry.entryDate,
      hours: entry.hours,
      notes: entry.notes,
      status: entry.status,
      submittedAt: entry.submittedAt,
      reviewedAt: entry.reviewedAt,
      rejectionReason: entry.rejectionReason,
    }));
  }

  async getInvoiceFile(clientId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clientId },
      include: { project: true, client: true, lineItems: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      invoice.status !== InvoiceStatus.APPROVED &&
      invoice.status !== InvoiceStatus.PAID
    ) {
      throw new BadRequestException('Invoice is not yet approved');
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

    return {
      filename: `invoice-${invoice.invoiceNumber}.pdf`,
      content: await buildInvoicePdf(invoice),
    };
  }

  async getReceiptFile(clientId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clientId },
      include: { project: true, client: true, lineItems: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.PAID) {
      throw new BadRequestException('Receipt not available until payment is confirmed');
    }

    if (invoice.receiptUrl) {
      const path = resolveUploadsPath(invoice.receiptUrl);
      if (fs.existsSync(path)) {
        return {
          filename: `receipt-${invoice.invoiceNumber}.pdf`,
          content: await fs.promises.readFile(path),
        };
      }
    }

    return {
      filename: `receipt-${invoice.invoiceNumber}.pdf`,
      content: await buildReceiptPdf(invoice),
    };
  }

  /**
   * Helpers
   */

  private mapProjectStatus(status: ProjectStatus) {
    switch (status) {
      case ProjectStatus.IN_PROGRESS:
        return 'In Progress';
      case ProjectStatus.COMPLETED:
        return 'Completed';
      case ProjectStatus.PENDING:
      case ProjectStatus.AWAITING_APPROVAL:
        return 'Pending';
      default:
        return status;
    }
  }

  private getStatusColor(status: ProjectStatus) {
    switch (status) {
      case ProjectStatus.COMPLETED:
        return '#4caf50';
      case ProjectStatus.IN_PROGRESS:
        return '#4169e1';
      case ProjectStatus.AWAITING_APPROVAL:
      case ProjectStatus.PENDING:
        return '#ff9800';
      default:
        return '#717182';
    }
  }

  private getFileType(fileUrl: string) {
    const match = fileUrl?.toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/i);
    return match?.[1] ?? 'other';
  }

  private canPreviewFile(fileType: string) {
    return ['pdf', 'docx', 'png', 'jpg', 'jpeg'].includes(fileType);
  }

  private mapCategory(category: DocumentCategory) {
    switch (category) {
      case DocumentCategory.REPORT:
        return 'Report';
      case DocumentCategory.CONTRACT:
        return 'Contract';
      case DocumentCategory.ANALYTICS:
        return 'Analytics';
      default:
        return category;
    }
  }

  private mapClientInvoiceStatus(status: InvoiceStatus, dueDate: Date) {
    if (status === InvoiceStatus.PAID) return 'Paid';
    if (
      (status === InvoiceStatus.PENDING || status === InvoiceStatus.APPROVED) &&
      dueDate.getTime() < Date.now()
    ) {
      return 'Overdue';
    }
    return 'Pending';
  }

  // PDF generation handled in src/invoices/invoice-pdf.ts
}
