// projects/dto/create-project.dto.ts
import { IsString, IsOptional, IsUUID, IsDate, IsEnum } from 'class-validator';
import { ProjectCategory } from '@prisma/client';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  clientId: string; // REQUIRED

  @IsEnum(ProjectCategory)
  category: ProjectCategory;

  @IsDate()
  eCD: Date;
}
