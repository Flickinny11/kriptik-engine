import { describe, it, expect } from 'vitest';
import {
  buildDeploymentRequest,
  validateDeploymentTarget,
  buildDeploymentManifest,
  getExpectedDeployTime,
} from '../../backend/deployment.js';
import type { BackendTarget } from '../../types.js';

describe('buildDeploymentRequest', () => {
  it('builds configs for targets with available deployment configs', () => {
    const targets: BackendTarget[] = ['cloudflare-workers', 'vercel-functions'];
    const configs: Record<string, string> = {
      'cloudflare-workers': 'wrangler.toml contents',
      'vercel-functions': 'vercel.json contents',
    };

    const result = buildDeploymentRequest(targets, configs, 'my-app');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      target: 'cloudflare-workers',
      configContent: 'wrangler.toml contents',
      appName: 'my-app',
    });
    expect(result[1]).toEqual({
      target: 'vercel-functions',
      configContent: 'vercel.json contents',
      appName: 'my-app',
    });
  });

  it('filters out targets without configs', () => {
    const targets: BackendTarget[] = ['cloudflare-workers', 'aws-lambda'];
    const configs: Record<string, string> = {
      'cloudflare-workers': 'wrangler.toml contents',
    };

    const result = buildDeploymentRequest(targets, configs, 'my-app');

    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('cloudflare-workers');
  });

  it('returns empty array for no matching configs', () => {
    const result = buildDeploymentRequest(['aws-lambda'], {}, 'my-app');
    expect(result).toEqual([]);
  });
});

describe('validateDeploymentTarget', () => {
  it('validates cloudflare-workers with all credentials', () => {
    const result = validateDeploymentTarget('cloudflare-workers', {
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
    });
    expect(result.valid).toBe(true);
    expect(result.missingCredentials).toEqual([]);
  });

  it('reports missing credentials', () => {
    const result = validateDeploymentTarget('cloudflare-workers', {
      CLOUDFLARE_API_TOKEN: 'token',
    });
    expect(result.valid).toBe(false);
    expect(result.missingCredentials).toContain('CLOUDFLARE_ACCOUNT_ID');
  });

  it('validates vercel-functions target', () => {
    const result = validateDeploymentTarget('vercel-functions', {
      VERCEL_TOKEN: 'vtoken',
    });
    expect(result.valid).toBe(true);
  });

  it('reports all missing credentials for aws-lambda', () => {
    const result = validateDeploymentTarget('aws-lambda', {});
    expect(result.valid).toBe(false);
    expect(result.missingCredentials).toEqual([
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
    ]);
  });
});

describe('buildDeploymentManifest', () => {
  it('builds manifest from deployment results', () => {
    const results = [
      { target: 'cloudflare-workers' as BackendTarget, success: true, url: 'https://cf.example.com', deployTimeMs: 3000 },
      { target: 'vercel-functions' as BackendTarget, success: true, url: 'https://vercel.example.com', deployTimeMs: 7000 },
    ];

    const manifest = buildDeploymentManifest(results);

    expect(manifest.deployments).toHaveLength(2);
    expect(manifest.totalTimeMs).toBe(10000);
    expect(manifest.deployedAt).toBeTruthy();
  });

  it('handles empty results', () => {
    const manifest = buildDeploymentManifest([]);
    expect(manifest.deployments).toEqual([]);
    expect(manifest.totalTimeMs).toBe(0);
  });

  it('includes failed deployments in manifest', () => {
    const results = [
      { target: 'aws-lambda' as BackendTarget, success: false, error: 'Auth failed', deployTimeMs: 1000 },
    ];

    const manifest = buildDeploymentManifest(results);
    expect(manifest.deployments[0].success).toBe(false);
    expect(manifest.deployments[0].error).toBe('Auth failed');
  });
});

describe('getExpectedDeployTime', () => {
  it('returns expected time range for cloudflare-workers', () => {
    const time = getExpectedDeployTime('cloudflare-workers');
    expect(time.minMs).toBe(2000);
    expect(time.maxMs).toBe(5000);
  });

  it('returns expected time range for vercel-functions', () => {
    const time = getExpectedDeployTime('vercel-functions');
    expect(time.minMs).toBe(5000);
    expect(time.maxMs).toBe(15000);
  });

  it('returns default range for unknown target', () => {
    const time = getExpectedDeployTime('unknown-target' as BackendTarget);
    expect(time.minMs).toBe(5000);
    expect(time.maxMs).toBe(15000);
  });
});
