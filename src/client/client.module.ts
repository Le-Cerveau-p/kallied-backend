import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { AuditModule } from 'src/audit/audit.module';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { CompanyModule } from 'src/company/company.module';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule, CompanyModule],
  providers: [ClientService],
  controllers: [ClientController],
})
export class ClientModule {}
