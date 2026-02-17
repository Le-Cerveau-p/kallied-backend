/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

@Injectable()
export class JwtWsGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext) {
    const client: Socket = context.switchToWs().getClient();
    const authToken = client.handshake.auth?.token;
    const headerValue = client.handshake.headers?.authorization;
    const headerToken =
      typeof headerValue === 'string' ? headerValue.split(' ')[1] : undefined;
    const token = authToken || headerToken;

    if (!token) return false;

    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      return true;
    } catch {
      return false;
    }
  }
}
