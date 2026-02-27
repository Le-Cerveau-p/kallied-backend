import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import * as client from '@prisma/client';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: client.User) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Get()
  getMine(@CurrentUser() user: client.User, @Query('limit') limit?: string) {
    const parsedLimit = Number(limit ?? 20);
    return this.notificationsService.getForUser(user.id, Number.isNaN(parsedLimit) ? 20 : parsedLimit);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: client.User) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: client.User, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }
}
