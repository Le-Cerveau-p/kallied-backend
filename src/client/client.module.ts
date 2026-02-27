import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { AuditModule } from 'src/audit/audit.module';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { CompanyModule } from 'src/company/company.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    CompanyModule,
    NotificationsModule,
  ],
  providers: [ClientService],
  controllers: [ClientController],
})
export class ClientModule {}
