/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProcurementService } from './procurement.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decoration';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateProcurementDto } from './dto/create-procurement.dto';
import { UpdateProcurementDto } from './dto/update-procurement.dto';
import { DecisionProcurementDto } from './dto/decision-procurement.dto';
import { UpdateProcurementItemDto } from './dto/update-procurement-item.dto';
import { CreateProcurementItemDto } from './dto/create-procurement-item.dto';
import * as client from '@prisma/client';
import { Res } from '@nestjs/common';
import express from 'express';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('procurement')
@UseGuards(JwtAuthGuard)
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Post()
  @Roles(client.Role.STAFF)
  create(@Body() dto: CreateProcurementDto, @CurrentUser() user) {
    return this.procurementService.create(dto, user);
  }

  @Patch(':id')
  @Roles(client.Role.STAFF, client.Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProcurementDto,
    @CurrentUser() user,
  ) {
    return this.procurementService.update(id, dto, user);
  }

  @Patch(':id/submit')
  @Roles(client.Role.STAFF)
  submit(@Param('id') id: string, @CurrentUser() user) {
    return this.procurementService.submit(id, user);
  }

  @Patch(':id/approve')
  @Roles(client.Role.ADMIN)
  approve(@Param('id') id: string, @CurrentUser() user) {
    return this.procurementService.approve(id, user);
  }

  @Patch(':id/reject')
  @Roles(client.Role.ADMIN)
  reject(
    @Param('id') id: string,
    @Body() dto: DecisionProcurementDto,
    @CurrentUser() user,
  ) {
    return this.procurementService.reject(id, dto.rejectionReason!, user);
  }

  @Post(':id/items')
  @Roles(client.Role.STAFF)
  addItem(
    @Param('id') requestId: string,
    @Body() dto: CreateProcurementItemDto,
    @CurrentUser() user: client.User,
  ) {
    return this.procurementService.addItem(requestId, dto, user);
  }

  @Patch('items/:itemId')
  @Roles(client.Role.STAFF)
  updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateProcurementItemDto,
    @CurrentUser() user: client.User,
  ) {
    return this.procurementService.updateItem(itemId, dto, user);
  }

  @Delete('items/:itemId')
  @Roles(client.Role.STAFF)
  deleteItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.procurementService.deleteItem(itemId, user);
  }

  @Get(':id/items')
  @UseGuards(JwtAuthGuard)
  getItems(@Param('id') requestId: string, @CurrentUser() user: client.User) {
    return this.procurementService.getItems(requestId, user);
  }

  @Post(':id/purchase-order')
  @Roles(client.Role.ADMIN)
  generatePO(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.procurementService.generatePurchaseOrder(id, user);
  }

  @Post('purchase-order/:id/order')
  @Roles(client.Role.ADMIN)
  markOrdered(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.procurementService.markAsOrdered(id, user);
  }

  @Post('purchase-order/:id/deliver')
  @Roles(client.Role.ADMIN)
  markDelivered(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.procurementService.markAsDelivered(id, user);
  }

  @Post(':id/documents')
  @Roles(client.Role.STAFF, client.Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('id') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.procurementService.uploadDocument(projectId, file, dto, user);
  }

  @Get(':id/documents')
  getProcurementDocuments(@Param('id') id: string) {
    return this.procurementService.getProcurementDocuments(id);
  }

  @Post('purchase-order/:id/documents')
  @Roles(client.Role.STAFF, client.Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadPurchaseOrderDocument(
    @Param('id') poId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.procurementService.uploadPurchaseOrderDocument(
      poId,
      file,
      dto,
      user,
    );
  }

  @Get('purchase-order/:id/documents')
  getPurchaseOrderDocuments(@Param('id') id: string) {
    return this.procurementService.getProcurementDocuments(id);
  }

  @Get('documents/:id/download')
  async download(@Param('id') id: string, @Res() res: express.Response) {
    const doc = await this.procurementService.getDocumentById(id);
    return res.sendFile(doc.fileUrl, { root: '.' });
  }
}
