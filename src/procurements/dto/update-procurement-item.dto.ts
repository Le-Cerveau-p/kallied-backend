import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

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
}
