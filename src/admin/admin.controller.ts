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
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decoration';
import * as client from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { Response } from 'express';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(client.Role.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboardSummary();
  }

  @Get('pending-projects')
  getPendingProjects() {
    return this.adminService.getPendingProjects();
  }

  @Get('pending-procurements')
  getPendingProcurements() {
    return this.adminService.getPendingProcurements();
  }

  @Get('charts')
  getCharts() {
    return this.adminService.getChartData();
  }

  @Get('users')
  getUsers() {
    return this.adminService.getUsers();
  }

  @Get('company-profile')
  getCompanyProfile() {
    return this.adminService.getCompanyProfile();
  }

  @Patch('company-profile')
  updateCompanyProfile(
    @CurrentUser() admin: client.User,
    @Body()
    body: {
      name?: string;
      department?: string;
      address?: string;
      email?: string;
      phone?: string;
      mapLabel?: string;
      mapAddress?: string;
      mapUrl?: string;
      mapEmbedUrl?: string;
      mapLat?: number;
      mapLng?: number;
    },
  ) {
    return this.adminService.updateCompanyProfile(admin, body);
  }

  @Post('otp/send')
  sendOtp(
    @CurrentUser() admin: client.User,
    @Body() body?: { purpose?: string; recipientEmail?: string },
  ) {
    return this.adminService.sendAdminOtp(
      admin,
      body?.purpose,
      body?.recipientEmail,
    );
  }

  @Post('otp/verify')
  verifyOtp(
    @CurrentUser() admin: client.User,
    @Body() body: { otp: string; purpose?: string },
  ) {
    return this.adminService.verifyAdminOtp(admin, body);
  }

  @Post('users')
  createUser(
    @CurrentUser() admin: client.User,
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      role: client.Role;
      companyName?: string;
      department?: string;
      address?: string;
      phone?: string;
    },
  ) {
    return this.adminService.createUser(admin, body);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() admin: client.User,
    @Param('id') userId: string,
    @Body() body: { name: string; email: string },
  ) {
    return this.adminService.updateUser(admin, userId, body);
  }

  @Patch('users/:id/role')
  updateUserRole(
    @CurrentUser() admin: client.User,
    @Param('id') userId: string,
    @Body() body: { role: client.Role },
  ) {
    return this.adminService.updateUserRole(admin, userId, body.role);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @CurrentUser() admin: client.User,
    @Param('id') userId: string,
    @Body() body: { status: client.UserStatus },
  ) {
    return this.adminService.updateUserStatus(admin, userId, body.status);
  }

  @Get('company-users')
  getCompanyUsers() {
    return this.adminService.getCompanyUsers();
  }

  @Get('users/:id/projects')
  getUserProjects(@Param('id') userId: string) {
    return this.adminService.getUserProjects(userId);
  }

  @Post('projects/:projectId/assign-staff/:staffId')
  assignStaff(
    @Param('projectId') projectId: string,
    @Param('staffId') staffId: string,
  ) {
    return this.adminService.assignStaff(projectId, staffId);
  }

  @Delete('projects/:projectId/remove-staff/:staffId')
  removeStaff(
    @Param('projectId') projectId: string,
    @Param('staffId') staffId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.adminService.removeStaff(projectId, staffId, user);
  }

  @Get('projects-management')
  getProjectsManagement() {
    return this.adminService.getProjectsManagementData();
  }

  // 🔹 All procurements
  @Get('procurements')
  getAll() {
    return this.adminService.getAllForAdmin();
  }

  // 🔹 Single procurement
  @Get('procurements/:id')
  getOne(@Param('id') id: string) {
    return this.adminService.getByIdForAdmin(id);
  }

  // 🔹 Approve
  @Patch('procurements/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() admin: client.User) {
    return this.adminService.approve(id, admin);
  }

  // 🔹 Reject
  @Patch('procurements/:id/reject')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() admin: client.User,
  ) {
    return this.adminService.reject(id, reason, admin);
  }

  // 🔹 Generate PO
  @Patch('procurements/:id/generate-po')
  generatePO(@Param('id') id: string, @CurrentUser() admin: client.User) {
    return this.adminService.generatePurchaseOrder(id, admin);
  }

  @Patch('procurements/:id/ordered')
  markOrdered(@Param('id') id: string, @CurrentUser() admin: client.User) {
    return this.adminService.markAsOrdered(id, admin);
  }

  @Patch('procurements/:id/delivered')
  markDelivered(@Param('id') id: string, @CurrentUser() admin: client.User) {
    return this.adminService.markAsDelivered(id, admin);
  }

  @Get('activity-logs')
  async getActivityLogs(
    @Query()
    query: {
      page?: number;
      limit?: number;
      entity?: string;
      actorId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.adminService.getActivityLogs(query);
  }

  @Get('invoices')
  getInvoices() {
    return this.adminService.getInvoices();
  }

  @Get('timesheets')
  getTimesheets(
    @Query()
    query: {
      staffId?: string;
      projectId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.adminService.getTimesheets(query);
  }

  @Patch('timesheets/:id/approve')
  approveTimesheet(
    @Param('id') id: string,
    @CurrentUser() admin: client.User,
  ) {
    return this.adminService.approveTimesheet(id, admin);
  }

  @Patch('timesheets/:id/reject')
  rejectTimesheet(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() admin: client.User,
  ) {
    return this.adminService.rejectTimesheet(id, reason, admin);
  }

  @Patch('invoices/:id/approve')
  approveInvoice(@Param('id') id: string, @CurrentUser() admin: client.User) {
    return this.adminService.approveInvoice(id, admin);
  }

  @Patch('invoices/:id/reject')
  rejectInvoice(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() admin: client.User,
  ) {
    return this.adminService.rejectInvoice(id, reason, admin);
  }

  @Patch('invoices/:id/confirm-payment')
  confirmInvoicePayment(
    @Param('id') id: string,
    @CurrentUser() admin: client.User,
  ) {
    return this.adminService.confirmInvoicePayment(id, admin);
  }

  @Post('invoices')
  createInvoice(
    @CurrentUser() admin: client.User,
    @Body()
    body: {
      projectId: string;
      dueDate: string;
      lineItems: Array<{ description: string; quantity: number; rate: number }>;
      tax?: number;
      notes?: string;
    },
  ) {
    return this.adminService.createInvoice(admin.id, body, admin);
  }

  @Get('invoices/:id/pdf')
  async downloadInvoice(
    @Param('id') id: string,
    @CurrentUser() admin: client.User,
    @Res() res: Response,
  ) {
    const file = await this.adminService.getInvoiceFile(id, admin);
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
    @CurrentUser() admin: client.User,
    @Res() res: Response,
  ) {
    const file = await this.adminService.getReceiptFile(id, admin);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${file.filename}`,
    );
    res.send(file.content);
  }
}
