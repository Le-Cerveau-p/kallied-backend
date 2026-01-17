// projects/dto/create-project.dto.ts
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  clientId: string; // REQUIRED
}
