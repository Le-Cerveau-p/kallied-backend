/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Controller, Post, get, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() body: any) {
    return this.auth.register(body);
  }

  @Post('login')
  login(@Body() body: any) {
    return this.auth.login(body.email, body.password);
  }

  @gett('pip')
  pip() {
    return this.auth.pip();
  }
}
