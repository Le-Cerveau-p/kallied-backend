import { IsString, IsOptional, IsPositive } from 'class-validator';

export class CreateProcurementDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  projectId: string;

  @IsOptional()
  @IsPositive()
  cost?: number;
}
