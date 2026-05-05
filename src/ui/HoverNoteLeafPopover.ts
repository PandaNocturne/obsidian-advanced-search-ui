import { around } from 'monkey-around';
import type { FloatingPanelBounds } from '../settings';
import { FileView, Plugin, setIcon, TFile, Workspace, WorkspaceItem, WorkspaceLeaf, WorkspaceSplit, WorkspaceTabs } from 'obsidian';

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
    onClose: () => void;
    onBoundsChange: (bounds: FloatingPanelBounds) => void;
    onResize?: () => void;
}

/**
 * Hover Editor–style shell: core {@link WorkspaceSplit} + {@link WorkspaceLeaf} inside Obsidian popover markup.
 * Mirrors nothingislost/obsidian-hover-editor’s leaf-in-popover approach (no custom note body / toolbar).
 */
export class HoverNoteLeafPopover {
    readonly hoverEl: HTMLElement;
    private readonly containerEl: HTMLElement;
    private readonly titleBarEl: HTMLElement;
    private readonly titleTextEl: HTMLElement;
    private readonly rootSplit: WorkspaceSplit;
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
        this.onBoundsChange = options.onBoundsChange;
        this.onResize = options.onResize;

        const mount = options.mountEl;
        this.hoverEl = mount.createDiv({
            cls: 'popover hover-popover hover-editor asui-hover-note-popover show-navbar',
            attr: { 'data-asui-hover-note': 'true' }
        });
        this.hoverEl.toggleClass('is-pinned', true);

        this.containerEl = this.hoverEl.createDiv({ cls: 'popover-content' });
        this.titleBarEl = this.containerEl.createDiv({ cls: 'popover-titlebar' });
        this.titleTextEl = this.titleBarEl.createDiv({ cls: 'popover-title', text: '' });
        const actionsEl = this.titleBarEl.createDiv({ cls: 'popover-actions' });
        const closeEl = actionsEl.createEl('a', {
            cls: 'popover-action mod-close',
            attr: { 'aria-label': 'Close' }
        });
        setIcon(closeEl, 'x');
        closeEl.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            options.onClose();
        });

        const SplitCtor = WorkspaceSplit as unknown as WorkspaceSplitCtor;
        this.rootSplit = new SplitCtor(this.plugin.app.workspace, 'vertical');
        this.wireRootSplitRouting();

        this.titleBarEl.insertAdjacentElement('afterend', (this.rootSplit as WorkspaceSplitWithDom).containerEl);
        this.attachLeaf();

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

        this.titleBarEl.addEventListener('pointerdown', this.onTitlePointerDown);
        for (const dir of RESIZE_DIRECTIONS) {
            this.hoverEl
                .createDiv({
                    cls: `asui-hover-note-resize is-${dir}`,
                    attr: { 'data-direction': dir }
                })
                .addEventListener('pointerdown', this.onResizePointerDown);
        }

        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);

        this.resizeObserver = new ResizeObserver(() => this.emitResize());
        this.resizeObserver.observe(this.hoverEl);
    }

    getLeaf(): WorkspaceLeaf | null {
        return this.leaf;
    }

    focus(): void {
        this.hoverEl.addClass('is-active');
        if (this.leaf) {
            void this.plugin.app.workspace.setActiveLeaf(this.leaf, { focus: true });
        }
    }

    getBounds(): FloatingPanelBounds {
        return {
            left: this.hoverEl.offsetLeft,
            top: this.hoverEl.offsetTop,
            width: this.hoverEl.offsetWidth,
            height: this.hoverEl.offsetHeight
        };
    }

    getPersistedBounds(): FloatingPanelBounds {
        return this.getBounds();
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
                state: { file: file.path, mode: 'preview' },
                active: true
            });
        } else {
            await leaf.openFile(file, { active: true });
        }

        await leaf.loadIfDeferred?.();
        this.syncTitleFromLeaf();
        this.requestLeafMeasure();
    }

    async showEmpty(): Promise<void> {
        const leaf = this.leaf;
        if (!leaf) return;
        await leaf.setViewState({ type: 'empty', active: true });
        this.titleTextEl.setText('');
        this.requestLeafMeasure();
    }

    destroy(): void {
        this.disposed = true;
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        this.titleBarEl.removeEventListener('pointerdown', this.onTitlePointerDown);

        this.resizeObserver?.disconnect();
        this.resizeObserver = null;

        if (this.leaf) {
            this.leaf.detach();
            this.leaf = null;
        }

        this.hoverEl.remove();
    }

    syncTitleFromLeaf(): void {
        const leaf = this.leaf;
        if (!leaf?.view) {
            this.titleTextEl.setText('');
            return;
        }
        this.titleTextEl.setText(leaf.getDisplayText());
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

        void this.showEmpty();
    }

    private applyBounds(bounds: FloatingPanelBounds, emit: boolean): void {
        const width = Math.max(MIN_WIDTH, Math.min(bounds.width, window.innerWidth - VIEWPORT_MARGIN));
        const height = Math.max(MIN_HEIGHT, Math.min(bounds.height, window.innerHeight - VIEWPORT_MARGIN));
        const maxLeft = Math.max(0, window.innerWidth - width);
        const maxTop = Math.max(0, window.innerHeight - height);
        const left = Math.min(maxLeft, Math.max(0, bounds.left));
        const top = Math.min(maxTop, Math.max(0, bounds.top));

        this.hoverEl.style.width = `${width}px`;
        this.hoverEl.style.height = `${height}px`;
        this.hoverEl.style.left = `${left}px`;
        this.hoverEl.style.top = `${top}px`;
        this.hoverEl.style.position = 'fixed';

        const layer = getComputedStyle(document.documentElement).getPropertyValue('--layer-popover').trim();
        if (layer) {
            this.hoverEl.style.zIndex = layer;
        } else {
            this.hoverEl.style.zIndex = 'var(--layer-modal)';
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
        if (target.closest('.popover-action')) return;

        this.isDragging = true;
        this.dragPointerId = e.pointerId;
        const r = this.hoverEl.getBoundingClientRect();
        this.dragOffsetX = e.clientX - r.left;
        this.dragOffsetY = e.clientY - r.top;
        this.titleBarEl.setPointerCapture(e.pointerId);
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
            const width = this.hoverEl.offsetWidth;
            const height = this.hoverEl.offsetHeight;
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
                this.titleBarEl.releasePointerCapture(e.pointerId);
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
