import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CompanyProfileInput {
  name?: string;
  department?: string;
  address?: string;
  email?: string;
  phone?: string;
  mapLabel?: string;
  mapAddress?: string;
  mapUrl?: string;
  mapEmbedUrl?: string;
  mapLat?: number;
  mapLng?: number;
}

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  private getDefaults() {
    return {
      name: process.env.COMPANY_NAME ?? 'Your Company Name',
      department: process.env.COMPANY_DEPARTMENT ?? 'Professional Services',
      address: process.env.COMPANY_ADDRESS ?? '123 Business Street, Suite 100',
      email: process.env.COMPANY_EMAIL ?? 'billing@yourcompany.com',
      phone: process.env.COMPANY_PHONE ?? '(555) 123-4567',
      mapLabel: process.env.COMPANY_MAP_LABEL ?? 'Our Location',
      mapAddress:
        process.env.COMPANY_MAP_ADDRESS ??
        'Abuja, Federal Capital Territory Nigeria',
      mapUrl: process.env.COMPANY_MAP_URL ?? 'https://maps.google.com',
      mapEmbedUrl: process.env.COMPANY_MAP_EMBED_URL ?? null,
      mapLat: process.env.COMPANY_MAP_LAT
        ? Number(process.env.COMPANY_MAP_LAT)
        : null,
      mapLng: process.env.COMPANY_MAP_LNG
        ? Number(process.env.COMPANY_MAP_LNG)
        : null,
    };
  }

  async getProfile() {
    const defaults = this.getDefaults();
    const profile = await this.prisma.companyProfile.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        name: defaults.name,
        department: defaults.department,
        address: defaults.address,
        email: defaults.email,
        phone: defaults.phone,
        mapLabel: defaults.mapLabel,
        mapAddress: defaults.mapAddress,
        mapUrl: defaults.mapUrl,
        mapEmbedUrl: defaults.mapEmbedUrl ?? undefined,
        mapLat: defaults.mapLat ?? undefined,
        mapLng: defaults.mapLng ?? undefined,
      },
    });

    return {
      ...defaults,
      ...profile,
    };
  }

  async updateProfile(data: CompanyProfileInput) {
    return this.prisma.companyProfile.upsert({
      where: { id: 'default' },
      update: {
        ...data,
      },
      create: {
        id: 'default',
        name: data.name ?? this.getDefaults().name,
        department: data.department ?? this.getDefaults().department,
        address: data.address ?? this.getDefaults().address,
        email: data.email ?? this.getDefaults().email,
        phone: data.phone ?? this.getDefaults().phone,
        mapLabel: data.mapLabel ?? this.getDefaults().mapLabel,
        mapAddress: data.mapAddress ?? this.getDefaults().mapAddress,
        mapUrl: data.mapUrl ?? this.getDefaults().mapUrl,
        mapEmbedUrl: data.mapEmbedUrl ?? this.getDefaults().mapEmbedUrl ?? undefined,
        mapLat:
          data.mapLat ??
          (this.getDefaults().mapLat ?? undefined),
        mapLng:
          data.mapLng ??
          (this.getDefaults().mapLng ?? undefined),
      },
    });
  }
}
