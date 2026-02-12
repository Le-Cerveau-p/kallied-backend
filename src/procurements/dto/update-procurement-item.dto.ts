import { IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ProcurementItemType } from '@prisma/client';

export class UpdateProcurementItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsPositive()
  estimatedCost?: number;

  @IsOptional()
  @IsEnum(ProcurementItemType)
  type?: ProcurementItemType;
}
