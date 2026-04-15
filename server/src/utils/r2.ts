/**
 * r2.ts — Cloudflare R2 client for Prism asset storage.
 *
 * Handles upload/download/delete of generated images, atlases,
 * bundles, and graph JSON to the kriptik-prism-assets bucket.
 *
 * R2 path convention:
 *   {projectId}/{graphVersion}/images/hub-{hubId}.png
 *   {projectId}/{graphVersion}/images/node-{nodeId}.png
 *   {projectId}/{graphVersion}/atlases/atlas-{index}.png
 *   {projectId}/{graphVersion}/bundles/frontend/
 *   {projectId}/{graphVersion}/bundles/backend/
 *   {projectId}/{graphVersion}/graph.json
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || 'kriptik-prism-assets';
  const publicUrl = process.env.R2_PUBLIC_URL || '';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

function getR2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/**
 * Sign an R2 request using AWS Signature V4 (R2 is S3-compatible).
 * Uses the native crypto module for HMAC-SHA256.
 */
async function signR2Request(
  method: string,
  path: string,
  config: R2Config,
  contentType?: string,
  contentLength?: number,
): Promise<Headers> {
  const { createHmac, createHash } = await import('node:crypto');
  const endpoint = getR2Endpoint(config.accountId);
  const url = new URL(path, endpoint);
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const region = 'auto';
  const service = 's3';
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
  };
  if (contentType) headers['content-type'] = contentType;
  if (contentLength !== undefined) headers['content-length'] = String(contentLength);

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join('');

  const canonicalRequest = [
    method,
    url.pathname,
    url.search.slice(1),
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const canonicalRequestHash = createHash('sha256').update(canonicalRequest).digest('hex');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    canonicalRequestHash,
  ].join('\n');

  const hmac = (key: Buffer | string, data: string) =>
    createHmac('sha256', key).update(data).digest();

  const signingKey = hmac(
    hmac(
      hmac(
        hmac(`AWS4${config.secretAccessKey}`, dateStamp),
        region,
      ),
      service,
    ),
    'aws4_request',
  );

  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const result = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    result.set(k, v);
  }
  result.set('Authorization', authorization);
  return result;
}

/**
 * Upload a file or buffer to R2.
 * @param key - The object key (path within bucket)
 * @param data - File contents as Buffer or string
 * @param contentType - MIME type
 * @returns The public URL of the uploaded object
 */
export async function uploadToR2(
  key: string,
  data: Buffer | string,
  contentType: string = 'application/octet-stream',
): Promise<string> {
  const config = getR2Config();
  const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  const path = `/${config.bucketName}/${key}`;
  const endpoint = getR2Endpoint(config.accountId);

  const headers = await signR2Request('PUT', path, config, contentType, body.length);

  const response = await fetch(`${endpoint}${path}`, {
    method: 'PUT',
    headers,
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 upload failed (${response.status}): ${text}`);
  }

  return getR2Url(key);
}

/**
 * Get the public URL for an R2 object.
 * @param key - The object key (path within bucket)
 * @returns The public URL
 */
export function getR2Url(key: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (publicUrl) {
    return `${publicUrl}/${key}`;
  }
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const bucketName = process.env.R2_BUCKET_NAME || 'kriptik-prism-assets';
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}

/**
 * Delete an object from R2.
 * @param key - The object key (path within bucket)
 */
export async function deleteFromR2(key: string): Promise<void> {
  const config = getR2Config();
  const path = `/${config.bucketName}/${key}`;
  const endpoint = getR2Endpoint(config.accountId);

  const headers = await signR2Request('DELETE', path, config);

  const response = await fetch(`${endpoint}${path}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`R2 delete failed (${response.status}): ${text}`);
  }
}

/**
 * List all object keys under a given prefix in R2.
 * Uses the S3 ListObjectsV2 API.
 * @param prefix - The key prefix to list (e.g. "{projectId}/{version}/bundles/frontend/")
 * @returns Array of object keys matching the prefix
 */
export async function listR2Prefix(prefix: string): Promise<string[]> {
  const config = getR2Config();
  const endpoint = getR2Endpoint(config.accountId);
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const params = new URLSearchParams({
      'list-type': '2',
      prefix,
      'max-keys': '1000',
    });
    if (continuationToken) {
      params.set('continuation-token', continuationToken);
    }

    const path = `/${config.bucketName}?${params.toString()}`;
    const headers = await signR2Request('GET', path, config);

    const response = await fetch(`${endpoint}${path}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`R2 list failed (${response.status}): ${text}`);
    }

    const xml = await response.text();

    // Parse keys from XML response
    const keyMatches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
    for (const match of keyMatches) {
      keys.push(match[1]);
    }

    // Check for continuation
    const truncatedMatch = xml.match(/<IsTruncated>(\w+)<\/IsTruncated>/);
    const isTruncated = truncatedMatch?.[1] === 'true';
    const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    continuationToken = isTruncated ? tokenMatch?.[1] : undefined;
  } while (continuationToken);

  return keys;
}

/**
 * Download an object from R2.
 * @param key - The object key (path within bucket)
 * @returns The object data as a Buffer, or null if not found
 */
export async function downloadFromR2(key: string): Promise<Buffer | null> {
  const config = getR2Config();
  const path = `/${config.bucketName}/${key}`;
  const endpoint = getR2Endpoint(config.accountId);

  const headers = await signR2Request('GET', path, config);

  const response = await fetch(`${endpoint}${path}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 download failed (${response.status}): ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
