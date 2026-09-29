import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListConsultationCasesQueryDto } from './list-consultation-cases-query.dto';
import { ResolveConsultationGroupDto } from './resolve-consultation-group.dto';

describe('periodos de la bandeja de consultas', () => {
  it.each(['last_6h', 'last_24h', 'last_7d', 'last_30d'])(
    'acepta %s en el listado y en el cierre de grupo',
    (period) => {
      const listing = plainToInstance(ListConsultationCasesQueryDto, {
        period,
      });
      const closing = plainToInstance(ResolveConsultationGroupDto, {
        caseIds: ['00000000-0000-4000-8000-000000000001'],
        note: 'Documento incorporado',
        period,
        status: 'resolved',
      });
      expect(validateSync(listing)).toEqual([]);
      expect(validateSync(closing)).toEqual([]);
    },
  );
});
