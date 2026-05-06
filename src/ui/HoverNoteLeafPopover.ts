import { around } from 'monkey-around';
import { t } from '../lang/helpers';
import type { FloatingPanelBounds } from '../settings';
import {
    FileView,
    MarkdownView,
    Plugin,
    setIcon,
    TFile,
    Workspace,
    WorkspaceItem,
    WorkspaceLeaf,
    WorkspaceSplit,
    WorkspaceTabs
} from 'obsidian';

type WorkspaceSplitCtor = new (ws: Workspace, dir: 'horizontal' | 'vertical') => WorkspaceSplit;
type SplitWithReplace = WorkspaceSplit & {
    children: WorkspaceItem[];
    replaceChild(index: number, child: WorkspaceItem): void;
};
type WorkspaceSplitWithDom = WorkspaceSplit & { containerEl: HTMLElement };

const MIN_WIDTH = 420;
const MIN_HEIGHT = 260;
const VIEWPORT_MARGIN = 24;
const RESIZE_DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
type ResizeDirection = (typeof RESIZE_DIRECTIONS)[number];

export interface HoverNoteLeafPopoverOptions {
    plugin: Plugin;
    mountEl: HTMLElement;
    bounds?: FloatingPanelBounds | null;
    /** Dock preview to the floating search panel edge (link control). */
    defaultBound?: boolean;
    /** Title pin: keep preview visible when the search leaf is not active. */
    defaultVisibilityPinned?: boolean;
    /** Note body scale: applied as `zoom` on `.view-content` inside the preview shell (0.5–1). */
    previewScale?: number;
    /** Initial Markdown mode for `.md` files opened in this window. */
    defaultMarkdownMode?: 'preview' | 'source';
    onClose: () => void;
    onBoundsChange: (bounds: FloatingPanelBounds) => void;
    onResize?: () => void;
    /** Fires when the user toggles bind (dock next to the floating search panel). */
    onBindChange?: (bound: boolean) => void;
    /** Fires when the user toggles the title “always show” pin. */
    onVisibilityPinnedChange?: (pinned: boolean) => void;
}

/**
 * Floating note preview: {@link WorkspaceSplit} + {@link WorkspaceLeaf} in a plain DOM shell.
 * Uses plugin-owned `asui-preview-window*` classes only — not `.popover` / Hover Editor markup (Obsidian may rewrite those).
 */
export class HoverNoteLeafPopover {
    /** Root element of the preview window (`asui-preview-window`). */
    readonly rootEl: HTMLElement;

    /** @deprecated Use {@link rootEl}. */
    get hoverEl(): HTMLElement {
        return this.rootEl;
    }

    private readonly bodyEl: HTMLElement;
    private readonly headerEl: HTMLElement;
    private readonly titleTextEl: HTMLElement;
    private readonly modeToggleBtn: HTMLButtonElement;
    private readonly visibilityPinBtn: HTMLButtonElement;
    private readonly bindBtn: HTMLButtonElement;
    private readonly rootSplit: WorkspaceSplit;
    private readonly defaultMarkdownMode: 'preview' | 'source';
    private readonly plugin: Plugin;
    private readonly onBoundsChange: (bounds: FloatingPanelBounds) => void;
    private readonly onResize?: () => void;
    private leaf: WorkspaceLeaf | null = null;
    private isDragging = false;
    private isResizing = false;
    private dragPointerId: number | null = null;
    private resizePointerId: number | null = null;
    private resizeDirection: ResizeDirection | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private resizeStartX = 0;
    private resizeStartY = 0;
    private resizeStartBounds: FloatingPanelBounds | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private disposed = false;

    constructor(options: HoverNoteLeafPopoverOptions) {
        this.plugin = options.plugin;
        this.defaultMarkdownMode = options.defaultMarkdownMode === 'source' ? 'source' : 'preview';
        this.onBoundsChange = options.onBoundsChange;
        this.onResize = options.onResize;

        const mount = options.mountEl;
        const defaultBound = options.defaultBound !== false;
        this.rootEl = mount.createDiv({
            cls: `asui-preview-window${defaultBound ? ' asui-preview-window--bound' : ''}`,
            attr: { 'data-asui-preview-window': 'true' }
        });

        this.headerEl = this.rootEl.createDiv({
            cls: 'asui-preview-window-header asui-floating-panel-header'
        });
        const titleWrapEl = this.headerEl.createDiv({
            cls: 'asui-preview-window-title-wrap asui-floating-panel-title-wrap'
        });
        const visibilityPinned = !!options.defaultVisibilityPinned;
        this.visibilityPinBtn = titleWrapEl.createEl('button', {
            cls: 'clickable-icon asui-preview-window-visibility-pin asui-floating-panel-title-icon',
            attr: {
                type: 'button',
                title: t('FLOATING_NOTE_VISIBILITY_PIN'),
                'aria-label': t('FLOATING_NOTE_VISIBILITY_PIN')
            }
        });
        setIcon(this.visibilityPinBtn, 'pin');
        this.visibilityPinBtn.classList.toggle('is-active', visibilityPinned);
        this.visibilityPinBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const next = !this.visibilityPinBtn.classList.contains('is-active');
            this.visibilityPinBtn.classList.toggle('is-active', next);
            options.onVisibilityPinnedChange?.(next);
        });
        this.titleTextEl = titleWrapEl.createDiv({
            cls: 'asui-preview-window-title asui-floating-panel-title',
            text: ''
        });
        const controlsEl = this.headerEl.createDiv({
            cls: 'asui-preview-window-controls asui-floating-panel-controls'
        });

        this.modeToggleBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-preview-window-control asui-floating-panel-control asui-preview-window-control--mode',
            attr: { type: 'button' }
        });
        this.modeToggleBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            void this.toggleMarkdownMode();
        });

        this.bindBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-preview-window-control asui-floating-panel-control asui-preview-window-control--bind',
            attr: { type: 'button', title: t('FLOATING_NOTE_BIND'), 'aria-label': t('FLOATING_NOTE_BIND') }
        });
        setIcon(this.bindBtn, 'link');
        this.bindBtn.classList.toggle('is-active', defaultBound);
        this.bindBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const bound = !this.rootEl.classList.contains('asui-preview-window--bound');
            this.rootEl.toggleClass('asui-preview-window--bound', bound);
            this.bindBtn.classList.toggle('is-active', bound);
            options.onBindChange?.(bound);
        });

        const closeBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-preview-window-control asui-floating-panel-control asui-preview-window-control--close asui-floating-panel-close',
            attr: { type: 'button', title: t('FLOATING_NOTE_CLOSE'), 'aria-label': t('FLOATING_NOTE_CLOSE') }
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            options.onClose();
        });

        const SplitCtor = WorkspaceSplit as unknown as WorkspaceSplitCtor;
        this.rootSplit = new SplitCtor(this.plugin.app.workspace, 'vertical');
        this.wireRootSplitRouting();

        this.bodyEl = this.rootEl.createDiv({ cls: 'asui-preview-window-body' });
        this.bodyEl.appendChild((this.rootSplit as WorkspaceSplitWithDom).containerEl);
        this.attachLeaf();

        this.setPreviewScale(options.previewScale ?? 0.6);

        const defaultWidth = Math.min(560, window.innerWidth - VIEWPORT_MARGIN);
        const defaultHeight = Math.min(480, window.innerHeight - VIEWPORT_MARGIN);
        const b = options.bounds;
        const w = b ? Math.min(b.width, window.innerWidth - VIEWPORT_MARGIN) : defaultWidth;
        const h = b ? Math.min(b.height, window.innerHeight - VIEWPORT_MARGIN) : defaultHeight;
        const left = b ? b.left : Math.max(VIEWPORT_MARGIN, Math.round((window.innerWidth - w) / 2));
        const top = b ? b.top : Math.max(VIEWPORT_MARGIN, Math.round((window.innerHeight - h) / 2));
        this.applyBounds({ left, top, width: w, height: h }, false);

        this.plugin.registerEvent(
            this.plugin.app.workspace.on('layout-change', () => {
                const rs = this.rootSplit as unknown as SplitWithReplace;
                if (!rs.children || typeof rs.replaceChild !== 'function') return;
                rs.children.forEach((item, index) => {
                    if (!(item instanceof WorkspaceTabs)) return;
                    const tabs = item as WorkspaceTabs & { children?: WorkspaceItem[] };
                    const first = tabs.children?.[0];
                    if (first) {
                        rs.replaceChild(index, first);
                    }
                });
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.workspace.on('file-open', file => {
                const view = this.leaf?.view;
                if (!view || !file) return;
                if (view instanceof FileView && view.file === file) {
                    this.syncTitleFromLeaf();
                }
            })
        );

        this.syncModeToggleUi();
        this.headerEl.addEventListener('pointerdown', this.onTitlePointerDown);
        for (const dir of RESIZE_DIRECTIONS) {
            this.rootEl
                .createDiv({
                    cls: `asui-preview-window-resize is-${dir}`,
                    attr: { 'data-direction': dir }
                })
                .addEventListener('pointerdown', this.onResizePointerDown);
        }

        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);

        this.resizeObserver = new ResizeObserver(() => this.emitResize());
        this.resizeObserver.observe(this.rootEl);
    }

    getLeaf(): WorkspaceLeaf | null {
        return this.leaf;
    }

    focus(): void {
        this.rootEl.addClass('asui-preview-window--active');
        if (this.leaf) {
            void this.plugin.app.workspace.setActiveLeaf(this.leaf, { focus: true });
        }
    }

    getBounds(): FloatingPanelBounds {
        return {
            left: this.rootEl.offsetLeft,
            top: this.rootEl.offsetTop,
            width: this.rootEl.offsetWidth,
            height: this.rootEl.offsetHeight
        };
    }

    getPersistedBounds(): FloatingPanelBounds {
        return this.getBounds();
    }

    setPreviewScale(scale: number): void {
        const s = Math.max(0.5, Math.min(1, scale));
        this.rootEl.style.setProperty('--asui-preview-view-content-zoom', String(s));
    }

    setBounds(bounds: FloatingPanelBounds): void {
        this.applyBounds(bounds, true);
    }

    async openFile(file: TFile): Promise<void> {
        const leaf = this.leaf;
        if (!leaf) return;

        // Markdown: same as Hover Editor — open in reading/preview by default; header toggles source like a normal tab.
        if (file.extension === 'md') {
            await leaf.setViewState({
                type: 'markdown',
                state: { file: file.path, mode: this.defaultMarkdownMode },
                active: true
            });
        } else {
            await leaf.openFile(file, { active: true });
        }

        await leaf.loadIfDeferred?.();
        this.syncTitleFromLeaf();
        this.syncModeToggleUi();
        this.requestLeafMeasure();
    }

    destroy(): void {
        this.disposed = true;
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        this.headerEl.removeEventListener('pointerdown', this.onTitlePointerDown);

        this.resizeObserver?.disconnect();
        this.resizeObserver = null;

        if (this.leaf) {
            this.leaf.detach();
            this.leaf = null;
        }

        this.rootEl.remove();
    }

    syncTitleFromLeaf(): void {
        const leaf = this.leaf;
        if (!leaf?.view) {
            this.titleTextEl.setText(t('FLOATING_NOTE_WINDOW_TITLE'));
            return;
        }
        const display = leaf.getDisplayText();
        this.titleTextEl.setText(display || t('FLOATING_NOTE_EMPTY'));
        const path = leaf.view instanceof FileView ? leaf.view.file?.path : undefined;
        if (path) {
            this.titleTextEl.setAttr('data-path', path);
        } else {
            this.titleTextEl.removeAttribute('data-path');
        }
    }

    requestLeafMeasure(): void {
        const leaf = this.leaf;
        if (!leaf) return;
        window.requestAnimationFrame(() => {
            leaf.onResize?.();
            leaf.view?.onResize?.();
        });
    }

    private syncModeToggleUi(): void {
        const view = this.leaf?.view;
        const md = view instanceof MarkdownView ? view : null;
        const show = !!md?.file && md.file.extension === 'md';
        this.modeToggleBtn.style.display = show ? '' : 'none';
        if (!show || !md?.file) {
            return;
        }
        const preview = md.getMode() === 'preview';
        setIcon(this.modeToggleBtn, preview ? 'pencil' : 'book-open');
        const label = preview ? t('FLOATING_NOTE_EDIT') : t('FLOATING_NOTE_PREVIEW');
        this.modeToggleBtn.setAttrs({ title: label, 'aria-label': label });
    }

    private async toggleMarkdownMode(): Promise<void> {
        const leaf = this.leaf;
        if (!leaf) return;
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || !view.file || view.file.extension !== 'md') return;

        const next = view.getMode() === 'preview' ? 'source' : 'preview';
        await leaf.setViewState({
            type: 'markdown',
            state: { file: view.file.path, mode: next },
            active: true
        });
        await leaf.loadIfDeferred?.();
        this.syncModeToggleUi();
        this.requestLeafMeasure();
    }

    private wireRootSplitRouting(): void {
        const ws = this.plugin.app.workspace;
        this.rootSplit.getRoot = () => ws.rootSplit;
        this.rootSplit.getContainer = () => ws.rootSplit;
    }

    private attachLeaf(): void {
        const remove = around(Workspace.prototype, {
            setActiveLeaf: () => {
                return function (this: Workspace) {
                    return;
                };
            }
        });
        try {
            this.leaf = this.plugin.app.workspace.createLeafInParent(this.rootSplit, 0);
        } finally {
            remove();
        }
    }

    private applyBounds(bounds: FloatingPanelBounds, emit: boolean): void {
        const width = Math.max(MIN_WIDTH, Math.min(bounds.width, window.innerWidth - VIEWPORT_MARGIN));
        const height = Math.max(MIN_HEIGHT, Math.min(bounds.height, window.innerHeight - VIEWPORT_MARGIN));
        const maxLeft = Math.max(0, window.innerWidth - width);
        const maxTop = Math.max(0, window.innerHeight - height);
        const left = Math.min(maxLeft, Math.max(0, bounds.left));
        const top = Math.min(maxTop, Math.max(0, bounds.top));

        this.rootEl.style.width = `${width}px`;
        this.rootEl.style.height = `${height}px`;
        this.rootEl.style.left = `${left}px`;
        this.rootEl.style.top = `${top}px`;
        this.rootEl.style.position = 'fixed';

        const layer = getComputedStyle(document.documentElement).getPropertyValue('--layer-popover').trim();
        if (layer) {
            this.rootEl.style.zIndex = layer;
        } else {
            this.rootEl.style.zIndex = 'var(--layer-modal)';
        }

        if (emit) {
            this.onBoundsChange(this.getBounds());
        }
        this.emitResize();
    }

    private emitResize(): void {
        this.onResize?.();
        this.requestLeafMeasure();
    }

    private onTitlePointerDown = (e: PointerEvent): void => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('.asui-preview-window-controls')) return;
        if (target.closest('.asui-preview-window-visibility-pin')) return;

        this.isDragging = true;
        this.dragPointerId = e.pointerId;
        const r = this.rootEl.getBoundingClientRect();
        this.dragOffsetX = e.clientX - r.left;
        this.dragOffsetY = e.clientY - r.top;
        this.headerEl.setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    private onResizePointerDown = (e: PointerEvent): void => {
        if (e.button !== 0) return;
        const handle = e.currentTarget as HTMLElement;
        const dir = handle.dataset.direction as ResizeDirection | undefined;
        if (!dir) return;

        this.isResizing = true;
        this.resizePointerId = e.pointerId;
        this.resizeDirection = dir;
        this.resizeStartX = e.clientX;
        this.resizeStartY = e.clientY;
        this.resizeStartBounds = this.getBounds();
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    };

    private onPointerMove = (e: PointerEvent): void => {
        if (this.disposed) return;
        if (this.isDragging && e.pointerId === this.dragPointerId) {
            const width = this.rootEl.offsetWidth;
            const height = this.rootEl.offsetHeight;
            const left = Math.min(Math.max(0, e.clientX - this.dragOffsetX), window.innerWidth - width);
            const top = Math.min(Math.max(0, e.clientY - this.dragOffsetY), window.innerHeight - height);
            this.applyBounds({ left, top, width, height }, true);
        } else if (this.isResizing && e.pointerId === this.resizePointerId && this.resizeDirection && this.resizeStartBounds) {
            const b = this.getResizedBounds(e);
            if (b) this.applyBounds(b, true);
        }
    };

    private onPointerUp = (e: PointerEvent): void => {
        if (this.disposed) return;
        if (e.pointerId === this.dragPointerId) {
            this.isDragging = false;
            this.dragPointerId = null;
            try {
                this.headerEl.releasePointerCapture(e.pointerId);
            } catch {
                /* noop */
            }
        }
        if (e.pointerId === this.resizePointerId) {
            this.isResizing = false;
            this.resizePointerId = null;
            this.resizeDirection = null;
            this.resizeStartBounds = null;
            try {
                (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
            } catch {
                /* noop */
            }
        }
    };

    private getResizedBounds(event: PointerEvent): FloatingPanelBounds | null {
        if (!this.resizeDirection || !this.resizeStartBounds) return null;

        const deltaX = event.clientX - this.resizeStartX;
        const deltaY = event.clientY - this.resizeStartY;
        const d = this.resizeDirection;

        let left = this.resizeStartBounds.left;
        let top = this.resizeStartBounds.top;
        let width = this.resizeStartBounds.width;
        let height = this.resizeStartBounds.height;

        if (d.includes('e')) width = this.resizeStartBounds.width + deltaX;
        if (d.includes('s')) height = this.resizeStartBounds.height + deltaY;
        if (d.includes('w')) {
            left = this.resizeStartBounds.left + deltaX;
            width = this.resizeStartBounds.width - deltaX;
            if (width < MIN_WIDTH) {
                left -= MIN_WIDTH - width;
                width = MIN_WIDTH;
            }
            if (left < 0) {
                width += left;
                left = 0;
            }
        }
        if (d.includes('n')) {
            top = this.resizeStartBounds.top + deltaY;
            height = this.resizeStartBounds.height - deltaY;
            if (height < MIN_HEIGHT) {
                top -= MIN_HEIGHT - height;
                height = MIN_HEIGHT;
            }
            if (top < 0) {
                height += top;
                top = 0;
            }
        }

        width = Math.max(MIN_WIDTH, width);
        height = Math.max(MIN_HEIGHT, height);
        return { left, top, width, height };
    }
}
