import { IsUUID } from 'class-validator';

export class DocumentModuleDto {
  @IsUUID('4')
  moduleId!: string;
}
