import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decoration';
import { Role } from '@prisma/client';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async getLogs(@Query('take') take = '50', @Query('skip') skip = '0') {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Number(take),
      skip: Number(skip),
      include: {
        actor: {
          select: { id: true, name: true, role: true },
        },
      },
    });
  }
}
