import { describe, expect, it, vi } from 'vitest';
import {
  alt,
  defineDto,
  page,
  present,
  serializeForViewer,
  UnserializableResponseError,
} from './present';
import type { Viewer } from './viewer';

const ContactDto = defineDto('Contact', {
  id: 'contact.id',
  label: 'contact.label',
  email: 'contact.email',
});
const MessageDto = defineDto('Communication', {
  id: 'communication.id',
  body: 'communication.body',
});

const pm: Viewer = { userId: 'pm1', roles: ['PM'], teamId: null };
const member: Viewer = { userId: 'm1', roles: ['TEAM_MEMBER'], teamId: null };
const hr: Viewer = { userId: 'h1', roles: ['HR'], teamId: null };

const contact = () =>
  present(
    ContactDto,
    { id: 'c1', label: 'Demo Co · Marketing contact', email: 'priya@demo.example.com' },
    { clientPmId: 'pm1', entityId: 'c1', label: 'Demo Co · Marketing contact' },
  );

describe('serializeForViewer', () => {
  it('serves full values to the assigned PM and records the unmasked view', async () => {
    const onUnmasked = vi.fn();
    const out = await serializeForViewer(contact(), pm, { onUnmasked });
    expect(out).toEqual({
      id: 'c1',
      label: 'Demo Co · Marketing contact',
      email: 'priya@demo.example.com',
    });
    expect(onUnmasked).toHaveBeenCalledWith({
      entity: 'Contact',
      entityId: 'c1',
      field: 'contact.email',
    });
  });

  it('replaces the address with the label for a Team Member', async () => {
    const onUnmasked = vi.fn();
    const out = await serializeForViewer(contact(), member, { onUnmasked });
    expect(out).toEqual({
      id: 'c1',
      label: 'Demo Co · Marketing contact',
      email: 'Demo Co · Marketing contact',
    });
    expect(onUnmasked).not.toHaveBeenCalled();
  });

  it('omits the field entirely for `none`', async () => {
    const out = (await serializeForViewer(contact(), hr)) as Record<string, unknown>;
    expect(out).toEqual({});
  });

  it('only decrypts the original for full viewers', async () => {
    const decrypt = vi.fn(() => 'Call +91 98200 12345');
    const msg = () =>
      present(
        MessageDto,
        { id: 'm1', body: alt({ full: decrypt, masked: 'Call [phone hidden]' }) },
        { clientPmId: 'pm1', entityId: 'm1' },
      );
    expect(await serializeForViewer(msg(), member)).toEqual({ id: 'm1', body: 'Call [phone hidden]' });
    expect(decrypt).not.toHaveBeenCalled();
    expect(await serializeForViewer(msg(), pm)).toEqual({ id: 'm1', body: 'Call +91 98200 12345' });
    expect(decrypt).toHaveBeenCalledOnce();
  });

  it('drops properties not declared on the DTO', async () => {
    const leaky = present(ContactDto, {
      id: 'c1',
      label: 'x',
      email: 'priya@demo.example.com',
      emailEnc: 'ciphertext',
    } as never);
    const out = (await serializeForViewer(leaky, pm)) as Record<string, unknown>;
    expect(out).not.toHaveProperty('emailEnc');
  });

  it('serializes pages and arrays', async () => {
    expect(await serializeForViewer(page([contact()], 'next'), member)).toMatchObject({
      items: [{ id: 'c1' }],
      nextCursor: 'next',
    });
    expect(await serializeForViewer([contact()], member)).toHaveLength(1);
  });

  it('rejects raw objects so a Prisma entity can never be returned', async () => {
    await expect(serializeForViewer({ email: 'priya@demo.example.com' }, pm)).rejects.toBeInstanceOf(
      UnserializableResponseError,
    );
    await expect(serializeForViewer([{ id: 1 }], pm)).rejects.toBeInstanceOf(
      UnserializableResponseError,
    );
  });
});
