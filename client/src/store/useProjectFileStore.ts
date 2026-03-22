/**
 * Project File Store — Zustand store for live project files
 *
 * Zustand store for live project files. Receives file_write events
 * from the build SSE stream and periodic file fetches from the backend.
 *
 * All components (CodeEditor, FileExplorer, preview pane) subscribe
 * to this single source of truth.
 */

import { create } from 'zustand';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProjectFile {
    path: string;
    code: string;
    language: string;
    /** Timestamp of last update (for ordering recent changes) */
    updatedAt: number;
    /** Whether this file was recently written by the build (for UI highlighting) */
    recentlyWritten?: boolean;
}

interface FileTreeNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileTreeNode[];
    language?: string;
}

interface ProjectFileState {
    /** All project files keyed by path */
    files: Record<string, ProjectFile>;
    /** Currently active file path in the editor */
    activeFile: string;
    /** Ordered list of recently modified file paths (newest first) */
    recentFiles: string[];
    /** Total file count */
    fileCount: number;

    // ── Actions ──────────────────────────────────────────────────────────

    /** Add or update a single file */
    upsertFile: (path: string, code: string) => void;
    /** Bulk-set files (from backend fetch or snapshot) */
    setFiles: (files: Array<{ path: string; content: string }>) => void;
    /** Delete a file */
    deleteFile: (path: string) => void;
    /** Set the active file in the editor */
    setActiveFile: (path: string) => void;
    /** Update file content from editor (user typing) */
    updateFileContent: (path: string, code: string) => void;
    /** Get a computed file tree */
    getFileTree: () => FileTreeNode[];
    /** Clear all files (reset) */
    clearFiles: () => void;
    /** Clear the "recently written" highlight after a delay */
    clearRecentHighlight: (path: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function inferLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript',
        js: 'javascript', jsx: 'javascript',
        json: 'json', css: 'css', scss: 'scss',
        html: 'html', md: 'markdown', py: 'python',
        yaml: 'yaml', yml: 'yaml', sh: 'shell',
        svg: 'xml', xml: 'xml', toml: 'toml',
        env: 'shell', dockerfile: 'dockerfile',
    };
    return map[ext] || 'plaintext';
}

function buildFileTree(files: Record<string, ProjectFile>): FileTreeNode[] {
    const root: FileTreeNode[] = [];
    const nodeMap = new Map<string, FileTreeNode>();
    const sortedPaths = Object.keys(files).sort();

    for (const fullPath of sortedPaths) {
        const parts = fullPath.split('/').filter(Boolean);
        let currentPath = '';
        let currentLevel = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;
            currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;

            let node = nodeMap.get(currentPath);
            if (!node) {
                node = {
                    name: part,
                    path: currentPath,
                    type: isFile ? 'file' : 'folder',
                    ...(isFile
                        ? { language: files[fullPath]?.language || inferLanguage(fullPath) }
                        : { children: [] }),
                };
                nodeMap.set(currentPath, node);
                currentLevel.push(node);
            }
            if (!isFile && node.children) {
                currentLevel = node.children;
            }
        }
    }

    // Sort: folders first, then alphabetically
    const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] =>
        nodes
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            })
            .map(n => ({
                ...n,
                children: n.children ? sortNodes(n.children) : undefined,
            }));

    return sortNodes(root);
}

// ─── Default initial file ────────────────────────────────────────────────

const DEFAULT_FILE_PATH = '/App.tsx';
const DEFAULT_FILE: ProjectFile = {
    path: DEFAULT_FILE_PATH,
    code: `export default function App() {
  return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <h1 className="text-4xl font-bold text-amber-400">
        Waiting for build...
      </h1>
    </div>
  );
}`,
    language: 'typescript',
    updatedAt: Date.now(),
};

// ─── Store ───────────────────────────────────────────────────────────────

export const useProjectFileStore = create<ProjectFileState>((set, get) => ({
    files: { [DEFAULT_FILE_PATH]: DEFAULT_FILE },
    activeFile: DEFAULT_FILE_PATH,
    recentFiles: [],
    fileCount: 1,

    upsertFile: (path, code) => {
        set(state => {
            const existing = state.files[path];
            const now = Date.now();
            const file: ProjectFile = {
                path,
                code,
                language: existing?.language || inferLanguage(path),
                updatedAt: now,
                recentlyWritten: true,
            };
            const recentFiles = [path, ...state.recentFiles.filter(p => p !== path)].slice(0, 30);
            const newFiles = { ...state.files, [path]: file };
            return {
                files: newFiles,
                recentFiles,
                fileCount: Object.keys(newFiles).length,
            };
        });

        // Auto-clear highlight after 3s
        setTimeout(() => get().clearRecentHighlight(path), 3000);
    },

    setFiles: (fileArray) => {
        set(state => {
            const newFiles = { ...state.files };
            for (const f of fileArray) {
                const p = f.path.startsWith('/') ? f.path : `/${f.path}`;
                newFiles[p] = {
                    path: p,
                    code: f.content,
                    language: newFiles[p]?.language || inferLanguage(p),
                    updatedAt: Date.now(),
                };
            }
            // If active file doesn't exist in new files, pick the first one
            let activeFile = state.activeFile;
            if (!newFiles[activeFile]) {
                activeFile = Object.keys(newFiles)[0] || DEFAULT_FILE_PATH;
            }
            return {
                files: newFiles,
                activeFile,
                fileCount: Object.keys(newFiles).length,
            };
        });
    },

    deleteFile: (path) => {
        set(state => {
            const { [path]: _, ...rest } = state.files;
            const activeFile = state.activeFile === path
                ? (Object.keys(rest)[0] || DEFAULT_FILE_PATH)
                : state.activeFile;
            return {
                files: rest,
                activeFile,
                recentFiles: state.recentFiles.filter(p => p !== path),
                fileCount: Object.keys(rest).length,
            };
        });
    },

    setActiveFile: (path) => set({ activeFile: path }),

    updateFileContent: (path, code) => {
        set(state => {
            const existing = state.files[path];
            if (!existing) return state;
            return {
                files: {
                    ...state.files,
                    [path]: { ...existing, code, updatedAt: Date.now() },
                },
            };
        });
    },

    getFileTree: () => buildFileTree(get().files),

    clearFiles: () => set({
        files: { [DEFAULT_FILE_PATH]: DEFAULT_FILE },
        activeFile: DEFAULT_FILE_PATH,
        recentFiles: [],
        fileCount: 1,
    }),

    clearRecentHighlight: (path) => {
        set(state => {
            const file = state.files[path];
            if (!file || !file.recentlyWritten) return state;
            return {
                files: {
                    ...state.files,
                    [path]: { ...file, recentlyWritten: false },
                },
            };
        });
    },
}));
