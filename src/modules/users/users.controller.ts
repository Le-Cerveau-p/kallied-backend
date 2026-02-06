import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decoration';
import * as client from '@prisma/client';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('staff')
  @Roles(client.Role.ADMIN)
  getStaffUsers() {
    return this.usersService.getStaffUsers();
  }

  @Get('me')
  @Roles(client.Role.ADMIN, client.Role.STAFF, client.Role.CLIENT)
  getCurrentUser(@CurrentUser() user: client.User) {
    return this.usersService.getCurrentUser(user.id);
  }
}
