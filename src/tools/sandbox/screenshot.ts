/**
 * Screenshot tool: take_screenshot via Playwright
 */

import type { ToolDefinition } from '../../agents/runtime.js';
import type { SandboxProvider } from './provider.js';
import { TIMEOUTS } from '../../config/index.js';

// Dev server state is in dev-server.ts — screenshot reads port from there
// For now, accepts port as param or defaults to 3000

export function createScreenshotTools(sandbox: SandboxProvider): ToolDefinition[] {
  return [
    {
      name: 'take_screenshot',
      description: 'Take a screenshot of the running app. Requires start_dev_server to have been called first. Returns the screenshot as a base64-encoded PNG image that can be analyzed.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'URL path to screenshot (default: "/")' },
          port: { type: 'number', description: 'Port the dev server is running on (default: 3000)' },
          viewport: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' },
            },
            description: 'Viewport size. Default: { width: 1280, height: 800 }',
          },
          fullPage: { type: 'boolean', description: 'Capture full scrollable page (default: false)' },
          waitForSelector: { type: 'string', description: 'CSS selector to wait for before taking screenshot' },
        },
      },
      execute: async (params) => {
        const port = (params.port as number) ?? 3000;
        const urlPath = (params.path as string) ?? '/';
        const fullUrl = `http://localhost:${port}${urlPath}`;
        const vp = (params.viewport as { width?: number; height?: number }) ?? {};
        const width = vp.width ?? 1280;
        const height = vp.height ?? 800;
        const fullPage = (params.fullPage as boolean) ?? false;
        const waitFor = params.waitForSelector as string | undefined;

        try {
          const { chromium } = await import('playwright');
          const browser = await chromium.launch({ headless: true });
          const page = await browser.newPage({ viewport: { width, height } });
          await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: TIMEOUTS.SCREENSHOT_PAGE_LOAD });

          if (waitFor) {
            await page.waitForSelector(waitFor, { timeout: TIMEOUTS.SCREENSHOT_SELECTOR }).catch(() => {});
          }

          const buffer = await page.screenshot({ fullPage, type: 'png' });
          await browser.close();

          const base64 = buffer.toString('base64');
          return {
            screenshot: base64,
            width,
            height,
            url: fullUrl,
            sizeBytes: buffer.length,
          };
        } catch (err: any) {
          return {
            error: `Screenshot failed: ${err.message ?? String(err)}`,
            url: fullUrl,
            hint: 'Ensure playwright is installed (npx playwright install chromium) and a dev server is running.',
          };
        }
      },
    },
  ];
}
