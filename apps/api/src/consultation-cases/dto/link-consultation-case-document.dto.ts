import { IsUUID } from 'class-validator';

export class LinkConsultationCaseDocumentDto {
  @IsUUID('4')
  documentId!: string;
}
