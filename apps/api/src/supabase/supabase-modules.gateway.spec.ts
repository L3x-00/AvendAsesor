import {
  ConflictException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseModulesGatewayAdapter } from './supabase-modules.gateway';
import type { SupabaseServerClient } from './supabase.server-client';

const moduleRow = {
  code: 'MODULE_TEST',
  created_at: '2026-08-09T00:00:00+00:00',
  created_by: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
  deactivated_at: null,
  deactivated_by: null,
  deactivation_reason: null,
  deleted_at: null,
  deleted_by: null,
  deletion_reason: null,
  description: null,
  id: '30db913a-7c14-4eaa-872c-fa4eaf6e68b2',
  is_active: true,
  is_deleted: false,
  metadata: { scope: 'local' },
  name: 'Módulo de prueba',
  parent_module_id: null,
  sort_order: 0,
  updated_at: '2026-08-09T00:00:00+00:00',
  updated_by: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

function postgrestError(code: string) {
  return { code, details: '', hint: '', message: 'database error' };
}

function createBuilder(result: {
  count?: number | null;
  data?: unknown;
  error?: unknown;
}) {
  const builder = {
    count: result.count ?? null,
    data: result.data ?? null,
    error: result.error ?? null,
    eq: jest.fn(),
    insert: jest.fn(),
    maybeSingle: jest.fn(),
    order: jest.fn(),
    select: jest.fn(),
    single: jest.fn(),
    update: jest.fn(),
  };

  builder.eq.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.single.mockImplementation(() =>
    Promise.resolve({ data: builder.data, error: builder.error }),
  );
  builder.maybeSingle.mockImplementation(() =>
    Promise.resolve({ data: builder.data, error: builder.error }),
  );

  return builder;
}

function createClient(builder: ReturnType<typeof createBuilder>) {
  const from = jest.fn().mockReturnValue(builder);

  return {
    client: { from } as unknown as SupabaseServerClient,
    from,
  };
}

describe('SupabaseModulesGatewayAdapter', () => {
  it('fails closed when the server-only client is unavailable', async () => {
    const gateway = new SupabaseModulesGatewayAdapter(null);

    await expect(gateway.findById(moduleRow.id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('creates and maps a module through the server client', async () => {
    const builder = createBuilder({ data: moduleRow });
    const { client, from } = createClient(builder);
    const gateway = new SupabaseModulesGatewayAdapter(client);

    await expect(
      gateway.create({
        code: 'MODULE_TEST',
        createdBy: moduleRow.created_by,
        metadata: { scope: 'local' },
        name: 'Módulo de prueba',
        updatedBy: moduleRow.updated_by,
      }),
    ).resolves.toMatchObject({
      id: moduleRow.id,
      metadata: { scope: 'local' },
    });

    expect(from.mock.calls).toEqual([['modules']]);
    expect(builder.insert.mock.calls).toEqual([
      [
        expect.objectContaining({
          code: 'MODULE_TEST',
          created_by: moduleRow.created_by,
          parent_module_id: null,
          updated_by: moduleRow.updated_by,
        }),
      ],
    ]);
  });

  it.each(['23505', '23503', 'P0001'])(
    'maps a known database error %s to a safe conflict',
    async (code) => {
      const builder = createBuilder({ error: postgrestError(code) });
      const { client } = createClient(builder);
      const gateway = new SupabaseModulesGatewayAdapter(client);

      await expect(
        gateway.create({
          code: 'MODULE_TEST',
          createdBy: moduleRow.created_by,
          name: 'Módulo de prueba',
          updatedBy: moduleRow.updated_by,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );

  it('maps an unexpected database error without exposing its details', async () => {
    const builder = createBuilder({ error: postgrestError('XX000') });
    const { client } = createClient(builder);
    const gateway = new SupabaseModulesGatewayAdapter(client);

    await expect(gateway.findById(moduleRow.id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('finds, ignores an absent module and rejects malformed stored data', async () => {
    const builder = createBuilder({ data: moduleRow });
    const { client } = createClient(builder);
    const gateway = new SupabaseModulesGatewayAdapter(client);

    await expect(gateway.findById(moduleRow.id)).resolves.toMatchObject({
      id: moduleRow.id,
    });

    builder.data = null;
    await expect(gateway.findById(moduleRow.id)).resolves.toBeNull();

    builder.data = { ...moduleRow, code: 'invalid code' };
    await expect(gateway.findById(moduleRow.id)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('counts live children and lists deterministic filtered modules', async () => {
    const builder = createBuilder({ count: 1, data: [moduleRow] });
    const { client } = createClient(builder);
    const gateway = new SupabaseModulesGatewayAdapter(client);

    await expect(gateway.hasNonDeletedChildren(moduleRow.id)).resolves.toBe(
      true,
    );

    builder.count = 0;
    await expect(gateway.hasNonDeletedChildren(moduleRow.id)).resolves.toBe(
      false,
    );
    await expect(
      gateway.list({ parentModuleId: moduleRow.id, status: 'active' }),
    ).resolves.toHaveLength(1);

    expect(builder.eq.mock.calls).toEqual(
      expect.arrayContaining([
        ['is_deleted', false],
        ['parent_module_id', moduleRow.id],
        ['is_active', true],
      ]),
    );
    expect(builder.order.mock.calls).toHaveLength(3);
  });

  it('updates a module, returns null for a missing row and maps malformed data', async () => {
    const builder = createBuilder({ data: moduleRow });
    const { client } = createClient(builder);
    const gateway = new SupabaseModulesGatewayAdapter(client);

    await expect(
      gateway.update(moduleRow.id, {
        isActive: false,
        updatedBy: moduleRow.updated_by,
      }),
    ).resolves.toMatchObject({ id: moduleRow.id });

    builder.data = null;
    await expect(
      gateway.update(moduleRow.id, { updatedBy: moduleRow.updated_by }),
    ).resolves.toBeNull();

    builder.data = { ...moduleRow, sort_order: -1 };
    await expect(
      gateway.update(moduleRow.id, { updatedBy: moduleRow.updated_by }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
