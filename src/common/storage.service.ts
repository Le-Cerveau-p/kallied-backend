import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { r2 } from './r2.service';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

/**
 * Convert R2 stream to Buffer
 */
const streamToBuffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

/**
 * Upload file (Local OR R2 depending on env)
 */
export const uploadFile = async (
  key: string,
  buffer: Buffer,
  contentType: string,
) => {
  // 🧪 LOCAL DEVELOPMENT
  if (process.env.STORAGE_DRIVER === 'local') {
    const filePath = path.join(process.cwd(), 'uploads', key);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);

    return key; // store only key in DB
  }

  // ☁️ R2 PRODUCTION
  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return key; // store only key in DB
};

/**
 * Get file (Local OR R2)
 */
export const getFile = async (key: string) => {
  // 🧪 LOCAL
  if (process.env.STORAGE_DRIVER === 'local') {
    const filePath = path.join(process.cwd(), 'uploads', key);

    if (!fs.existsSync(filePath)) {
      throw new Error('File not found locally');
    }

    return fs.promises.readFile(filePath);
  }

  // ☁️ R2
  const response = await r2.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
    }),
  );

  return streamToBuffer(response.Body as Readable);
};
