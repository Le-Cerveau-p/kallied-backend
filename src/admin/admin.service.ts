/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
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
  UserStatus,
} from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';
import { ChatService } from 'src/chat/chat.service';
import { ProjectsService } from 'src/projects/projects.service';
import { ProcurementService } from 'src/procurements/procurement.service';
import { AuditService } from 'src/audit/audit.service';
import * as bcrypt from 'bcrypt';
import {
  buildInvoicePdf,
  buildReceiptPdf,
  resolveUploadsPath,
  writePdfToUploads,
} from 'src/invoices/invoice-pdf';
import { sendOtpEmail } from 'src/utils/mailer';
import { CompanyService, CompanyProfileInput } from 'src/company/company.service';

@Injectable()
export class AdminService {
  private readonly otpPurposeDefault = 'USER_MANAGEMENT';
  private readonly otpTtlMinutes = 5;
  private readonly otpApprovedRecipients = (
    process.env.OTP_APPROVED_RECIPIENTS ??
    'aremupp@gmail.com,lecerveau.techcity@gmail.com'
  )
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  constructor(
    private prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly projectsService: ProjectsService,
    private readonly procurementService: ProcurementService,
    private readonly auditService: AuditService,
    private readonly companyService: CompanyService,
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

    const procurementByProjectMap = new Map<
      string,
      { amount: number; category: string | null }
    >();

    for (const row of procurementByRequest) {
      const request = await this.prisma.procurementRequest.findUnique({
        where: { id: row.requestId },
        select: {
          project: {
            select: { name: true, category: true },
          },
        },
      });

      if (!request?.project) continue;

      const projectName = request.project.name;
      const projectCategory = request.project.category ?? null;
      const amount = row._sum.estimatedCost ?? 0;
      const current = procurementByProjectMap.get(projectName);
      procurementByProjectMap.set(projectName, {
        amount: (current?.amount ?? 0) + amount,
        category: current?.category ?? projectCategory,
      });
    }

    const procurementByProject = Array.from(
      procurementByProjectMap.entries(),
    ).map(([project, data]) => ({
      project,
      amount: data.amount,
      category: data.category,
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

    const projectsByStatusByCategory = await this.prisma.project.groupBy({
      by: ['status', 'category'],
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

    const projectsOverTimeByCategory = await this.prisma.$queryRaw<
      { month: string; category: string | null; count: number }[]
    >`
    SELECT 
      to_char("createdAt", 'YYYY-MM') AS month,
      "category",
      COUNT(*)::int AS count
    FROM "Project"
    GROUP BY month, "category"
    ORDER BY month ASC
  `;

    return {
      projectsByStatus,
      projectsByStatusByCategory,
      procurementsByStatus,
      projectsOverTime,
      projectsOverTimeByCategory,
    };
  }

  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        companyName: true,
        department: true,
        address: true,
        phone: true,
      },
    });
  }

  async createUser(
    admin: User,
    data: {
      name: string;
      email: string;
      password: string;
      role: Role;
      companyName?: string;
      department?: string;
      address?: string;
      phone?: string;
    },
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashed,
        role: data.role,
        companyName: data.companyName,
        department: data.department,
        address: data.address,
        phone: data.phone,
      },
    });

    await this.auditService.log(
      admin,
      AuditAction.CREATE,
      AuditEntity.USER,
      user.id,
      `Admin created user ${user.email}`,
    );

    return user;
  }

  async updateUser(
    admin: User,
    userId: string,
    data: { name: string; email: string },
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    if (data.email && data.email !== existing.email) {
      const emailTaken = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (emailTaken) {
        throw new BadRequestException('Email already in use');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        authInvalidatedAt: new Date(),
      },
    });

    await this.auditService.log(
      admin,
      AuditAction.UPDATE,
      AuditEntity.USER,
      userId,
      `Admin updated user ${updated.email}`,
    );

    return updated;
  }

  async updateUserRole(admin: User, userId: string, role: Role) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role, authInvalidatedAt: new Date() },
    });

    await this.auditService.log(
      admin,
      AuditAction.UPDATE,
      AuditEntity.USER,
      userId,
      `Admin changed role for ${updated.email} to ${role}`,
    );

    return updated;
  }

  async updateUserStatus(
    admin: User,
    userId: string,
    status: UserStatus,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status, authInvalidatedAt: new Date() },
    });

    await this.auditService.log(
      admin,
      AuditAction.UPDATE,
      AuditEntity.USER,
      userId,
      `Admin set status for ${updated.email} to ${status}`,
    );

    return updated;
  }

  async getCompanyProfile() {
    return this.companyService.getProfile();
  }

  async updateCompanyProfile(admin: User, data: CompanyProfileInput) {
    const updated = await this.companyService.updateProfile(data);

    await this.auditService.log(
      admin,
      AuditAction.UPDATE,
      AuditEntity.DOCUMENT,
      updated.id,
      'Admin updated company profile',
    );

    return updated;
  }

  async sendAdminOtp(
    admin: User,
    purpose?: string,
    recipientEmail?: string,
  ) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(
      Date.now() + this.otpTtlMinutes * 60 * 1000,
    );
    const resolvedPurpose = purpose?.trim() || this.otpPurposeDefault;
    const recipient = recipientEmail?.trim().toLowerCase();

    if (!recipient) {
      throw new BadRequestException('Recipient email is required');
    }
    if (!this.otpApprovedRecipients.includes(recipient)) {
      throw new BadRequestException('Email entered is not approved');
    }

    await this.prisma.otpToken.updateMany({
      where: {
        userId: admin.id,
        purpose: resolvedPurpose,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpToken.create({
      data: {
        userId: admin.id,
        purpose: resolvedPurpose,
        otpHash,
        expiresAt,
      },
    });

    const email = await sendOtpEmail({
      otp,
      purpose: resolvedPurpose,
      expiresAt,
      requestedBy: admin.email,
      to: recipient,
    });

    await this.auditService.log(
      admin,
      AuditAction.REQUEST,
      AuditEntity.USER,
      admin.id,
      `Admin requested OTP for ${resolvedPurpose}`,
    );

    return {
      expiresAt,
      email: email.to,
    };
  }

  async verifyAdminOtp(
    admin: User,
    data: { otp: string; purpose?: string },
  ) {
    const resolvedPurpose = data.purpose?.trim() || this.otpPurposeDefault;
    const now = new Date();

    const token = await this.prisma.otpToken.findFirst({
      where: {
        userId: admin.id,
        purpose: resolvedPurpose,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new BadRequestException('OTP not found or expired');
    }

    const valid = await bcrypt.compare(data.otp, token.otpHash);
    if (!valid) {
      throw new BadRequestException('Invalid OTP');
    }

    await this.prisma.otpToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });

    await this.auditService.log(
      admin,
      AuditAction.APPROVE,
      AuditEntity.USER,
      admin.id,
      `Admin verified OTP for ${resolvedPurpose}`,
    );

    return { valid: true };
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

  async getInvoices() {
    const invoices = await this.prisma.invoice.findMany({
      include: {
        project: { select: { name: true } },
        client: { select: { name: true, email: true } },
        createdBy: { select: { name: true } },
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
      createdBy: invoice.createdBy?.name ?? 'System',
      invoiceUrl: `/admin/invoices/${invoice.id}/pdf`,
      receiptUrl: invoice.receiptUrl
        ? `/admin/invoices/${invoice.id}/receipt`
        : null,
    }));
  }

  async createInvoice(
    adminId: string,
    data: {
      projectId: string;
      dueDate: string;
      lineItems: Array<{ description: string; quantity: number; rate: number }>;
      tax?: number;
      notes?: string;
    },
    actor: User,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: data.projectId },
      include: { client: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
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
        clientId: project.clientId,
        createdById: adminId,
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
      'Admin created invoice',
    );

    return invoice;
  }

  async getTimesheets(query?: {
    staffId?: string;
    projectId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: any = {};

    if (query?.staffId) {
      where.staffId = query.staffId;
    }

    if (query?.projectId) {
      where.projectId = query.projectId;
    }

    if (
      query?.status &&
      Object.values(TimesheetStatus).includes(query.status as TimesheetStatus)
    ) {
      where.status = query.status;
    }

    if (query?.startDate || query?.endDate) {
      where.entryDate = {};
      if (query.startDate) {
        where.entryDate.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.entryDate.lte = new Date(query.endDate);
      }
    }

    const entries = await this.prisma.timesheetEntry.findMany({
      where,
      include: {
        staff: { select: { id: true, name: true, email: true } },
        project: {
          select: {
            id: true,
            name: true,
            client: { select: { id: true, name: true } },
          },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { entryDate: 'desc' },
    });

    return entries.map((entry) => ({
      id: entry.id,
      projectId: entry.projectId,
      projectName: entry.project.name,
      clientId: entry.project.client.id,
      clientName: entry.project.client.name,
      staffId: entry.staffId,
      staffName: entry.staff.name,
      staffEmail: entry.staff.email,
      date: entry.entryDate,
      hours: entry.hours,
      notes: entry.notes,
      status: entry.status,
      submittedAt: entry.submittedAt,
      reviewedAt: entry.reviewedAt,
      reviewedBy: entry.reviewedBy?.name ?? null,
      rejectionReason: entry.rejectionReason,
    }));
  }

  async approveTimesheet(id: string, admin: User) {
    const entry = await this.prisma.timesheetEntry.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException('Timesheet entry not found');

    const updated = await this.prisma.timesheetEntry.update({
      where: { id },
      data: {
        status: TimesheetStatus.APPROVED,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    return updated;
  }

  async rejectTimesheet(id: string, reason: string, admin: User) {
    const entry = await this.prisma.timesheetEntry.findUnique({
      where: { id },
    });
    if (!entry) throw new NotFoundException('Timesheet entry not found');

    const updated = await this.prisma.timesheetEntry.update({
      where: { id },
      data: {
        status: TimesheetStatus.REJECTED,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectionReason: reason ?? 'Rejected by admin',
      },
    });

    return updated;
  }

  async approveInvoice(id: string, admin: User) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.APPROVED,
        approvedById: admin.id,
      },
      include: { project: true, client: true, lineItems: true },
    });

    if (!updated.fileUrl) {
      const buffer = await buildInvoicePdf(updated);
      const saved = await writePdfToUploads(
        `invoices/${updated.id}`,
        `invoice-${updated.invoiceNumber}.pdf`,
        buffer,
      );
      await this.prisma.invoice.update({
        where: { id },
        data: { fileUrl: saved.fileUrl },
      });
    }

    await this.auditService.log(
      admin,
      AuditAction.APPROVE,
      AuditEntity.INVOICE,
      id,
      'Admin approved invoice',
    );

    return updated;
  }

  async rejectInvoice(id: string, reason: string, admin: User) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.REJECTED,
        rejectionReason: reason,
        approvedById: admin.id,
      },
    });

    await this.auditService.log(
      admin,
      AuditAction.REJECT,
      AuditEntity.INVOICE,
      id,
      'Admin rejected invoice',
    );

    return updated;
  }

  async confirmInvoicePayment(id: string, admin: User) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.PAID,
        paymentConfirmedAt: new Date(),
        paidAt: new Date(),
      },
      include: { project: true, client: true, lineItems: true },
    });

    if (!updated.receiptUrl) {
      const buffer = await buildReceiptPdf(updated);
      const saved = await writePdfToUploads(
        `invoices/${updated.id}`,
        `receipt-${updated.invoiceNumber}.pdf`,
        buffer,
      );
      await this.prisma.invoice.update({
        where: { id },
        data: { receiptUrl: saved.fileUrl },
      });
    }

    await this.auditService.log(
      admin,
      AuditAction.COMPLETE,
      AuditEntity.INVOICE,
      id,
      'Admin confirmed invoice payment',
    );

    return updated;
  }

  async getInvoiceFile(id: string, admin: User) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { project: true, client: true, lineItems: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

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
      admin,
      AuditAction.DOWNLOAD,
      AuditEntity.INVOICE,
      id,
      'Admin downloaded invoice',
    );

    return {
      filename: `invoice-${invoice.invoiceNumber}.pdf`,
      content: await buildInvoicePdf(invoice),
    };
  }

  async getReceiptFile(id: string, admin: User) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
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
      admin,
      AuditAction.DOWNLOAD,
      AuditEntity.RECEIPT,
      id,
      'Admin downloaded receipt',
    );

    return {
      filename: `receipt-${invoice.invoiceNumber}.pdf`,
      content: await buildReceiptPdf(invoice),
    };
  }
  // PDF generation handled in src/invoices/invoice-pdf.ts
}
