import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // GET /chat/threads/:projectId
  @Get('threads/:projectId')
  getThreads(@Param('projectId') projectId: string, @CurrentUser() user: User) {
    return this.chatService.getThreads(projectId, user);
  }

  // GET /chat/threads/:id/messages
  @Get('threads/:id/messages')
  getMessages(@Param('id') threadId: string, @CurrentUser() user: User) {
    return this.chatService.getMessages(threadId, user);
  }

  // POST /chat/threads/:id/message
  @Post('threads/:id/message')
  @UseInterceptors(FilesInterceptor('files'))
  sendMessage(
    @Param('id') threadId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: SendMessageDto,
    @CurrentUser() user: User,
  ) {
    // 🔹 Text-only message
    if (!files || files.length === 0) {
      return this.chatService.createMessage(
        {
          threadId,
          type: 'TEXT',
          content: dto.content,
        },
        user.id,
      );
    }

    // 🔹 File/Image message
    const file = files[0];

    const isImage = file.mimetype.startsWith('image/');

    return this.chatService.createMessage(
      {
        threadId,
        type: isImage ? 'IMAGE' : 'FILE',
        content: dto.content,
        file: {
          name: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
        },
      },
      user.id,
    );
  }

  // POST /chat/messages/:id/read
  @Post('messages/:id/read')
  markRead(@Param('id') messageId: string, @CurrentUser() user: User) {
    return this.chatService.markRead(messageId, user.id);
  }

  // GET /chat/threads/:id/unread-count
  @Get('threads/:id/unread-count')
  unreadCount(@Param('id') threadId: string, @CurrentUser() user: User) {
    return this.chatService.getUnreadCount(threadId, user.id);
  }

  // POST /chat/threads/adminJoin/:threadId/
  @Post('threads/adminjoin/:id/')
  adminJoin(@Param('id') threadId: string, @CurrentUser() user: User) {
    return this.chatService.adminJoin(threadId, user);
  }

  // POST /chat/threads/adminLeave/:threadId/
  @Post('threads/adminleave/:id/')
  adminLeave(@Param('id') threadId: string, @CurrentUser() user: User) {
    return this.chatService.adminLeave(threadId, user);
  }
}
