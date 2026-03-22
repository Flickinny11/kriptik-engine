export type ShortcutActionId =
    | 'openCommandPalette'
    | 'toggleSidebar'
    | 'submitPrompt'
    | 'newProject'
    | 'saveCurrentFile'
    | 'toggleComment'
    | 'closeModal'
    | 'deployProject';

export type ShortcutBindings = Record<ShortcutActionId, string>;

export const SHORTCUT_STORAGE_KEY = 'kriptik-keyboard-shortcuts';
export const SHORTCUTS_UPDATED_EVENT = 'kriptik:shortcuts-updated';

export const DEFAULT_SHORTCUT_BINDINGS: ShortcutBindings = {
    openCommandPalette: 'Mod+K',
    toggleSidebar: 'Mod+B',
    submitPrompt: 'Mod+Enter',
    newProject: 'Mod+Shift+P',
    saveCurrentFile: 'Mod+S',
    toggleComment: 'Mod+/',
    closeModal: 'Escape',
    deployProject: 'Mod+D',
};

function isMacPlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

function normalizeShortcutToken(token: string): string {
    const normalized = token.trim().toLowerCase();

    if (normalized === 'cmd' || normalized === 'command') return 'meta';
    if (normalized === 'control' || normalized === 'ctl') return 'ctrl';
    if (normalized === 'option') return 'alt';
    if (normalized === 'esc') return 'escape';
    if (normalized === 'return') return 'enter';
    if (normalized === 'spacebar') return 'space';

    return normalized;
}

function normalizeEventKey(key: string): string {
    const normalized = key.toLowerCase();
    if (normalized === ' ') return 'space';
    if (normalized === 'esc') return 'escape';
    return normalized;
}

function normalizeShortcutCombo(shortcut: string): string {
    const tokens = shortcut
        .split('+')
        .map(normalizeShortcutToken)
        .filter(Boolean);

    if (tokens.length === 0) return '';

    let key = '';
    const modifiers = new Set<string>();

    for (const token of tokens) {
        if (token === 'mod' || token === 'ctrl' || token === 'meta' || token === 'shift' || token === 'alt') {
            modifiers.add(token);
        } else if (!key) {
            key = token;
        }
    }

    if (!key) return '';

    const orderedModifiers = ['mod', 'ctrl', 'meta', 'shift', 'alt'].filter(mod => modifiers.has(mod));
    return [...orderedModifiers, key].join('+');
}

function parseShortcutBindings(rawValue: unknown): Partial<ShortcutBindings> {
    let parsed: unknown = rawValue;

    if (typeof rawValue === 'string') {
        try {
            parsed = JSON.parse(rawValue);
        } catch {
            return {};
        }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
    }

    const candidate = parsed as Record<string, unknown>;
    const resolved: Partial<ShortcutBindings> = {};

    for (const key of Object.keys(DEFAULT_SHORTCUT_BINDINGS) as ShortcutActionId[]) {
        const value = candidate[key];
        if (typeof value === 'string') {
            const normalized = normalizeShortcutCombo(value);
            if (normalized) {
                resolved[key] = normalized;
            }
        }
    }

    return resolved;
}

export function resolveShortcutBindings(rawValue?: unknown): ShortcutBindings {
    return {
        ...DEFAULT_SHORTCUT_BINDINGS,
        ...parseShortcutBindings(rawValue),
    };
}

export function loadShortcutBindingsFromStorage(): ShortcutBindings {
    if (typeof window === 'undefined') {
        return { ...DEFAULT_SHORTCUT_BINDINGS };
    }

    const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY);
    return resolveShortcutBindings(raw);
}

export function saveShortcutBindingsToStorage(bindings: ShortcutBindings): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(bindings));
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
    const normalized = normalizeShortcutCombo(shortcut);
    if (!normalized) return false;

    const tokens = normalized.split('+');
    const key = tokens[tokens.length - 1];
    const modifiers = new Set(tokens.slice(0, -1));

    const modAsMeta = isMacPlatform();
    const expectedCtrl = modifiers.has('ctrl') || (modifiers.has('mod') && !modAsMeta);
    const expectedMeta = modifiers.has('meta') || (modifiers.has('mod') && modAsMeta);
    const expectedShift = modifiers.has('shift');
    const expectedAlt = modifiers.has('alt');

    if (event.ctrlKey !== expectedCtrl) return false;
    if (event.metaKey !== expectedMeta) return false;
    if (event.shiftKey !== expectedShift) return false;
    if (event.altKey !== expectedAlt) return false;

    return normalizeEventKey(event.key) === key;
}

export function formatShortcutForDisplay(shortcut: string): string {
    const normalized = normalizeShortcutCombo(shortcut);
    if (!normalized) return '';

    return normalized
        .split('+')
        .map(token => {
            if (token === 'mod') return isMacPlatform() ? 'Cmd' : 'Ctrl';
            if (token === 'meta') return 'Cmd';
            if (token === 'ctrl') return 'Ctrl';
            if (token === 'alt') return 'Alt';
            if (token === 'shift') return 'Shift';
            if (token === 'enter') return 'Enter';
            if (token === 'escape') return 'Esc';
            if (token === 'space') return 'Space';
            if (token === '/') return '/';
            if (token.length === 1) return token.toUpperCase();
            return token.charAt(0).toUpperCase() + token.slice(1);
        })
        .join('+');
}
