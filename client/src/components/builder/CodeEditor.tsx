/**
 * Code Editor — Standalone Monaco editor backed by useProjectFileStore
 *
 * Receives live file updates from the build SSE stream via the
 * project file store.
 */

import { useRef, useEffect, useCallback } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../../store/useEditorStore';
import { useAgentStore } from '../../store/useAgentStore';
import { useProjectFileStore } from '../../store/useProjectFileStore';
import {
    SparklesIcon,
    ZapIcon,
    TestTubeIcon,
    ShieldIcon,
    AccessibilityIcon,
    FileJsonIcon,
    PaletteIcon,
    SaveIcon,
} from '../ui/icons';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubTrigger,
    ContextMenuSubContent,
} from '../ui/context-menu';
import { Badge } from '../ui/badge';

export default function CodeEditor() {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);

    const { setCursorPosition, selectedElement, splitView } = useEditorStore();
    const { setGlobalStatus } = useAgentStore();

    const activeFile = useProjectFileStore(s => s.activeFile);
    const files = useProjectFileStore(s => s.files);
    const updateFileContent = useProjectFileStore(s => s.updateFileContent);
    const setActiveFile = useProjectFileStore(s => s.setActiveFile);

    const fileContent = files[activeFile]?.code || '';

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        monaco.languages.registerCompletionItemProvider('typescript', {
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };
                return {
                    suggestions: [
                        {
                            label: 'AI: Generate component',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: 'export default function ${1:Component}() {\n\treturn (\n\t\t<div>\n\t\t\t$0\n\t\t</div>\n\t);\n}',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            detail: 'AI Suggestion',
                            range,
                        },
                        {
                            label: 'AI: Add useState',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: 'const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:initialValue});',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            detail: 'AI Suggestion',
                            range,
                        },
                        {
                            label: 'AI: Add useEffect',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: 'useEffect(() => {\n\t$0\n}, [${1:dependencies}]);',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            detail: 'AI Suggestion',
                            range,
                        },
                    ],
                };
            },
        });

        editor.onDidChangeCursorPosition((e) => {
            setCursorPosition({
                lineNumber: e.position.lineNumber,
                column: e.position.column,
            });
        });

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            console.log('File saved:', activeFile);
        });
    };

    const handleEditorChange = useCallback((value: string | undefined) => {
        if (value !== undefined && value !== fileContent) {
            updateFileContent(activeFile, value);
        }
    }, [activeFile, fileContent, updateFileContent]);

    // Handle element selection from preview inspector
    useEffect(() => {
        if (selectedElement && editorRef.current && monacoRef.current) {
            const { line, file } = selectedElement;

            if (file !== activeFile && files[file]) {
                setActiveFile(file);
            }

            setTimeout(() => {
                if (editorRef.current) {
                    editorRef.current.revealLineInCenter(line);
                    editorRef.current.setPosition({ lineNumber: line, column: 1 });
                    editorRef.current.focus();

                    if (monacoRef.current) {
                        const decoration = {
                            range: new monacoRef.current.Range(line, 1, line, 1),
                            options: {
                                isWholeLine: true,
                                className: 'bg-primary/20 border-l-2 border-primary',
                            },
                        };
                        const decorations = editorRef.current.createDecorationsCollection([decoration]);
                        setTimeout(() => decorations.clear(), 3000);
                    }
                }
            }, 100);
        }
    }, [selectedElement, activeFile, files, setActiveFile]);

    const getLanguage = (path: string): string => {
        const ext = path.split('.').pop()?.toLowerCase();
        const map: Record<string, string> = {
            ts: 'typescript', tsx: 'typescript',
            js: 'javascript', jsx: 'javascript',
            json: 'json', css: 'css', scss: 'scss',
            html: 'html', md: 'markdown',
        };
        return map[ext || ''] || 'plaintext';
    };

    const handleAIAction = (action: string) => {
        console.log(`Triggering AI action: ${action}`);
        setGlobalStatus('running');
        setTimeout(() => setGlobalStatus('idle'), 2000);
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger className="h-full w-full">
                <div className={`h-full w-full flex ${splitView ? 'flex-row' : 'flex-col'}`}>
                    <div className="flex-1 relative group">
                        {/* File tab header */}
                        <div className="h-8 bg-card border-b border-border flex items-center px-2 gap-2">
                            <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs font-medium">
                                <span className="text-muted-foreground">/</span>
                                {activeFile.replace(/^\//, '')}
                            </div>
                            <Badge variant="outline" className="text-[10px] h-4">
                                {getLanguage(activeFile)}
                            </Badge>
                        </div>

                        <Editor
                            height="calc(100% - 2rem)"
                            language={getLanguage(activeFile)}
                            value={fileContent}
                            onChange={handleEditorChange}
                            theme="vs-dark"
                            onMount={handleEditorDidMount}
                            options={{
                                minimap: { enabled: true },
                                fontSize: 13,
                                padding: { top: 12 },
                                scrollBeyondLastLine: false,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                fontLigatures: true,
                                smoothScrolling: true,
                                cursorBlinking: 'smooth',
                                cursorSmoothCaretAnimation: 'on',
                                formatOnPaste: true,
                                formatOnType: true,
                                tabSize: 2,
                                wordWrap: 'on',
                                automaticLayout: true,
                            }}
                        />

                        {/* Floating AI Badge */}
                        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Badge variant="secondary" className="gap-1 backdrop-blur-sm bg-background/80">
                                <SparklesIcon size={12} className="text-primary" />
                                AI Copilot Active
                            </Badge>
                        </div>
                    </div>
                </div>
            </ContextMenuTrigger>

            <ContextMenuContent className="w-64">
                <ContextMenuItem onClick={() => handleAIAction('explain')}>
                    <SparklesIcon size={16} className="mr-2 text-primary" />
                    Explain this code
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAIAction('refactor')}>
                    <ZapIcon size={16} className="mr-2 text-yellow-500" />
                    Refactor for performance
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleAIAction('test')}>
                    <TestTubeIcon size={16} className="mr-2 text-green-500" />
                    Generate tests
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAIAction('error-handling')}>
                    <ShieldIcon size={16} className="mr-2 text-blue-500" />
                    Add error handling
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAIAction('a11y')}>
                    <AccessibilityIcon size={16} className="mr-2 text-purple-500" />
                    Make accessible
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuSub>
                    <ContextMenuSubTrigger>
                        <FileJsonIcon size={16} className="mr-2" />
                        Convert to...
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                        <ContextMenuItem>TypeScript Interface</ContextMenuItem>
                        <ContextMenuItem>Zod Schema</ContextMenuItem>
                        <ContextMenuItem>JSON Schema</ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuItem onClick={() => handleAIAction('design')}>
                    <PaletteIcon size={16} className="mr-2 text-pink-500" />
                    Apply design system
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className="text-muted-foreground text-xs">
                    <SaveIcon size={12} className="mr-2" />
                    Auto-saved
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
