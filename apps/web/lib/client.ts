'use client';
// Browser-side mutations through the same-origin /api/v1 proxy.
import type { ApiError } from '@opshub/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export class SendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new SendError(res.status, err?.error.code ?? 'ERROR', err?.error.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function send<T = unknown>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  return parse<T>(res);
}

export async function getJson<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  return parse<T>(res);
}

/** Multipart POST: JSON in a "payload" field, plus files (inbox send, WhatsApp import). */
export async function sendForm<T = unknown>(path: string, payload: unknown, files: File[], fileField = 'files'): Promise<T> {
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  for (const f of files) form.append(fileField, f);
  const res = await fetch(`/api/v1${path}`, { method: 'POST', body: form, credentials: 'same-origin' });
  return parse<T>(res);
}

export async function upload<T = unknown>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/v1${path}`, { method: 'POST', body: form, credentials: 'same-origin' });
  return parse<T>(res);
}

/** Runs a mutation, refreshes server components on success, keeps the error message for display. */
export function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const out = await fn();
      router.refresh();
      return out;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { run, error, busy, setError };
}
