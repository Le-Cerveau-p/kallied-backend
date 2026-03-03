/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Controller, Post, Get, Body } from '@nestjs/common';
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

  @Post('password/otp')
  requestPasswordResetOtp(@Body() body: { email: string }) {
    return this.auth.requestPasswordResetOtp(body.email);
  }

  @Post('password/reset')
  resetPassword(
    @Body() body: { email: string; otp: string; newPassword: string },
  ) {
    return this.auth.resetPassword(body);
  }

  @Post('google')
  loginWithGoogle(@Body() body: { idToken: string }) {
    return this.auth.loginWithGoogle(body.idToken);
  }

  @Get('pip')
  pip() {
    return this.auth.pip();
  }
}
