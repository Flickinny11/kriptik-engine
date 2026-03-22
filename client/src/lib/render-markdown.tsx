/**
 * Lightweight markdown renderer for streaming text.
 * Supports: ## headers, ### sub-headers, **bold**, - bullets, numbered lists, line breaks.
 * No external markdown library required.
 *
 * theme='dark'  — amber on dark bg (used in StreamingPlanText glass card)
 * theme='light' — warm tones on white bg (used in ChatInterface streaming text)
 */

type Theme = 'dark' | 'light';

const COLORS = {
    dark: {
        header: '#F5A86C',
        subHeader: '#d4a574',
        body: '#d1d5db',
        bold: '#e5e7eb',
        bullet: '#F5A86C',
    },
    light: {
        header: '#92400e',
        subHeader: '#b45309',
        body: '#374151',
        bold: '#1a1a1a',
        bullet: '#d97706',
    },
} as const;

/**
 * Render inline markdown: **bold**
 * Returns array of strings and JSX bold elements.
 */
export function renderInlineMarkdown(text: string, theme: Theme = 'dark'): (string | JSX.Element)[] {
    const colors = COLORS[theme];
    const parts: (string | JSX.Element)[] = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = boldRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        parts.push(
            <strong key={`b-${match.index}`} style={{ color: colors.bold, fontWeight: 600 }}>
                {match[1]}
            </strong>
        );
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
}

/**
 * Lightweight markdown renderer for streaming plan text.
 * Supports: ## headers, ### sub-headers, **bold**, - bullets, numbered lists, line breaks.
 */
export function renderPlanMarkdown(text: string, theme: Theme = 'dark'): JSX.Element[] {
    const colors = COLORS[theme];
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Empty lines become vertical spacers
        if (!trimmed) {
            elements.push(<div key={i} style={{ height: '8px' }} />);
            continue;
        }

        // Shared overflow styles for mobile viewport safety
        const overflowSafe = {
            overflowWrap: 'break-word' as const,
            wordBreak: 'break-word' as const,
            minWidth: 0,
            maxWidth: '100%',
        };

        // ## Headers
        if (trimmed.startsWith('## ')) {
            elements.push(
                <h3 key={i} style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: colors.header,
                    marginTop: i > 0 ? '16px' : '0',
                    marginBottom: '4px',
                    fontFamily: 'Syne, system-ui, sans-serif',
                    ...overflowSafe,
                }}>
                    {renderInlineMarkdown(trimmed.slice(3), theme)}
                </h3>
            );
            continue;
        }

        // ### Sub-headers
        if (trimmed.startsWith('### ')) {
            elements.push(
                <h4 key={i} style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: colors.subHeader,
                    marginTop: '12px',
                    marginBottom: '2px',
                    fontFamily: 'system-ui, sans-serif',
                    ...overflowSafe,
                }}>
                    {renderInlineMarkdown(trimmed.slice(4), theme)}
                </h4>
            );
            continue;
        }

        // - Bullets and * Bullets
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            elements.push(
                <div key={i} style={{ display: 'flex', gap: '8px', paddingLeft: '4px', ...overflowSafe }}>
                    <span style={{ color: colors.bullet, flexShrink: 0, lineHeight: '1.6' }}>-</span>
                    <span style={{
                        fontSize: '13px',
                        color: colors.body,
                        lineHeight: '1.6',
                        ...overflowSafe,
                    }}>
                        {renderInlineMarkdown(trimmed.slice(2), theme)}
                    </span>
                </div>
            );
            continue;
        }

        // Numbered lists (1. 2. etc.)
        const numberedMatch = trimmed.match(/^(\d+)\.\s(.+)/);
        if (numberedMatch) {
            elements.push(
                <div key={i} style={{ display: 'flex', gap: '8px', paddingLeft: '4px', ...overflowSafe }}>
                    <span style={{ color: colors.bullet, flexShrink: 0, lineHeight: '1.6', fontSize: '13px', minWidth: '16px' }}>
                        {numberedMatch[1]}.
                    </span>
                    <span style={{
                        fontSize: '13px',
                        color: colors.body,
                        lineHeight: '1.6',
                        ...overflowSafe,
                    }}>
                        {renderInlineMarkdown(numberedMatch[2], theme)}
                    </span>
                </div>
            );
            continue;
        }

        // Regular text
        elements.push(
            <p key={i} style={{
                fontSize: '13px',
                color: colors.body,
                lineHeight: '1.6',
                margin: 0,
                ...overflowSafe,
            }}>
                {renderInlineMarkdown(trimmed, theme)}
            </p>
        );
    }

    return elements;
}
