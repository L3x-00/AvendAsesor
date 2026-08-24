import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';

export class ReviewFaqMemoryCandidateDto {
  @IsIn(['approved', 'rejected', 'suppressed'])
  decision!: 'approved' | 'rejected' | 'suppressed';

  @IsOptional()
  @IsString()
  @Length(1, 2_000)
  @trimText
  reviewNote?: string;

  @IsOptional()
  @IsString()
  @Length(4, 200)
  @trimText
  reviewLabel?: string;
}
