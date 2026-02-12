import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Body,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decoration';
import * as client from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { StaffService } from './staff.service';
import type { Response } from 'express';

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(client.Role.STAFF)
export class StaffController {
  constructor(private staffService: StaffService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: client.User) {
    return this.staffService.getDashboard(user.id);
  }

  @Get('projects')
  async getMyProjects(@CurrentUser() user: client.User) {
    return this.staffService.getMyProjects(user.id);
  }

  @Get('projects/:id')
  async getProjectById(@Param('id') id: string) {
    return this.staffService.getProjectById(id);
  }

  @Get('invoices')
  async getInvoices(@CurrentUser() user: client.User) {
    return this.staffService.getInvoices(user.id);
  }

  @Post('invoices')
  async createInvoice(
    @CurrentUser() user: client.User,
    @Body()
    body: {
      projectId: string;
      dueDate: string;
      lineItems: Array<{ description: string; quantity: number; rate: number }>;
      tax?: number;
      notes?: string;
    },
  ) {
    return this.staffService.createInvoice(user.id, body, user);
  }

  @Get('invoices/:id/pdf')
  async downloadInvoice(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
    @Res() res: Response,
  ) {
    const file = await this.staffService.getInvoiceFile(user.id, id, user);
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
    const file = await this.staffService.getReceiptFile(user.id, id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${file.filename}`,
    );
    res.send(file.content);
  }

  @Get('timesheets')
  getTimesheets(@CurrentUser() user: client.User) {
    return this.staffService.getTimesheets(user.id);
  }

  @Post('timesheets')
  createTimesheet(
    @CurrentUser() user: client.User,
    @Body()
    body: {
      projectId: string;
      date: string;
      hours: number;
      notes?: string;
    },
  ) {
    return this.staffService.createTimesheet(user.id, body);
  }

  @Delete('timesheets/:id')
  deleteTimesheet(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.staffService.deleteTimesheet(user.id, id);
  }
}
