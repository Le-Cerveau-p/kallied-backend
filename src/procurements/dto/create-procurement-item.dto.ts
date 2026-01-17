import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ProcurementItemType } from '@prisma/client';

export class CreateProcurementItemDto {
  @IsString()
  name: string;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsString()
  unit: string;

  @IsOptional()
  @IsPositive()
  estimatedCost?: number;

  @IsEnum(ProcurementItemType)
  type: ProcurementItemType;
}
