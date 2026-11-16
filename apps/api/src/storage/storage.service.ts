import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';

export type Download = { kind: 'redirect'; url: string } | { kind: 'stream'; stream: Readable; size: number };

/**
 * Attachments, exports and imports. `s3` for staging and production (private bucket, presigned
 * links valid 5 minutes, Hosting guide 3); `fs` for local machines without MinIO.
 */
@Injectable()
export class StorageService {
  private readonly s3: S3Client | null;
  private readonly root: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.root = resolve(env.LOCAL_STORAGE_DIR);
    this.s3 =
      env.STORAGE_DRIVER === 's3'
        ? new S3Client({
            region: env.AWS_REGION,
            endpoint: env.S3_ENDPOINT || undefined,
            forcePathStyle: Boolean(env.S3_ENDPOINT),
            credentials:
              env.S3_ACCESS_KEY && env.S3_SECRET_KEY
                ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
                : undefined,
          })
        : null;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
      return;
    }
    const path = this.localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async download(key: string, fileName: string): Promise<Download> {
    if (this.s3) {
      const url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: this.env.S3_BUCKET,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\]/g, '_')}"`,
        }),
        { expiresIn: 300 },
      );
      return { kind: 'redirect', url };
    }
    const path = this.localPath(key);
    const { size } = await stat(path);
    return { kind: 'stream', stream: createReadStream(path), size };
  }

  /** Whole file in memory: forwarding attachments, which are capped at MAX_UPLOAD_MB. */
  async read(key: string): Promise<Buffer> {
    if (this.s3) {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return readFile(this.localPath(key));
  }

  private localPath(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root)) throw new Error('Invalid storage key');
    return path;
  }
}
