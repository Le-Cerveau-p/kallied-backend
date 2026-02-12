import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decoration';
import * as client from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ClientService } from './client.service';
import type { Response } from 'express';

@Controller('client')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(client.Role.CLIENT)
export class ClientController {
  constructor(private clientService: ClientService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: client.User) {
    return this.clientService.getDashboard(user.id);
  }

  @Get('projects')
  getProjects(@CurrentUser() user: client.User) {
    return this.clientService.getProjects(user.id);
  }

  @Get('reports')
  getReports(@CurrentUser() user: client.User) {
    return this.clientService.getReports(user.id);
  }

  @Get('invoices')
  getInvoices(@CurrentUser() user: client.User) {
    return this.clientService.getInvoices(user.id);
  }

  @Get('timesheets')
  getTimesheets(
    @CurrentUser() user: client.User,
    @Query()
    query: { projectId?: string; status?: string; staffId?: string },
  ) {
    return this.clientService.getTimesheets(user.id, query);
  }

  @Post('invoices/:id/mark-paid')
  markInvoicePaid(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.clientService.markInvoicePaid(user.id, id, user);
  }

  @Get('invoices/:id/pdf')
  async downloadInvoice(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
    @Res() res: Response,
  ) {
    const file = await this.clientService.getInvoiceFile(user.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${file.filename}`,
    );
    res.send(file.content);
  }

  @Get('invoices/:id/receipt')
  async downloadReceipt(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
    @Res() res: Response,
  ) {
    const file = await this.clientService.getReceiptFile(user.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${file.filename}`,
    );
    res.send(file.content);
  }
}
