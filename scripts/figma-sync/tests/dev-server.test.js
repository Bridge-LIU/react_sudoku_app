import { describe, it, expect } from 'vitest';
import net from 'node:net';
import { waitForPort } from '../scripts/lib/dev-server.js';

describe('waitForPort', () => {
  it('resolves when port is available', async () => {
    const server = net.createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    try {
      await waitForPort(port, '127.0.0.1', 2000);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('rejects when port never opens', async () => {
    await expect(waitForPort(9, '127.0.0.1', 500)).rejects.toThrow(/not ready/);
  });
});
