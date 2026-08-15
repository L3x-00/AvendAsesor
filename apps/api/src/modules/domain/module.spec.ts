import { toManagedModule } from './module';

const row = {
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

describe('toManagedModule', () => {
  it('maps a valid database row to the API domain', () => {
    expect(toManagedModule(row)).toMatchObject({
      code: 'MODULE_TEST',
      createdAt: row.created_at,
      metadata: { scope: 'local' },
      parentModuleId: null,
    });
  });

  it('rejects malformed database rows before they cross the API boundary', () => {
    expect(() => toManagedModule({ ...row, code: 'invalid code' })).toThrow(
      'Module data returned by the store is invalid.',
    );
  });
});
