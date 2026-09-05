import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ModulesService } from './modules.service';
import type { ManagedModule } from './domain/module';
import type {
  CreateModuleRecord,
  ListModulesOptions,
  ModulesGateway,
  UpdateModuleRecord,
} from './modules.gateway';
import type { AuthorizationContext } from '../authorization';

const authorization: AuthorizationContext = {
  email: 'admin@example.com',
  emailConfirmedAt: '2026-08-09T00:00:00.000Z',
  role: 'admin',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

function createModule(overrides: Partial<ManagedModule> = {}): ManagedModule {
  return {
    code: 'MODULE_TEST',
    createdAt: '2026-08-09T00:00:00.000Z',
    createdBy: authorization.userId,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    description: null,
    id: '30db913a-7c14-4eaa-872c-fa4eaf6e68b2',
    isActive: true,
    isDeleted: false,
    metadata: {},
    name: 'Módulo de prueba',
    parentModuleId: null,
    sortOrder: 0,
    updatedAt: '2026-08-09T00:00:00.000Z',
    updatedBy: authorization.userId,
    ...overrides,
  };
}

function createGateway(): jest.Mocked<ModulesGateway> {
  return {
    create: jest.fn<Promise<ManagedModule>, [CreateModuleRecord]>(),
    findById: jest.fn<Promise<ManagedModule | null>, [string]>(),
    hasNonDeletedChildren: jest.fn<Promise<boolean>, [string]>(),
    list: jest.fn<Promise<ManagedModule[]>, [ListModulesOptions]>(),
    listSummaries: jest.fn(),
    update: jest.fn<
      Promise<ManagedModule | null>,
      [string, UpdateModuleRecord]
    >(),
  };
}

describe('ModulesService', () => {
  let gateway: jest.Mocked<ModulesGateway>;
  let service: ModulesService;

  beforeEach(() => {
    gateway = createGateway();
    service = new ModulesService(gateway);
  });

  it('creates a root module with the authenticated actor', async () => {
    const module = createModule();
    gateway.create.mockResolvedValue(module);

    await expect(
      service.create(
        { code: 'module_test', metadata: { source: 'api' }, name: 'Módulo' },
        authorization,
      ),
    ).resolves.toEqual(module);

    expect(gateway.create.mock.calls).toEqual([
      [
        {
          code: 'module_test',
          createdBy: authorization.userId,
          description: undefined,
          metadata: { source: 'api' },
          name: 'Módulo',
          parentModuleId: undefined,
          sortOrder: undefined,
          updatedBy: authorization.userId,
        },
      ],
    ]);
  });

  it('rejects creation under a missing or deleted parent', async () => {
    gateway.findById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createModule({ isDeleted: true }));

    await expect(
      service.create(
        {
          code: 'CHILD_ONE',
          name: 'Hijo uno',
          parentModuleId: '4d54a9c8-7b1e-4bc2-8d7f-7e0fbce37c33',
        },
        authorization,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.create(
        {
          code: 'CHILD_TWO',
          name: 'Hijo dos',
          parentModuleId: '4d54a9c8-7b1e-4bc2-8d7f-7e0fbce37c33',
        },
        authorization,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists modules with an explicit default status', async () => {
    gateway.list.mockResolvedValue([createModule()]);

    await expect(service.list({})).resolves.toHaveLength(1);

    expect(gateway.list.mock.calls).toEqual([
      [{ parentModuleId: undefined, status: 'all' }],
    ]);
  });

  it('returns a live module and hides missing or deleted modules', async () => {
    gateway.findById
      .mockResolvedValueOnce(createModule())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createModule({ isDeleted: true }));

    await expect(service.findOne(createModule().id)).resolves.toEqual(
      createModule(),
    );
    await expect(service.findOne(createModule().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findOne(createModule().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires a reason before deactivating a live module', async () => {
    gateway.findById.mockResolvedValue(createModule());

    await expect(
      service.setStatus(createModule().id, { isActive: false }, authorization),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates lifecycle fields for deactivation and activation', async () => {
    const inactive = createModule({
      deactivatedAt: '2026-08-09T01:00:00.000Z',
      deactivatedBy: authorization.userId,
      deactivationReason: 'Actualización normativa',
      isActive: false,
    });
    gateway.findById.mockResolvedValue(createModule());
    gateway.update
      .mockResolvedValueOnce(inactive)
      .mockResolvedValueOnce(createModule());

    await expect(
      service.setStatus(
        createModule().id,
        { isActive: false, reason: 'Actualización normativa' },
        authorization,
      ),
    ).resolves.toEqual(inactive);
    expect(gateway.update.mock.calls.at(-1)).toEqual([
      createModule().id,
      expect.objectContaining({
        deactivatedBy: authorization.userId,
        deactivationReason: 'Actualización normativa',
        isActive: false,
        updatedBy: authorization.userId,
      }),
    ]);

    await expect(
      service.setStatus(createModule().id, { isActive: true }, authorization),
    ).resolves.toEqual(createModule());
    expect(gateway.update.mock.calls.at(-1)).toEqual([
      createModule().id,
      expect.objectContaining({
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
        isActive: true,
      }),
    ]);
  });

  it('turns a concurrent missing lifecycle update into not found', async () => {
    gateway.findById.mockResolvedValue(createModule());
    gateway.update.mockResolvedValue(null);

    await expect(
      service.setStatus(createModule().id, { isActive: true }, authorization),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a module and rejects no-op, self-parenting and unavailable parents', async () => {
    const module = createModule();
    gateway.findById
      .mockResolvedValueOnce(module)
      .mockResolvedValueOnce(module)
      .mockResolvedValueOnce(module)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(module)
      .mockResolvedValueOnce(createModule({ isDeleted: true }));
    gateway.update.mockResolvedValue(module);

    await expect(
      service.update(module.id, {}, authorization),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(module.id, { parentModuleId: module.id }, authorization),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update(
        module.id,
        { parentModuleId: '4d54a9c8-7b1e-4bc2-8d7f-7e0fbce37c33' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update(
        module.id,
        { parentModuleId: '4d54a9c8-7b1e-4bc2-8d7f-7e0fbce37c33' },
        authorization,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates a live module and maps a concurrent disappearance to not found', async () => {
    const module = createModule();
    gateway.findById
      .mockResolvedValueOnce(module)
      .mockResolvedValueOnce(module);
    gateway.update.mockResolvedValueOnce(module).mockResolvedValueOnce(null);

    await expect(
      service.update(module.id, { name: 'Nombre actualizado' }, authorization),
    ).resolves.toEqual(module);
    await expect(
      service.update(module.id, { name: 'Nombre actualizado' }, authorization),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('logically deletes a leaf while preserving deactivation audit fields', async () => {
    const module = createModule();
    gateway.findById.mockResolvedValue(module);
    gateway.hasNonDeletedChildren.mockResolvedValue(false);
    gateway.update.mockResolvedValue(createModule({ isDeleted: true }));

    await expect(
      service.logicalDelete(
        module.id,
        { reason: 'Retirado del catálogo' },
        authorization,
      ),
    ).resolves.toBeUndefined();

    expect(gateway.update.mock.calls).toEqual([
      [
        module.id,
        expect.objectContaining({
          deactivatedBy: authorization.userId,
          deactivationReason: 'Retirado del catálogo',
          deletedBy: authorization.userId,
          deletionReason: 'Retirado del catálogo',
          isActive: false,
          isDeleted: true,
        }),
      ],
    ]);
  });

  it('rejects logical deletion with live children or a concurrent missing row', async () => {
    const module = createModule();
    gateway.findById.mockResolvedValue(module);
    gateway.hasNonDeletedChildren
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    gateway.update.mockResolvedValue(null);

    await expect(
      service.logicalDelete(module.id, { reason: 'Retirado' }, authorization),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.logicalDelete(module.id, { reason: 'Retirado' }, authorization),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
