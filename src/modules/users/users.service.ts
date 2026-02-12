import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createUser(data: {
    name: string;
    email: string;
    password: string;
    role?: Role;
    companyName?: string;
    department?: string;
    address?: string;
    phone?: string;
  }) {
    return this.prisma.user.create({ data });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async getStaffUsers() {
    return this.prisma.user.findMany({
      where: {
        role: Role.STAFF,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async getClientUsers() {
    return this.prisma.user.findMany({
      where: {
        role: Role.CLIENT,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async getCurrentUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id: id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        companyName: true,
        department: true,
        address: true,
        phone: true,
      },
    });
  }
}
