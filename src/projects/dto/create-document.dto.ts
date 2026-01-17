import { IsString, IsEnum } from 'class-validator';
import { DocumentCategory } from '@prisma/client';

export class CreateDocumentDto {
  @IsString()
  name: string;

  @IsEnum(DocumentCategory)
  category: DocumentCategory; // REPORT, CONTRACT, etc

  @IsString()
  groupName: string;
}
