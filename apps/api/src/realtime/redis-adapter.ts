// With Redis, Socket.IO events reach users connected to any API instance (TechSpec 1: Redis adapter).
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterFactory: ReturnType<typeof createAdapter> | null = null;

  /** False when Redis is not reachable; the default in-process adapter is then kept. */
  async connect(url: string): Promise<boolean> {
    const pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
    pub.on('error', () => {});
    try {
      await pub.connect();
      await pub.ping();
    } catch {
      pub.disconnect();
      return false;
    }
    const sub = pub.duplicate();
    this.adapterFactory = createAdapter(pub, sub);
    return true;
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterFactory) server.adapter(this.adapterFactory);
    return server;
  }
}
