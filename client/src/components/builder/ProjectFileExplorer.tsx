/**
 * File Explorer — Live file tree backed by useProjectFileStore
 *
 * Shows real files being generated during builds.
 * Highlights recently-written files with an amber pulse.
 */

import { useState, useMemo } from 'react';
import {
    ChevronRightIcon,
    ChevronDownIcon,
    PlusIcon,
    TrashIcon,
    CodeIcon,
} from '../ui/icons';
import {
    FolderIcon,
    FolderOpenIcon,
    getFileIcon,
} from '../ui/icons/FileTypeIcons';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
} from '../ui/context-menu';
import { cn } from '../../lib/utils';
import { useProjectFileStore } from '../../store/useProjectFileStore';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    recentlyWritten?: boolean;
}

function buildFileTree(files: Record<string, { path: string; recentlyWritten?: boolean }>): FileNode[] {
    const root: FileNode[] = [];
    const pathMap = new Map<string, FileNode>();
    const sortedPaths = Object.keys(files).sort();

    for (const fullPath of sortedPaths) {
        const parts = fullPath.split('/').filter(Boolean);
        let currentPath = '';
        let currentLevel = root;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;
            currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;

            let existingNode = pathMap.get(currentPath);

            if (!existingNode) {
                existingNode = {
                    name: part,
                    path: currentPath,
                    type: isFile ? 'file' : 'folder',
                    children: isFile ? undefined : [],
                    recentlyWritten: isFile ? files[fullPath]?.recentlyWritten : false,
                };
                pathMap.set(currentPath, existingNode);
                currentLevel.push(existingNode);
            }

            if (!isFile && existingNode.children) {
                currentLevel = existingNode.children;
            }
        }
    }

    const sortNodes = (nodes: FileNode[]): FileNode[] =>
        nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        }).map(n => ({
            ...n,
            children: n.children ? sortNodes(n.children) : undefined,
        }));

    return sortNodes(root);
}

interface FileTreeNodeProps {
    node: FileNode;
    depth: number;
    activeFile: string;
    onSelectFile: (path: string) => void;
    onDeleteFile: (path: string) => void;
    openFolders: Set<string>;
    toggleFolder: (path: string) => void;
}

function FileTreeNode({
    node, depth, activeFile, onSelectFile, onDeleteFile, openFolders, toggleFolder,
}: FileTreeNodeProps) {
    const isOpen = openFolders.has(node.path);
    const isActive = activeFile === node.path;

    const handleClick = () => {
        if (node.type === 'folder') {
            toggleFolder(node.path);
        } else {
            onSelectFile(node.path);
        }
    };

    return (
        <div>
            <ContextMenu>
                <ContextMenuTrigger>
                    <div
                        className={cn(
                            'flex items-center gap-1.5 py-1 px-2 cursor-pointer text-sm transition-colors',
                            'hover:bg-accent/50',
                            isActive && 'bg-accent text-accent-foreground',
                            node.recentlyWritten && 'bg-amber-500/10 animate-pulse',
                        )}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                        onClick={handleClick}
                    >
                        {node.type === 'folder' && (
                            isOpen
                                ? <ChevronDownIcon size={12} className="shrink-0" />
                                : <ChevronRightIcon size={12} className="shrink-0" />
                        )}
                        {node.type === 'folder' ? (
                            isOpen
                                ? <FolderOpenIcon size={16} className="shrink-0" />
                                : <FolderIcon size={16} className="shrink-0" />
                        ) : (
                            getFileIcon(node.name, 16)
                        )}
                        <span className={cn(
                            'truncate',
                            isActive ? 'text-foreground' : 'text-muted-foreground',
                            node.recentlyWritten && 'text-amber-300',
                        )}>
                            {node.name}
                        </span>
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    {node.type === 'file' && (
                        <>
                            <ContextMenuItem onClick={() => onSelectFile(node.path)}>
                                <CodeIcon size={16} className="mr-2" />
                                Open
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                        </>
                    )}
                    <ContextMenuItem onClick={() => onDeleteFile(node.path)}>
                        <TrashIcon size={16} className="mr-2" />
                        Delete
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>

            {node.type === 'folder' && isOpen && node.children && (
                <div>
                    {node.children.map((child) => (
                        <FileTreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            activeFile={activeFile}
                            onSelectFile={onSelectFile}
                            onDeleteFile={onDeleteFile}
                            openFolders={openFolders}
                            toggleFolder={toggleFolder}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ProjectFileExplorer() {
    const files = useProjectFileStore(s => s.files);
    const activeFile = useProjectFileStore(s => s.activeFile);
    const setActiveFile = useProjectFileStore(s => s.setActiveFile);
    const deleteFile = useProjectFileStore(s => s.deleteFile);
    const upsertFile = useProjectFileStore(s => s.upsertFile);
    const fileCount = useProjectFileStore(s => s.fileCount);

    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(['/src', '/public']));
    const [isCreatingFile, setIsCreatingFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');

    const fileTree = useMemo(() => buildFileTree(files), [files]);

    const toggleFolder = (path: string) => {
        setOpenFolders(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const handleSelectFile = (path: string) => setActiveFile(path);

    const handleDeleteFile = (path: string) => {
        if (confirm(`Delete ${path}?`)) {
            deleteFile(path);
        }
    };

    const handleCreateFile = () => {
        if (newFileName.trim()) {
            const path = newFileName.startsWith('/') ? newFileName : `/src/${newFileName}`;
            upsertFile(path, '');
            setActiveFile(path);
            setNewFileName('');
            setIsCreatingFile(false);
        }
    };

    return (
        <div className="h-full bg-card flex flex-col">
            <div className="p-3 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Explorer
                </h2>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setIsCreatingFile(true)}
                    title="New File"
                >
                    <PlusIcon size={14} />
                </Button>
            </div>

            {isCreatingFile && (
                <div className="p-2 border-b border-border">
                    <Input
                        autoFocus
                        placeholder="filename.tsx"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateFile();
                            if (e.key === 'Escape') {
                                setIsCreatingFile(false);
                                setNewFileName('');
                            }
                        }}
                        onBlur={() => {
                            if (!newFileName) setIsCreatingFile(false);
                        }}
                        className="h-7 text-sm"
                    />
                </div>
            )}

            <ScrollArea className="flex-1">
                <div className="py-1">
                    {fileTree.map((node) => (
                        <FileTreeNode
                            key={node.path}
                            node={node}
                            depth={0}
                            activeFile={activeFile}
                            onSelectFile={handleSelectFile}
                            onDeleteFile={handleDeleteFile}
                            openFolders={openFolders}
                            toggleFolder={toggleFolder}
                        />
                    ))}
                </div>
            </ScrollArea>

            <div className="p-2 border-t border-border text-xs text-muted-foreground text-center">
                {fileCount} files
            </div>
        </div>
    );
}
