import { describe, expect, it } from 'vitest';

import { probeStorageBuckets } from './index.js';

describe('storage readiness', () => {
  it('checks every required bucket without exposing its name in errors', async () => {
    const bucketExists = async (bucket: string) => bucket !== 'raho-exports';
    await expect(
      probeStorageBuckets({ bucketExists } as never, {
        quarantine: 'raho-quarantine',
        knowledge: 'raho-knowledge',
        exports: 'raho-exports'
      })
    ).rejects.toThrow('Required bucket is unavailable');
  });
});
