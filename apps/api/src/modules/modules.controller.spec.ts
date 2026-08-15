import { ModulesController } from './modules.controller';
import type { ManagedModule } from './domain/module';
import type { ModulesService } from './modules.service';
import type { AuthorizationContext } from '../authorization';

const authorization: AuthorizationContext = {
  email: 'admin@example.com',
  emailConfirmedAt: '2026-08-09T00:00:00.000Z',
  role: 'admin',
  userId: '4c8b56af-6d0c-4fef-881e-7c00907540dd',
};

const moduleRecord: ManagedModule = {
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
};

describe('ModulesController', () => {
  const modulesService = {
    create: jest.fn(),
    findOne: jest.fn(),
    list: jest.fn(),
    logicalDelete: jest.fn(),
    setStatus: jest.fn(),
    update: jest.fn(),
  };
  const controller = new ModulesController(
    modulesService as unknown as ModulesService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delegates create, list and retrieval to the module service', async () => {
    modulesService.create.mockResolvedValue(moduleRecord);
    modulesService.list.mockResolvedValue([moduleRecord]);
    modulesService.findOne.mockResolvedValue(moduleRecord);

    await expect(
      controller.create({ code: 'MODULE_TEST', name: 'Módulo' }, authorization),
    ).resolves.toEqual(moduleRecord);
    await expect(controller.list({ status: 'active' })).resolves.toEqual([
      moduleRecord,
    ]);
    await expect(controller.findOne(moduleRecord.id)).resolves.toEqual(
      moduleRecord,
    );
  });

  it('delegates lifecycle, position, update and logical deletion', async () => {
    modulesService.setStatus.mockResolvedValue(moduleRecord);
    modulesService.update.mockResolvedValue(moduleRecord);
    modulesService.logicalDelete.mockResolvedValue(undefined);

    await expect(
      controller.setStatus(
        moduleRecord.id,
        { isActive: false, reason: 'Actualización normativa' },
        authorization,
      ),
    ).resolves.toEqual(moduleRecord);
    await expect(
      controller.setPosition(moduleRecord.id, { sortOrder: 2 }, authorization),
    ).resolves.toEqual(moduleRecord);
    await expect(
      controller.update(
        moduleRecord.id,
        { name: 'Nombre actualizado' },
        authorization,
      ),
    ).resolves.toEqual(moduleRecord);
    await expect(
      controller.logicalDelete(
        moduleRecord.id,
        { reason: 'Retirado del catálogo' },
        authorization,
      ),
    ).resolves.toBeUndefined();
  });
});
