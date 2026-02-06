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
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decoration';
import * as client from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

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
}
