import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ChatService } from 'src/chat/chat.service';
import { ProjectsService } from 'src/projects/projects.service';
import { AuditService } from 'src/audit/audit.service';
import { ChatGateway } from 'src/chat/chat.gateway';
import { ProcurementService } from 'src/procurements/procurement.service';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    StaffService,
    ChatService,
    ProjectsService,
    AuditService,
    ChatGateway,
    ProcurementService,
  ],
  controllers: [StaffController],
})
export class StaffModule {}
