import { IsUUID } from 'class-validator';

export class AssignStaffDto {
  @IsUUID()
  staffId: string;
}
