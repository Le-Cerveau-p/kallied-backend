/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Delete,
  Patch,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decoration';
import { CreateProjectDto } from './dto/create-project.dto';
import { AssignStaffDto } from './dto/assign-staff.dto';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { CreateDocumentDto } from './dto/create-document.dto';
import express from 'express';

@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @Roles(client.Role.STAFF, client.Role.ADMIN)
  createProject(
    @Body() body: CreateProjectDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectsService.createProject(body, user);
  }

  @Get()
  getProjects(@CurrentUser() user: client.User) {
    return this.projectsService.getProjectsForUser(user);
  }

  @Post(':id/assign-staff')
  @Roles(client.Role.ADMIN)
  assignStaff(@Param('id') projectId: string, @Body() body: AssignStaffDto) {
    return this.projectsService.assignStaff(projectId, body.staffId);
  }

  @Delete(':id/remove-staff/:staffId')
  removeStaff(
    @Param('id') projectId: string,
    @Param('staffId') staffId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectsService.removeStaffFromProject(
      projectId,
      staffId,
      user,
    );
  }

  @Patch(':id/status')
  @Roles(client.Role.STAFF, client.Role.ADMIN)
  updateStatus(
    @Param('id') projectId: string,
    @Body() body: UpdateProjectStatusDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectsService.updateProjectStatus(
      projectId,
      body.status,
      user,
    );
  }
  @Patch(':id/request-start')
  @Roles(client.Role.STAFF)
  requestStart(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectsService.requestStart(id, user);
  }

  // ADMIN approval to start project
  @Patch(':id/approve')
  @Roles(client.Role.ADMIN)
  approveProject(
    @Param('id') projectId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectsService.approveProject(projectId, user);
  }

  // ADMIN completes project
  @Patch(':id/complete')
  @Roles(client.Role.ADMIN)
  completeProject(
    @Param('id') projectId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectsService.completeProject(projectId, user);
  }

  @Post(':id/updates')
  @Roles(client.Role.STAFF)
  addUpdate(
    @Param('id') projectId: string,
    @Body() dto: CreateProjectUpdateDto,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.addUpdate(projectId, dto, user);
  }

  @Post(':id/documents')
  @Roles(client.Role.STAFF, client.Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.uploadDocument(projectId, dto, file, user);
  }

  @Get(':id/documents')
  getProjectDocuments(@Param('id') id: string, @CurrentUser() user: any) {
    return this.projectsService.getProjectDocuments(id, user);
  }

  @Get('documents/:id/download')
  async download(
    @Param('id') id: string,
    @Res() res: express.Response,
    @CurrentUser() user: any,
  ) {
    const doc = await this.projectsService.downloadDocument(id, user);
    return res.sendFile(doc.fileUrl, { root: '.' });
  }
}
