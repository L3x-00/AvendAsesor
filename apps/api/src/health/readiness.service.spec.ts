import { ServiceUnavailableException } from '@nestjs/common';
import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  it('confirms readiness only after Supabase accepts the server credential', async () => {
    const listUsers = jest.fn().mockResolvedValue({ error: null });
    const service = new ReadinessService({
      auth: { admin: { listUsers } },
    } as never);

    await expect(service.getStatus()).resolves.toEqual({
      service: 'avend-asesor-api',
      status: 'ready',
    });
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 1 });
  });

  it('fails closed when the server client is unavailable', async () => {
    const service = new ReadinessService(null);

    await expect(service.getStatus()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed when Supabase rejects the server credential', async () => {
    const service = new ReadinessService({
      auth: {
        admin: {
          listUsers: jest
            .fn()
            .mockResolvedValue({ error: new Error('denied') }),
        },
      },
    } as never);

    await expect(service.getStatus()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fails closed when Supabase throws a transport error', async () => {
    const service = new ReadinessService({
      auth: {
        admin: {
          listUsers: jest.fn().mockRejectedValue(new Error('network failure')),
        },
      },
    } as never);

    await expect(service.getStatus()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
