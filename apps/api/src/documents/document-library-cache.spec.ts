import {
  DocumentLibraryCache,
  documentLibraryCacheKey,
} from './document-library-cache';
import type { DocumentLibraryPage } from './domain/document';

function page(total: number): DocumentLibraryPage {
  return { items: [], limit: 3, offset: 0, total };
}

function keyInput(overrides: { actorId?: string; moduleId?: string } = {}) {
  return {
    actorId: 'actor-a',
    limit: 3,
    offset: 0,
    sort: 'newest',
    ...overrides,
  };
}

describe('DocumentLibraryCache', () => {
  it('serves the stored page until it expires', () => {
    let now = 0;
    const cache = new DocumentLibraryCache({ now: () => now, ttlMs: 1000 });
    const key = documentLibraryCacheKey(keyInput());

    cache.set(key, page(7));

    expect(cache.get(key)?.total).toBe(7);

    now = 999;
    expect(cache.get(key)?.total).toBe(7);

    now = 1000;
    expect(cache.get(key)).toBeUndefined();
  });

  it('never shares a result between actors', () => {
    const cache = new DocumentLibraryCache();
    const own = documentLibraryCacheKey(keyInput());
    const other = documentLibraryCacheKey(keyInput({ actorId: 'actor-b' }));

    cache.set(own, page(4));

    expect(own).not.toBe(other);
    expect(cache.get(other)).toBeUndefined();
  });

  it('keeps every filter in the key', () => {
    const base = documentLibraryCacheKey(keyInput());
    const otherModule = documentLibraryCacheKey(
      keyInput({ moduleId: 'module-2' }),
    );

    expect(base).not.toBe(otherModule);
  });

  it('drops the oldest entry when it reaches its limit', () => {
    const cache = new DocumentLibraryCache({ maxEntries: 2 });
    const first = documentLibraryCacheKey(keyInput({ moduleId: 'm1' }));
    const second = documentLibraryCacheKey(keyInput({ moduleId: 'm2' }));
    const third = documentLibraryCacheKey(keyInput({ moduleId: 'm3' }));

    cache.set(first, page(1));
    cache.set(second, page(2));
    cache.get(first);
    cache.set(third, page(3));

    expect(cache.size).toBe(2);
    expect(cache.get(second)).toBeUndefined();
    expect(cache.get(first)?.total).toBe(1);
    expect(cache.get(third)?.total).toBe(3);
  });

  it('forgets everything when a document changes', () => {
    const cache = new DocumentLibraryCache();
    const key = documentLibraryCacheKey(keyInput());

    cache.set(key, page(2));
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get(key)).toBeUndefined();
  });
});
