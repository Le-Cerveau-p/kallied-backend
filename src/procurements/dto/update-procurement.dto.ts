import { IsOptional, IsString } from 'class-validator';

export class UpdateProcurementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
