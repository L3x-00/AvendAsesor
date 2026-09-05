import { IsIn } from 'class-validator';
import type { DocumentApprovalStatus } from '../document-governance.constants';

export class SetDocumentTechnicalStatusDto {
  @IsIn(['pending_approval', 'ready'])
  technicalStatus!: DocumentApprovalStatus;
}
