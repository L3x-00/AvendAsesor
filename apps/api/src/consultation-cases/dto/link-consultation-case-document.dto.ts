import { IsUUID } from 'class-validator';

export class LinkConsultationCaseDocumentDto {
  @IsUUID()
  documentId!: string;
}
