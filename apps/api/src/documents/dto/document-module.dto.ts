import { IsUUID } from 'class-validator';

export class DocumentModuleDto {
  @IsUUID()
  moduleId!: string;
}
