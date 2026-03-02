import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import { sendOtpEmail } from '../utils/mailer';

@Injectable()
export class AuthService {
  private readonly otpTtlMinutes = 10;
  private readonly resetPurpose = 'PASSWORD_RESET';

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async pip() {
    const password = await bcrypt.hash('Password123!', 10);

    await this.prisma.user.upsert({
      where: { email: 'admin@kallied.com' },
      update: {},
      create: {
        name: 'System Admin',
        email: 'admin@kallied.com',
        password,
        role: Role.ADMIN,
      },
    });

    await this.prisma.user.upsert({
      where: { email: 'staff@kallied.com' },
      update: {},
      create: {
        name: 'Staff Member',
        email: 'staff@kallied.com',
        password,
        role: Role.STAFF,
      },
    });

    await this.prisma.user.upsert({
      where: { email: 'client@kallied.com' },
      update: {},
      create: {
        name: 'Test Client',
        email: 'client@kallied.com',
        password,
        role: Role.CLIENT,
      },
    });

    console.log('✅ Admin & Staff seeded');
  }

  async register(data: {
    name: string;
    email: string;
    password: string;
    companyName?: string;
    department?: string;
    address?: string;
    phone?: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const hashed = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashed,
        role: Role.CLIENT,
        companyName: data.companyName,
        department: data.department,
        address: data.address,
        phone: data.phone,
      },
    });

    return {
      message: 'User created successfully',
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new BadRequestException('Invalid credentials');
    }
    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenException('Account is disabled');
    }

    const expiresIn = 60 * 240;

    const access_token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      access_token,
      expiresIn,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async requestPasswordResetOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new BadRequestException('Email not found');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + this.otpTtlMinutes * 60 * 1000);

    await this.prisma.otpToken.updateMany({
      where: {
        userId: user.id,
        purpose: this.resetPurpose,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpToken.create({
      data: {
        userId: user.id,
        purpose: this.resetPurpose,
        otpHash,
        expiresAt,
      },
    });

    await sendOtpEmail({
      otp,
      purpose: this.resetPurpose,
      expiresAt,
      requestedBy: normalizedEmail,
      to: normalizedEmail,
    });

    return { message: 'OTP sent' };
  }

  async resetPassword(data: { email: string; otp: string; newPassword: string }) {
    const email = data.email.trim().toLowerCase();
    const otp = data.otp.trim();
    const newPassword = data.newPassword.trim();

    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Email not found');
    }

    const token = await this.prisma.otpToken.findFirst({
      where: {
        userId: user.id,
        purpose: this.resetPurpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw new BadRequestException('OTP not found or expired');
    }

    const valid = await bcrypt.compare(otp, token.otpHash);
    if (!valid) {
      throw new BadRequestException('Invalid OTP');
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, authInvalidatedAt: new Date() },
    });

    await this.prisma.otpToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });

    return { message: 'Password reset successful' };
  }
}
