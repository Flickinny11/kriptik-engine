/**
 * vercel-deploy.ts — Deploy Prism static bundles to Vercel.
 *
 * Spec reference: Section 15 — Deployment Pipeline
 *   "Deploy to Vercel via POST /v13/deployments"
 *
 * INVARIANT 6: Modal Executes, Vercel Routes.
 * Vercel serves the static PixiJS bundle. No compute runs there.
 *
 * Flow:
 *   1. List bundle files from R2 ({projectId}/{version}/bundles/frontend/)
 *   2. Download each file from R2
 *   3. Upload as a Vercel deployment via POST /v13/deployments
 *   4. Optionally add {slug}.kriptik.app domain alias
 *
 * Uses Vercel REST API directly — no SDK dependency needed.
 */

import { createHash } from 'node:crypto';
import { listR2Prefix, downloadFromR2 } from './r2.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VercelDeployConfig {
  projectId: string;
  graphVersion: number;
  /** Vercel project name. Created automatically if it doesn't exist. */
  vercelProjectName: string;
  /** Optional: subdomain for published apps (e.g. "my-app" → my-app.kriptik.app) */
  slug?: string;
}

export interface VercelDeployResult {
  success: boolean;
  deploymentId?: string;
  deploymentUrl?: string;
  productionUrl?: string;
  error?: string;
  deployTimeMs: number;
}

interface VercelFile {
  /** Path within the deployment (e.g. "index.html", "nodes/abc.js") */
  file: string;
  /** SHA1 hash of the file content */
  sha: string;
  /** File size in bytes */
  size: number;
  /** File content as Buffer (used for upload, not sent in deployment request) */
  data: Buffer;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getVercelToken(): string {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error('VERCEL_TOKEN not configured. Set it in environment variables.');
  }
  return token;
}

function getVercelTeamId(): string | undefined {
  return process.env.VERCEL_TEAM_ID || undefined;
}

const VERCEL_API = 'https://api.vercel.com';
const KRIPTIK_DOMAIN = 'kriptik.app';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Deploy a Prism bundle from R2 to Vercel.
 *
 * Downloads the bundle files from R2, uploads them to Vercel's file API,
 * then creates a deployment. Returns the deployment URL.
 */
export async function deployToVercel(
  config: VercelDeployConfig,
): Promise<VercelDeployResult> {
  const startTime = Date.now();
  const token = getVercelToken();
  const teamId = getVercelTeamId();

  try {
    // 1. List and download bundle files from R2
    const r2Prefix = `${config.projectId}/${config.graphVersion}/bundles/frontend/`;
    const r2Keys = await listR2Prefix(r2Prefix);

    if (r2Keys.length === 0) {
      return {
        success: false,
        error: `No bundle files found at R2 prefix: ${r2Prefix}`,
        deployTimeMs: Date.now() - startTime,
      };
    }

    // 2. Download files and compute SHA1 hashes
    const files: VercelFile[] = [];
    for (const key of r2Keys) {
      const data = await downloadFromR2(key);
      if (!data) continue;

      // Strip the R2 prefix to get the relative path within the bundle
      const relativePath = key.slice(r2Prefix.length);
      if (!relativePath) continue;

      files.push({
        file: relativePath,
        sha: sha1(data),
        size: data.length,
        data,
      });
    }

    if (files.length === 0) {
      return {
        success: false,
        error: 'All bundle files were empty or could not be downloaded',
        deployTimeMs: Date.now() - startTime,
      };
    }

    // 3. Upload files to Vercel's file API
    await uploadFilesToVercel(files, token, teamId);

    // 4. Create the deployment
    const deployment = await createVercelDeployment(
      files,
      config.vercelProjectName,
      token,
      teamId,
    );

    // 5. Add domain alias if slug is provided
    let productionUrl: string | undefined;
    if (config.slug) {
      const domain = `${config.slug}.${KRIPTIK_DOMAIN}`;
      await addDomainAlias(
        deployment.projectId,
        domain,
        token,
        teamId,
      );
      productionUrl = `https://${domain}`;
    }

    return {
      success: true,
      deploymentId: deployment.id,
      deploymentUrl: deployment.url ? `https://${deployment.url}` : undefined,
      productionUrl,
      deployTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      deployTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Remove the kriptik.app domain alias from a Vercel project.
 * Called when unpublishing a Prism project.
 */
export async function removeDomainAlias(
  vercelProjectName: string,
  slug: string,
): Promise<void> {
  const token = getVercelToken();
  const teamId = getVercelTeamId();
  const domain = `${slug}.${KRIPTIK_DOMAIN}`;
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  await fetch(
    `${VERCEL_API}/v9/projects/${encodeURIComponent(vercelProjectName)}/domains/${domain}${teamQuery}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

// ---------------------------------------------------------------------------
// Vercel API helpers
// ---------------------------------------------------------------------------

/**
 * Upload file contents to Vercel's file upload API.
 * Each file is uploaded individually via POST /v2/files.
 * Vercel deduplicates by SHA1, so repeated deploys are fast.
 */
async function uploadFilesToVercel(
  files: VercelFile[],
  token: string,
  teamId?: string,
): Promise<void> {
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  // Upload in parallel batches of 10 to avoid overwhelming the API
  const batchSize = 10;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (file) => {
        const response = await fetch(
          `${VERCEL_API}/v2/files${teamQuery}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(file.size),
              'x-vercel-digest': file.sha,
            },
            body: new Uint8Array(file.data),
          },
        );

        // 409 = file already exists (deduplication), which is fine
        if (!response.ok && response.status !== 409) {
          const text = await response.text();
          throw new Error(
            `Vercel file upload failed for ${file.file} (${response.status}): ${text}`,
          );
        }
      }),
    );
  }
}

/**
 * Create a Vercel deployment from uploaded files.
 */
async function createVercelDeployment(
  files: VercelFile[],
  projectName: string,
  token: string,
  teamId?: string,
): Promise<{ id: string; url: string; projectId: string }> {
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  const deploymentBody = {
    name: projectName,
    files: files.map((f) => ({
      file: f.file,
      sha: f.sha,
      size: f.size,
    })),
    projectSettings: {
      framework: null, // Static site, no framework
    },
    target: 'production',
  };

  const response = await fetch(
    `${VERCEL_API}/v13/deployments${teamQuery}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deploymentBody),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Vercel deployment creation failed (${response.status}): ${text}`,
    );
  }

  const data = await response.json() as {
    id: string;
    url: string;
    projectId: string;
  };

  return {
    id: data.id,
    url: data.url,
    projectId: data.projectId,
  };
}

/**
 * Add a domain alias to a Vercel project.
 * Used to map {slug}.kriptik.app to a Prism deployment.
 */
async function addDomainAlias(
  vercelProjectId: string,
  domain: string,
  token: string,
  teamId?: string,
): Promise<void> {
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  const response = await fetch(
    `${VERCEL_API}/v10/projects/${vercelProjectId}/domains${teamQuery}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: domain }),
    },
  );

  // 409 = domain already assigned, which is fine for re-deploys
  if (!response.ok && response.status !== 409) {
    const text = await response.text();
    throw new Error(
      `Vercel domain alias failed for ${domain} (${response.status}): ${text}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha1(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex');
}
