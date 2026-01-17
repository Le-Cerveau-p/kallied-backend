import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { ProcurementModule } from './procurements/procurement.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key',
      signOptions: { expiresIn: '1d' },
    }),

    AuthModule,
    UsersModule,
    ProjectsModule,
    ProcurementModule,
  ],
})
export class AppModule {}
