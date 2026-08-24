import { IsIn, IsString, Length } from 'class-validator';
import { trimText } from '../../modules/dto/module.dto-helpers';
import type {
  UnansweredQuestionCategory,
  UnansweredQuestionStatus,
} from '../unanswered-questions.gateway';

export class ReviewUnansweredQuestionDto {
  @IsIn([
    'documentation_gap',
    'module_configuration',
    'outside_scope',
    'duplicate',
    'other',
  ])
  category!: UnansweredQuestionCategory;

  @IsIn(['resolved', 'dismissed'])
  decision!: Exclude<UnansweredQuestionStatus, 'pending_review'>;

  @IsString()
  @Length(4, 2_000)
  @trimText
  reviewNote!: string;
}
