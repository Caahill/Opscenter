// Policy Serializer core (TechSpec 5.1 step 2). Controllers return Presentables built from DTO
// specs; the serializer resolves each declared property for the viewer and drops everything else.
import { isAudited, resolveVisibility, type FieldKey, type Visibility } from './fields';
import { maskBody } from './mask';
import type { RecordContext, Viewer } from './viewer';

export interface DtoSpec<K extends string = string> {
  /** Entity name written to the audit log, e.g. "Contact". */
  entity: string;
  fields: Readonly<Record<K, FieldKey>>;
}

export function defineDto<const K extends string>(
  entity: string,
  fields: Record<K, FieldKey>,
): DtoSpec<K> {
  return { entity, fields };
}

export interface PresentContext extends RecordContext {
  /** Record id for audit rows. */
  entityId?: string;
  /** Replacement shown to `label` viewers, e.g. "Demo Co · Marketing contact". */
  label?: string;
}

/**
 * A value whose shape differs by visibility. `full` is a thunk so encrypted originals are only
 * decrypted for viewers who may see them.
 */
export class Alternatives {
  constructor(
    readonly options: {
      full?: () => unknown;
      masked?: unknown;
      label?: unknown;
    },
  ) {}
}

export const alt = (options: Alternatives['options']) => new Alternatives(options);

export class Presentable<K extends string = string> {
  constructor(
    readonly spec: DtoSpec<K>,
    readonly data: Readonly<Record<K, unknown>>,
    readonly ctx: PresentContext,
  ) {}
}

export function present<K extends string>(
  spec: DtoSpec<K>,
  data: Record<K, unknown>,
  ctx: PresentContext = {},
): Presentable<K> {
  return new Presentable(spec, data, ctx);
}

export class PageResult {
  constructor(
    readonly items: Presentable[],
    readonly nextCursor: string | null,
  ) {}
}

export const page = (items: Presentable[], nextCursor: string | null) =>
  new PageResult(items, nextCursor);

export interface UnmaskedView {
  entity: string;
  entityId: string | undefined;
  field: FieldKey;
}

export interface SerializeHooks {
  onUnmasked?: (view: UnmaskedView) => void;
}

export class UnserializableResponseError extends Error {
  constructor(what: string) {
    super(`Response is not a Presentable (${what}). Map to a DTO with present().`);
  }
}

const OMIT = Symbol('omit');

async function pick(
  raw: unknown,
  vis: Visibility,
  ctx: PresentContext,
): Promise<unknown | typeof OMIT> {
  if (raw instanceof Alternatives) {
    const o = raw.options;
    switch (vis) {
      case 'full':
      case 'amount':
        return o.full ? await o.full() : OMIT;
      case 'masked':
        return 'masked' in o ? o.masked : OMIT;
      case 'label':
        return 'label' in o ? o.label : (ctx.label ?? OMIT);
      default:
        return OMIT;
    }
  }
  switch (vis) {
    case 'full':
    case 'amount':
      return raw;
    case 'masked':
      return typeof raw === 'string' ? maskBody(raw) : OMIT;
    case 'label':
      return ctx.label ?? OMIT;
    default:
      return OMIT;
  }
}

async function toPlain(value: unknown, viewer: Viewer | null, hooks: SerializeHooks): Promise<unknown> {
  if (value === null || value === undefined) return null;
  if (value instanceof Presentable) return serializePresentable(value, viewer, hooks);
  if (value instanceof Alternatives || value instanceof PageResult) {
    throw new UnserializableResponseError('nested wrapper outside a DTO field');
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => toPlain(v, viewer, hooks)));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    const json = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof json === 'function') return json.call(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await toPlain(v, viewer, hooks);
    return out;
  }
  return value;
}

async function serializePresentable(
  p: Presentable,
  viewer: Viewer | null,
  hooks: SerializeHooks,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [prop, field] of Object.entries(p.spec.fields) as Array<[string, FieldKey]>) {
    const vis = resolveVisibility(field, viewer, p.ctx);
    if (vis === 'none') continue;
    const raw = p.data[prop];
    const value = await pick(raw, vis, p.ctx);
    if (value === OMIT) continue;
    if (vis === 'full' && value !== null && value !== undefined && isAudited(field)) {
      hooks.onUnmasked?.({ entity: p.spec.entity, entityId: p.ctx.entityId, field });
    }
    out[prop] = await toPlain(value, viewer, hooks);
  }
  return out;
}

/**
 * Shapes a controller result for one viewer. Accepts a Presentable, a page() result, an array of
 * Presentables, or undefined (204). Anything else is a bug and throws.
 */
export async function serializeForViewer(
  body: unknown,
  viewer: Viewer | null,
  hooks: SerializeHooks = {},
): Promise<unknown> {
  if (body === undefined) return undefined;
  if (body instanceof Presentable) return serializePresentable(body, viewer, hooks);
  if (body instanceof PageResult) {
    return {
      items: await Promise.all(body.items.map((i) => serializePresentable(i, viewer, hooks))),
      nextCursor: body.nextCursor,
    };
  }
  if (Array.isArray(body)) {
    if (!body.every((i) => i instanceof Presentable)) {
      throw new UnserializableResponseError('array with non-DTO items');
    }
    return Promise.all(body.map((i: Presentable) => serializePresentable(i, viewer, hooks)));
  }
  throw new UnserializableResponseError(body === null ? 'null' : typeof body);
}
