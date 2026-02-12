// projects/dto/create-project.dto.ts
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  IsDate,
} from 'class-validator';
import { ProjectCategory } from '@prisma/client';
import { Type } from 'class-transformer';

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

  @Type(() => Date)
  @IsDate()
  eCD: Date; //leave as Date

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;
}
