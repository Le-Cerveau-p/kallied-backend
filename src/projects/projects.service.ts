/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  Role,
  User,
  Project,
  ProjectStatus,
  ProjectEventType,
  DocumentCategory,
  AuditAction,
  AuditEntity,
} from '@prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import * as fs from 'fs';
import * as path from 'path';
import { ChatService } from 'src/chat/chat.service';
import { ChatGateway } from 'src/chat/chat.gateway';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  async createProject(data: CreateProjectDto, user: User): Promise<Project> {
    if (user.role === Role.CLIENT) {
      throw new ForbiddenException('Clients cannot create projects');
    }

    // Prisma returns the Project type automatically;
    // explicit typing 'const project: Project' is often redundant.
    // Verify client exists
    const client = await this.prisma.user.findUnique({
      where: { id: data.clientId },
    });

    if (!client || client.role !== Role.CLIENT) {
      throw new ForbiddenException('Invalid client selected');
    }

    const newProject = await this.prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        clientId: data.clientId,
        status: ProjectStatus.PENDING,
      },
    });

    await this.chatService.createProjectThreads(newProject.id);
    await this.chatService.addClientToMainThread(newProject.id, data.clientId);

    if (user.role === Role.STAFF) {
      await this.prisma.projectStaff.create({
        data: {
          projectId: newProject.id,
          staffId: user.id,
        },
      });
      await this.chatService.addStaffToProjectThreads(newProject.id, user.id);
    }

    await this.prisma.projectUpdate.create({
      data: {
        projectId: newProject.id,
        staffId: user.id,
        eventType: ProjectEventType.CREATED,
        progress: 0,
        note: 'Project submitted for approval',
      },
    });

    await this.auditService.log(
      user,
      AuditAction.CREATE,
      AuditEntity.PROJECT,
      newProject.id,
      `Project "${newProject.name}" created`,
    );

    return newProject;
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

  async removeStaffFromProject(
    projectId: string,
    staffId: string,
    currentUser: { id: string; role: Role },
  ) {
    // 1️⃣ Only ADMIN can remove staff
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can remove staff from project');
    }

    // 2️⃣ Ensure project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // 3️⃣ Ensure staff is assigned
    const assignment = await this.prisma.projectStaff.findUnique({
      where: {
        projectId_staffId: {
          projectId,
          staffId,
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Staff not assigned to this project');
    }

    // 4️⃣ Remove staff from project
    await this.prisma.projectStaff.delete({
      where: {
        projectId_staffId: {
          projectId,
          staffId,
        },
      },
    });

    // 5️⃣ 🔥 REMOVE STAFF FROM ALL PROJECT CHATS
    await this.chatService.removeUserFromProjectChats(projectId, staffId);

    // 🔥 Emit websocket event
    this.chatGateway.emitUserRemovedFromProject(projectId, staffId);

    return {
      message: 'Staff removed from project and chats successfully',
    };
  }

  async assignStaff(projectId: string, staffId: string) {
    const staff = await this.prisma.user.findUnique({
      where: { id: staffId },
    });

    if (!staff || staff.role !== Role.STAFF) {
      throw new ForbiddenException('Invalid staff user');
    }

    return this.prisma.projectStaff.create({
      data: {
        projectId,
        staffId,
      },
    });
  }

  async getProjectsForUser(user: User) {
    switch (user.role) {
      case Role.ADMIN:
        return this.prisma.project.findMany({
          include: {
            staff: true,
            client: true,
          },
        });

      case Role.STAFF:
        return this.prisma.project.findMany({
          where: {
            OR: [
              {
                staff: {
                  some: {
                    staffId: user.id,
                  },
                },
              },
            ],
          },
          include: {
            client: true,
          },
        });

      case Role.CLIENT:
        return this.prisma.project.findMany({
          where: {
            clientId: user.id,
          },
          include: {
            staff: true,
          },
        });

      default:
        throw new ForbiddenException('Invalid role');
    }
  }

  async updateProjectStatus(
    projectId: string,
    status: ProjectStatus,
    user: User,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new ForbiddenException('Project not found');
    }

    // CLIENTS CANNOT UPDATE STATUS
    if (user.role === Role.CLIENT) {
      throw new ForbiddenException('Clients cannot update project status');
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: { status },
    });
  }

  async requestStart(projectId: string, user: User) {
    const staffId = user.id;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) throw new NotFoundException('Project not found');

    if (project.status !== ProjectStatus.PENDING) {
      throw new ForbiddenException(
        'Only pending projects can be submitted for approval',
      );
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.PENDING,
      },
    });

    // 🔔 notify admin
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN },
    });

    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        title: 'Project Start Approval Required',
        message: `Project "${project.name}" has requested approval to start.\n Request by "${staffId}"`,
        type: 'PROJECT_APPROVAL',
        userId: admin.id,
      })),
    });

    await this.prisma.projectUpdate.create({
      data: {
        projectId,
        staffId,
        eventType: ProjectEventType.START_REQUESTED,
        progress: 0,
        note: 'Project submitted for approval',
      },
    });
  }

  async approveProject(projectId: string, user: User) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) throw new NotFoundException('Project not found');

    if (project.status !== ProjectStatus.PENDING) {
      throw new ForbiddenException('Only pending projects can be approved');
    }

    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only Admins can update project status');
    }

    await this.prisma.projectUpdate.create({
      data: {
        projectId,
        staffId: user.id,
        eventType: ProjectEventType.APPROVED,
        progress: 10,
        note: 'Project approved',
      },
    });

    await this.auditService.log(
      user,
      AuditAction.APPROVE,
      AuditEntity.PROJECT,
      projectId,
      'Project approved',
    );

    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.IN_PROGRESS, approvedById: user.id },
    });
  }

  async completeProject(projectId: string, user: User) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) throw new NotFoundException('Project not found');

    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new ForbiddenException('Only active projects can be completed');
    }

    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only Admins can update project status');
    }

    await this.prisma.projectUpdate.create({
      data: {
        projectId,
        staffId: user.id,
        eventType: ProjectEventType.COMPLETED,
        progress: 100,
        note: 'Project Completed',
      },
    });

    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.COMPLETED },
    });
  }

  async addUpdate(projectId: string, data: CreateProjectUpdateDto, user: any) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) throw new NotFoundException('Project not found');

    // Only STAFF can add updates
    if (user.role !== Role.STAFF) {
      throw new ForbiddenException('Only staff can add updates');
    }

    // Ensure staff is assigned to project
    const assignment = await this.prisma.projectStaff.findUnique({
      where: {
        projectId_staffId: {
          projectId,
          staffId: user.id,
        },
      },
    });

    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this project');
    }

    return this.prisma.projectUpdate.create({
      data: {
        projectId,
        staffId: user.id,
        eventType: ProjectEventType.PROGRESS_UPDATE,
        note: data.note,
        progress: data.progress,
      },
    });
  }

  async uploadDocument(
    projectId: string,
    data: CreateDocumentDto,
    file: Express.Multer.File,
    user: User,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) throw new NotFoundException('Project not found');

    if (user.role === Role.CLIENT) {
      throw new ForbiddenException('Clients cannot upload documents');
    }

    // STAFF must be assigned
    if (user.role === Role.STAFF) {
      const assigned = await this.prisma.projectStaff.findUnique({
        where: {
          projectId_staffId: {
            projectId,
            staffId: user.id,
          },
        },
      });

      if (!assigned) {
        throw new ForbiddenException('Not assigned to project');
      }
    }

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

    // 1️⃣ Find or create document group
    let group = await this.prisma.documentGroup.findFirst({
      where: {
        projectId,
        name: data.groupName,
        category: data.category,
      },
    });

    if (!group) {
      group = await this.prisma.documentGroup.create({
        data: {
          name: data.groupName,
          category: data.category,
          projectId,
        },
      });
    }

    // 2️⃣ Determine next version
    const lastDoc = await this.prisma.document.findFirst({
      where: { groupId: group.id },
      orderBy: { version: 'desc' },
    });

    const nextVersion = lastDoc ? lastDoc.version + 1 : 1;

    // 3️⃣ Save document
    return this.prisma.document.create({
      data: {
        name: data.name,
        fileUrl: fileUrl,
        uploadedById: user.id,
        category: data.category,
        version: nextVersion,
        groupId: group.id,
      },
    });
  }

  // GET /projects/:id/documents
  async getProjectDocuments(projectId: string, user: User) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) throw new NotFoundException('Project not found');

    if (user.role === Role.CLIENT && project.clientId !== user.id) {
      throw new ForbiddenException();
    }

    return this.prisma.documentGroup.findMany({
      where: { projectId },
      include: {
        documents: {
          orderBy: { version: 'desc' },
        },
      },
    });
  }

  async getLatestDocuments(projectId: string) {
    const groups = await this.prisma.documentGroup.findMany({
      where: { projectId },
      include: {
        documents: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    return groups.map((g) => g.documents[0]);
  }

  // GET /documents/:id/download
  async downloadDocument(documentId: string, user: User) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        group: {
          include: {
            project: true,
            procurementRequest: {
              include: { project: true },
            },
            purchaseOrder: {
              include: {
                pRequest: {
                  include: { project: true },
                },
              },
            },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // 🔹 Resolve owning project (CRITICAL STEP)
    const project =
      document.group.project ??
      document.group.procurementRequest?.project ??
      document.group.purchaseOrder?.pRequest.project;

    if (!project) {
      throw new ForbiddenException('Document is not linked to a project');
    }

    // 🔹 CLIENT access
    if (user.role === Role.CLIENT) {
      if (
        // project.clientId !== user.id ||
        document.category !== DocumentCategory.REPORT
      ) {
        throw new ForbiddenException('Access denied');
      }
    }

    // 🔹 STAFF access
    if (user.role === Role.STAFF) {
      const assigned = await this.prisma.projectStaff.findUnique({
        where: {
          projectId_staffId: {
            projectId: project.id,
            staffId: user.id,
          },
        },
      });

      if (!assigned) {
        throw new ForbiddenException('Not assigned to project');
      }
    }

    // 🔹 ADMIN always allowed

    return {
      fileUrl: document.fileUrl,
      name: document.name,
      type: document.category,
    };
  }
}
