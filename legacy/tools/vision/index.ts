import type { ToolDefinition } from '../../agents/runtime.js';
import { createCompareScreenshotsTool } from './compare.js';
import { createExtractUIPatternsTool } from './extract-patterns.js';

export interface VisionProvider {
  compareScreenshots(current: string, reference: string): Promise<{
    similarity: number;
    differences: Array<{ region: string; description: string }>;
  }>;
  extractUIPatterns(screenshotPath: string): Promise<{
    components: Array<{ type: string; location: string; description: string }>;
    layout: string;
    colorPalette: string[];
    typography: { headingFont: string; bodyFont: string };
  }>;
}

export function createVisionTools(): ToolDefinition[] {
  return [createCompareScreenshotsTool(), createExtractUIPatternsTool()];
}
