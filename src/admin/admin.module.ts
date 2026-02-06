import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ChatService } from 'src/chat/chat.service';
import { ProjectsService } from 'src/projects/projects.service';
import { AuditService } from 'src/audit/audit.service';
import { ChatGateway } from 'src/chat/chat.gateway';
import { ProcurementService } from 'src/procurements/procurement.service';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    AdminService,
    ChatService,
    ProjectsService,
    AuditService,
    ChatGateway,
    ProcurementService,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
