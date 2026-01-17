import { IsOptional, IsString } from 'class-validator';

export class DecisionProcurementDto {
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
