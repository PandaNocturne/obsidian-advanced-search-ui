import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';

/** Editor selection when available; otherwise non-empty DOM selection inside the app. */
export function getActiveSelectionText(app: App): string {
    const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
    const fromEditor = markdownView?.editor?.getSelection()?.trim();
    if (fromEditor) return fromEditor;

    const domSelection = activeWindow.getSelection()?.toString().trim();
    if (!domSelection) return '';

    const appRoot = app.workspace.containerEl;
    const anchor = activeWindow.getSelection()?.anchorNode;
    if (anchor && appRoot.contains(anchor)) return domSelection;

    return '';
}
