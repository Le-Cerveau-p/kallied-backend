import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from 'src/auth/auth.module';
import { AuditModule } from 'src/audit/audit.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ChatService } from 'src/chat/chat.service';
import { ChatGateway } from 'src/chat/chat.gateway';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, PrismaService, ChatService, ChatGateway],
})
export class ProjectsModule {}
