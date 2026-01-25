import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditEntity, User } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    actor: User,
    action: AuditAction,
    entity: AuditEntity,
    entityId: string,
    message?: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action,
        entity,
        entityId,
        message,
      },
    });
  }
}
