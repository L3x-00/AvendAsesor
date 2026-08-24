import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListFaqMemoryCandidatesQueryDto } from './list-faq-memory-candidates-query.dto';

describe('ListFaqMemoryCandidatesQueryDto', () => {
  it('coerces a bounded query limit before validation', async () => {
    const valid = plainToInstance(ListFaqMemoryCandidatesQueryDto, {
      limit: '100',
      status: 'pending_review',
    });
    const invalid = plainToInstance(ListFaqMemoryCandidatesQueryDto, {
      limit: '101',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.not.toHaveLength(0);
    expect(valid).toMatchObject({ limit: 100, status: 'pending_review' });
  });
});
