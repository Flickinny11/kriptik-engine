/**
 * load_design_references — reads a design reference markdown file,
 * parses sections, writes each to brain as design_reference nodes.
 */

import type { ToolDefinition, ToolContext } from '../../agents/runtime.js';
import type { SandboxProvider } from '../sandbox/provider.js';

function parseSections(markdown: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = markdown.split('\n');
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(?:\d+\.\s*)?(.+)$/);
    if (headingMatch) {
      if (currentTitle) {
        sections.push({ title: currentTitle.trim(), content: currentLines.join('\n').trim() });
      }
      currentTitle = headingMatch[1];
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle.trim(), content: currentLines.join('\n').trim() });
  }
  return sections;
}

export function createDesignReferencesTool(sandbox: SandboxProvider): ToolDefinition {
  return {
    name: 'load_design_references',
    description: 'Load design reference material from a markdown file into the Brain as design_reference nodes. Each major section (## heading) becomes its own brain node so agents can query for specific design topics (shaders, scroll engines, transitions, etc.). This is NOT an AI call — it reads a curated document of proven design intelligence.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the design references markdown file (e.g., "Design_References.md")',
        },
      },
      required: ['file_path'],
    },
    execute: async (params, ctx: ToolContext) => {
      const filePath = params.file_path as string;
      let content: string;
      try {
        content = await sandbox.readFile(filePath);
      } catch (err) {
        return { error: `Could not read file: ${filePath}. ${String(err)}` };
      }

      if (!content.trim()) return { error: `File is empty: ${filePath}` };

      const sections = parseSections(content);
      if (sections.length === 0) {
        return { error: 'No ## sections found in the file. Expected markdown with ## headings.' };
      }

      const written: Array<{ nodeId: string; title: string; contentLength: number }> = [];
      for (const section of sections) {
        if (section.content.length < 50) continue;
        const node = await ctx.brain.writeNode(
          ctx.projectId,
          'design_reference',
          `Design: ${section.title}`,
          { section_title: section.title, reference_content: section.content, source_file: filePath },
          ctx.sessionId,
        );
        written.push({ nodeId: node.id, title: section.title, contentLength: section.content.length });
      }

      return { loaded: true, sourceFile: filePath, totalSections: sections.length, nodesCreated: written.length, sections: written };
    },
  };
}
