import { IsString, IsOptional } from 'class-validator';

export class CreateProcurementDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  projectId: string;
}
