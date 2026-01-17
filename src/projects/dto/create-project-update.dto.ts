import { IsString, IsInt, Min, Max, IsOptional } from 'class-validator';

export class CreateProjectUpdateDto {
  @IsOptional()
  @IsString()
  note: string;

  @IsInt()
  @Min(0)
  @Max(100)
  progress: number;
}
