import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ParseFloatPipe,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ProcurementStatus,
  Role,
  User,
  PurchaseOrderStatus,
  AuditAction,
  AuditEntity,
} from '@prisma/client';
import { CreateProcurementDto } from './dto/create-procurement.dto';
import { UpdateProcurementDto } from './dto/update-procurement.dto';
import { CreateProcurementItemDto } from './dto/create-procurement-item.dto';
import { UpdateProcurementItemDto } from './dto/update-procurement-item.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import * as path from 'path';
import * as fs from 'fs';
import { th } from 'date-fns/locale/th';

@Injectable()
export class ProcurementService {
  constructor(
    private prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // 1️⃣ CREATE
  async create(dto: CreateProcurementDto, user: User) {
    if (user.role !== Role.STAFF) {
      throw new ForbiddenException('Only staff can create procurement');
    }

    const assignment = await this.prisma.projectStaff.findUnique({
      where: {
        projectId_staffId: {
          projectId: dto.projectId,
          staffId: user.id,
        },
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });

    await this.auditService.log(
      user,
      AuditAction.CREATE,
      AuditEntity.PROCUREMENT,
      dto.projectId,
      `"${user.name}" created a procurement request for ${project?.name}.`,
    );

    return this.prisma.procurementRequest.create({
      data: {
        title: dto.title,
        description: dto.description,
        projectId: dto.projectId,
        cost: dto.cost,
        createdById: user.id,
      },
    });
  }

  // 2️⃣ UPDATE (DRAFT only)
  async update(id: string, dto: UpdateProcurementDto, user: User) {
    const request = await this.findById(id);

    if (
      request.status !== ProcurementStatus.DRAFT ||
      request.createdById !== user.id
    ) {
      throw new ForbiddenException('Cannot edit this request');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: request.id },
    });

    await this.auditService.log(
      user,
      AuditAction.CREATE,
      AuditEntity.PROCUREMENT,
      request.id,
      `"${user.name}" created a procurement request for ${project?.name}.`,
    );

    return this.prisma.procurementRequest.update({
      where: { id },
      data: dto,
    });
  }

  // 3️⃣ SUBMIT
  async submit(id: string, user: User) {
    const request = await this.findById(id);

    if (request.createdById !== user.id) {
      throw new ForbiddenException('Not your request');
    }

    if (request.status !== ProcurementStatus.DRAFT) {
      throw new ForbiddenException('Only drafts can be submitted');
    }

    await this.auditService.log(
      user,
      AuditAction.SUBMIT,
      AuditEntity.PROCUREMENT,
      request.id,
      `Procurement submitted by ${user.name}`,
    );

    const result = await this.prisma.procurementItem.aggregate({
      where: { requestId: id },
      _sum: {
        estimatedCost: true,
      },
    });

    const total = Number(result._sum.estimatedCost || 0);

    return this.prisma.procurementRequest.update({
      where: { id },
      data: { cost: total, status: ProcurementStatus.SUBMITTED },
    });
  }

  // 4️⃣ APPROVE
  async approve(id: string, admin: User) {
    if (admin.role !== Role.ADMIN) {
      throw new ForbiddenException('Admins only');
    }

    const request = await this.findById(id);

    if (request.status !== ProcurementStatus.SUBMITTED) {
      throw new ForbiddenException('Request not submitted');
    }

    await this.auditService.log(
      admin,
      AuditAction.APPROVE,
      AuditEntity.PROCUREMENT,
      request.id,
      `"${admin.name}" approved procurement ${request?.title}.`,
    );

    return this.prisma.procurementRequest.update({
      where: { id },
      data: {
        status: ProcurementStatus.APPROVED,
        approvedById: admin.id,
      },
    });
  }

  // 5️⃣ REJECT
  async reject(id: string, reason: string, admin: User) {
    if (admin.role !== Role.ADMIN) {
      throw new ForbiddenException('Admins only');
    }

    const request = await this.findById(id);

    await this.auditService.log(
      admin,
      AuditAction.APPROVE,
      AuditEntity.PROCUREMENT,
      request?.id,
      `"${admin.name}" approved procurement ${request?.title}.`,
    );

    return this.prisma.procurementRequest.update({
      where: { id },
      data: {
        status: ProcurementStatus.REJECTED,
        rejectionReason: reason,
        approvedById: admin.id,
      },
    });
  }

  // 🔎 Helper
  private async findById(id: string) {
    const req = await this.prisma.procurementRequest.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!req) throw new NotFoundException('Procurement not found');
    return req;
  }

  async addItem(requestId: string, data: CreateProcurementItemDto, user: User) {
    const request = await this.prisma.procurementRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) throw new NotFoundException('Procurement request not found');

    if (request.status !== ProcurementStatus.DRAFT) {
      throw new ForbiddenException('Cannot modify items after submission');
    }

    if (user.role !== Role.STAFF || request.createdById !== user.id) {
      throw new ForbiddenException('Not allowed');
    }

    return this.prisma.procurementItem.create({
      data: {
        ...data,
        requestId,
      },
    });
  }

  async updateItem(itemId: string, data: UpdateProcurementItemDto, user: User) {
    const item = await this.prisma.procurementItem.findUnique({
      where: { id: itemId },
      include: { pRequest: true },
    });

    if (!item) throw new NotFoundException('Item not found');

    if (item.pRequest.status !== ProcurementStatus.DRAFT) {
      throw new ForbiddenException('Cannot edit item after submission');
    }

    if (user.role !== Role.STAFF || item.pRequest.createdById !== user.id) {
      throw new ForbiddenException('Not allowed');
    }

    return this.prisma.procurementItem.update({
      where: { id: itemId },
      data,
    });
  }

  async deleteItem(itemId: string, user: User) {
    const item = await this.prisma.procurementItem.findUnique({
      where: { id: itemId },
      include: { pRequest: true },
    });

    if (!item) throw new NotFoundException('Item not found');

    if (item.pRequest.status !== ProcurementStatus.DRAFT) {
      throw new ForbiddenException('Cannot delete item after submission');
    }

    if (user.role !== Role.STAFF || item.pRequest.createdById !== user.id) {
      throw new ForbiddenException('Not allowed');
    }

    return this.prisma.procurementItem.delete({
      where: { id: itemId },
    });
  }

  async getItems(requestId: string, user: User) {
    const request = await this.prisma.procurementRequest.findUnique({
      where: { id: requestId },
      include: { items: true },
    });

    if (!request) throw new NotFoundException('Request not found');

    // STAFF: only own
    if (user.role === Role.STAFF && request.createdById !== user.id) {
      throw new ForbiddenException();
    }

    return {
      items: request.items,
      totalEstimatedCost: request.items.reduce(
        (sum, item) => sum + (item.estimatedCost ?? 0) * item.quantity,
        0,
      ),
    };
  }

  async generatePurchaseOrder(requestId: string, user: User) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can generate purchase orders');
    }

    const request = await this.prisma.procurementRequest.findUnique({
      where: { id: requestId },
      include: { purchaseOrder: true, items: true },
    });

    if (!request) throw new NotFoundException('Request not found');

    if (request.status !== ProcurementStatus.APPROVED) {
      throw new ForbiddenException('Request must be approved first');
    }

    if (request.purchaseOrder) {
      throw new ForbiddenException('Purchase order already exists');
    }

    if (!request.items.length) {
      throw new ForbiddenException('Cannot generate PO without items');
    }

    await this.auditService.log(
      user,
      AuditAction.CREATE,
      AuditEntity.PURCHASE_ORDER,
      request.id,
      `"${user.name}" generated purchase order for ${request?.title}.`,
    );

    return this.prisma.$transaction(async (tx) => {
      return tx.purchaseOrder.create({
        data: {
          orderNumber: `PO-${Date.now()}`,
          requestId,
          orderedById: user.id,
        },
      });
    });
  }

  async markAsOrdered(poId: string, user: User) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can mark ordered');
    }

    const request = await this.prisma.purchaseOrder.findFirstOrThrow({
      where: { id: poId },
      include: { pRequest: true },
    });

    await this.auditService.log(
      user,
      AuditAction.CREATE,
      AuditEntity.PURCHASE_ORDER,
      request.id,
      `"${user.name}" marked purchase order for ${request.pRequest.title} as ordered.`,
    );

    return await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: PurchaseOrderStatus.ORDERED,
        orderedAt: new Date(),
      },
    });
  }

  async markAsDelivered(poId: string, user: User) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can mark delivered');
    }

    const request = await this.prisma.purchaseOrder.findFirstOrThrow({
      where: { id: poId },
      include: { pRequest: true },
    });

    await this.auditService.log(
      user,
      AuditAction.CREATE,
      AuditEntity.PURCHASE_ORDER,
      request.id,
      `"${user.name}" marked purchase order for ${request.pRequest.title} as delivered.`,
    );

    return await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: PurchaseOrderStatus.DELIVERED,
        deliveredAt: new Date(),
      },
    });
  }

  async uploadDocument(
    procurementId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    user: User,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const procurement = await this.prisma.procurementRequest.findUnique({
      where: { id: procurementId },
    });

    if (!procurement) throw new NotFoundException('Procurement not found');

    if (user.role === Role.STAFF && procurement.createdById !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to upload to this procurement',
      );
    }

    if (user.role === Role.CLIENT) {
      throw new ForbiddenException(
        'Clients cannot upload procurement documents',
      );
    }

    const projectId = procurement.projectId;

    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'projects',
      projectId,
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, file.buffer);

    const fileUrl = `/uploads/projects/${projectId}/${filename}`;

    let group = await this.prisma.documentGroup.findFirst({
      where: {
        procurementRequestId: procurementId,
        name: dto.groupName,
        category: dto.category,
      },
    });

    if (!group) {
      group = await this.prisma.documentGroup.create({
        data: {
          name: dto.groupName,
          category: dto.category,
          procurementRequestId: procurementId,
        },
      });
    }

    const lastVersion = await this.prisma.document.findFirst({
      where: { groupId: group.id },
      orderBy: { version: 'desc' },
    });

    const version = lastVersion ? lastVersion.version + 1 : 1;

    await this.auditService.log(
      user,
      AuditAction.UPLOAD,
      AuditEntity.DOCUMENT,
      group.id,
      `Uploaded document "${dto.name}"`,
    );

    return this.prisma.document.create({
      data: {
        name: dto.name,
        fileUrl: fileUrl,
        category: dto.category,
        version,
        groupId: group.id,
        uploadedById: user.id,
      },
    });
  }

  async uploadPurchaseOrderDocument(
    poId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    user: User,
  ) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { pRequest: true },
    });

    if (!po) throw new NotFoundException('Purchase order not found');

    if (user.role === Role.STAFF && po.orderedById !== user.id) {
      throw new ForbiddenException(
        'You are not allowed to upload to this procurement',
      );
    }

    if (user.role === Role.CLIENT) {
      throw new ForbiddenException(
        'Clients cannot upload procurement documents',
      );
    }

    const projectId = po.pRequest.projectId;

    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'projects',
      projectId,
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, file.buffer);

    const fileUrl = `/uploads/projects/${projectId}/${filename}`;

    let group = await this.prisma.documentGroup.findFirst({
      where: {
        purchaseOrderId: poId,
        name: dto.groupName,
        category: dto.category,
      },
    });

    if (!group) {
      group = await this.prisma.documentGroup.create({
        data: {
          name: dto.groupName,
          category: dto.category,
          purchaseOrderId: poId,
        },
      });
    }

    const last = await this.prisma.document.findFirst({
      where: { groupId: group.id },
      orderBy: { version: 'desc' },
    });

    await this.auditService.log(
      user,
      AuditAction.UPLOAD,
      AuditEntity.DOCUMENT,
      group.id,
      `Uploaded document "${dto.name}"`,
    );

    return this.prisma.document.create({
      data: {
        name: dto.name,
        fileUrl,
        category: dto.category,
        version: last ? last.version + 1 : 1,
        groupId: group.id,
        uploadedById: user.id,
      },
    });
  }

  async getProcurementDocuments(id: string) {
    return this.prisma.documentGroup.findMany({
      where: { procurementRequestId: id },
      include: {
        documents: {
          orderBy: { version: 'desc' },
        },
      },
    });
  }

  async getPurchaseOrderDocuments(poId: string) {
    return this.prisma.documentGroup.findMany({
      where: { purchaseOrderId: poId },
      include: {
        documents: {
          orderBy: { version: 'desc' },
        },
      },
    });
  }

  // ProcurementService
  async getDocumentById(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}
