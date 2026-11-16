import { Injectable, OnApplicationBootstrap, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { API_PREFIX } from '@opshub/shared';
import { ACCESS_KEY, type AccessRule } from '../auth/access.decorators';

export interface RouteInfo {
  method: string;
  path: string;
  access: AccessRule | undefined;
  controller: string;
  handler: string;
}

/** Routes served outside /api/v1 (see main app setup). */
export const UNPREFIXED_PATHS = ['healthz'];

const join = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');

/** Lists every HTTP route with its access rule, from Nest metadata. */
@Injectable()
export class RouteCatalog {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  routes(): RouteInfo[] {
    const out: RouteInfo[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      const base = ([] as string[]).concat(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
      for (const name of this.scanner.getAllMethodNames(proto)) {
        const handler = proto[name] as (...args: unknown[]) => unknown;
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        if (sub === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        const access = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [handler, metatype]);
        for (const b of base) {
          for (const s of ([] as string[]).concat(sub)) {
            const local = join(b, s);
            const prefixed = UNPREFIXED_PATHS.includes(local.slice(1)) ? local : join(API_PREFIX, local);
            out.push({ method, path: prefixed, access, controller: metatype.name, handler: name });
          }
        }
      }
    }
    return out;
  }
}

/** Deny by default, enforced at boot: the app will not start with a route lacking an access rule. */
@Injectable()
export class RouteAudit implements OnApplicationBootstrap {
  constructor(private readonly catalog: RouteCatalog) {}

  onApplicationBootstrap(): void {
    const missing = this.catalog.routes().filter((r) => !r.access);
    if (missing.length > 0) {
      const list = missing.map((r) => `  ${r.method} ${r.path} (${r.controller}.${r.handler})`).join('\n');
      throw new Error(`Routes without @Requires, @Authenticated or @Public:\n${list}`);
    }
  }
}
