/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatus } from '@prisma/client';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          authInvalidatedAt: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid token user');
      }
      if (user.status === UserStatus.DISABLED) {
        throw new UnauthorizedException('Account is disabled');
      }
      if (user.authInvalidatedAt && payload.iat) {
        const issuedAt = new Date(payload.iat * 1000);
        if (issuedAt < user.authInvalidatedAt) {
          throw new UnauthorizedException('Token is no longer valid');
        }
      }

      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      }; // 🔥 THIS is what RolesGuard relies on
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
