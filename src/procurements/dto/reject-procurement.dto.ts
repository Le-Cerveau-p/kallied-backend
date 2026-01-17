import { IsString } from 'class-validator';

export class RejectProcurementDto {
  @IsString()
  reason: string;
}
