import { setIcon } from 'obsidian';
import type { FloatingPanelBounds } from '../settings';

export interface FloatingSearchPanelOptions {
    title: string;
    bounds?: FloatingPanelBounds | null;
    onClose: () => void;
    onBoundsChange?: (bounds: FloatingPanelBounds) => void;
    onResize?: (bounds: FloatingPanelBounds) => void;
    onCollapsedChange?: (collapsed: boolean) => void;
    onCompactChange?: (compact: boolean) => void;
    opacity?: number;
}

export class FloatingSearchPanel {
    public readonly rootEl: HTMLElement;
    public readonly windowEl: HTMLElement;
    public readonly titleEl: HTMLElement;
    public readonly contentEl: HTMLElement;

    private readonly collapseBtn: HTMLButtonElement;
    private readonly compactBtn: HTMLButtonElement;
    private readonly closeBtn: HTMLButtonElement;
    private readonly onBoundsChange?: (bounds: FloatingPanelBounds) => void;
    private readonly onResize?: (bounds: FloatingPanelBounds) => void;
    private readonly onCollapsedChange?: (collapsed: boolean) => void;
    private readonly onCompactChange?: (compact: boolean) => void;
    private isDragging = false;
    private isCollapsed = false;
    private isCompact = false;
    private dragPointerId: number | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private resizeObserver: ResizeObserver | null = null;
    private expandedHeight: number | null = null;

    constructor(options: FloatingSearchPanelOptions) {
        this.onBoundsChange = options.onBoundsChange;
        this.onResize = options.onResize;
        this.onCollapsedChange = options.onCollapsedChange;
        this.onCompactChange = options.onCompactChange;
        this.rootEl = document.body.createDiv({ cls: 'asui-floating-panel-root' });
        this.windowEl = this.rootEl.createDiv({ cls: 'asui-floating-panel-window' });

        const defaultWidth = Math.min(720, window.innerWidth - 48);
        const defaultHeight = Math.min(560, window.innerHeight - 48);
        const bounds = options.bounds;
        const initialWidth = bounds ? Math.min(bounds.width, window.innerWidth - 24) : defaultWidth;
        const initialHeight = bounds ? Math.min(bounds.height, window.innerHeight - 24) : defaultHeight;
        const initialLeft = Math.max(24, Math.round((window.innerWidth - initialWidth) / 2));
        const initialTop = Math.max(24, Math.round((window.innerHeight - initialHeight) / 2));

        this.applyBounds({
            left: initialLeft,
            top: initialTop,
            width: initialWidth,
            height: initialHeight
        }, false);
        this.expandedHeight = this.windowEl.offsetHeight;

        const headerEl = this.windowEl.createDiv({ cls: 'asui-floating-panel-header' });
        this.titleEl = headerEl.createDiv({ cls: 'asui-floating-panel-title', text: options.title });
        const controlsEl = headerEl.createDiv({ cls: 'asui-floating-panel-controls' });

        this.collapseBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-floating-panel-control asui-floating-panel-collapse',
            attr: { type: 'button', 'aria-label': '折叠面板', title: '折叠面板' }
        });
        setIcon(this.collapseBtn, 'minus');
        this.collapseBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            this.setCollapsed(!this.isCollapsed);
        };

        this.compactBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-floating-panel-control asui-floating-panel-compact',
            attr: { type: 'button', 'aria-label': '简化控件', title: '简化控件' }
        });
        setIcon(this.compactBtn, 'hat-glasses');
        this.compactBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            this.setCompact(!this.isCompact);
        };

        this.closeBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-floating-panel-control asui-floating-panel-close',
            attr: { type: 'button', 'aria-label': options.title, title: '关闭面板' }
        });
        setIcon(this.closeBtn, 'x');
        this.closeBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            options.onClose();
        };

        this.contentEl = this.windowEl.createDiv({ cls: 'asui-floating-panel-content' });
        this.setOpacity(options.opacity ?? 1);

        headerEl.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
        this.resizeObserver = new ResizeObserver(() => this.emitResize());
        this.resizeObserver.observe(this.windowEl);
    }

    public focus() {
        this.rootEl.classList.add('is-active');
        this.windowEl.style.zIndex = '1000';
    }

    public getBounds(): FloatingPanelBounds {
        return {
            left: this.windowEl.offsetLeft,
            top: this.windowEl.offsetTop,
            width: this.windowEl.offsetWidth,
            height: this.windowEl.offsetHeight
        };
    }

    public destroy() {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        this.rootEl.remove();
    }

    public setOpacity(opacity: number) {
        this.contentEl.style.opacity = `${Math.max(0.2, Math.min(opacity, 1))}`;
    }

    public setCompact(compact: boolean) {
        this.isCompact = compact;
        this.windowEl.classList.toggle('is-compact', compact);
        this.compactBtn.classList.toggle('is-active', compact);
        this.onCompactChange?.(compact);
        this.emitResize();
    }

    public setCollapsed(collapsed: boolean) {
        if (this.isCollapsed === collapsed) return;

        if (collapsed) {
            this.expandedHeight = this.windowEl.offsetHeight;
        }

        this.isCollapsed = collapsed;
        this.windowEl.classList.toggle('is-collapsed', collapsed);
        this.collapseBtn.classList.toggle('is-active', collapsed);
        setIcon(this.collapseBtn, collapsed ? 'plus' : 'minus');

        if (collapsed) {
            const headerHeight = this.windowEl.querySelector('.asui-floating-panel-header')?.clientHeight ?? 48;
            this.windowEl.style.height = `${headerHeight}px`;
        } else if (this.expandedHeight) {
            this.windowEl.style.height = `${this.expandedHeight}px`;
        }

        this.onCollapsedChange?.(collapsed);
        this.emitResize();
    }

    private applyBounds(bounds: FloatingPanelBounds, emit = true) {
        const width = Math.max(420, Math.min(bounds.width, window.innerWidth - 24));
        const height = Math.max(260, Math.min(bounds.height, window.innerHeight - 24));
        const maxLeft = Math.max(0, window.innerWidth - width);
        const maxTop = Math.max(0, window.innerHeight - height);
        const left = Math.min(maxLeft, Math.max(0, bounds.left));
        const top = Math.min(maxTop, Math.max(0, bounds.top));

        this.windowEl.style.width = `${width}px`;
        this.windowEl.style.height = `${height}px`;
        this.windowEl.style.left = `${left}px`;
        this.windowEl.style.top = `${top}px`;

        if (emit) {
            this.emitBoundsChange();
        }
    }

    private emitBoundsChange() {
        this.onBoundsChange?.(this.getBounds());
    }

    private emitResize() {
        const bounds = this.getBounds();
        this.onBoundsChange?.(bounds);
        this.onResize?.(bounds);
    }

    private onPointerDown = (event: PointerEvent) => {
        if (!(event.target instanceof HTMLElement)) return;
        if (event.target.closest('button')) return;

        const rect = this.windowEl.getBoundingClientRect();
        this.isDragging = true;
        this.dragPointerId = event.pointerId;
        this.dragOffsetX = event.clientX - rect.left;
        this.dragOffsetY = event.clientY - rect.top;
        this.focus();
        event.preventDefault();
    };

    private onPointerMove = (event: PointerEvent) => {
        if (!this.isDragging || this.dragPointerId !== event.pointerId) return;

        const maxLeft = Math.max(0, window.innerWidth - this.windowEl.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - this.windowEl.offsetHeight);
        const nextLeft = Math.min(maxLeft, Math.max(0, event.clientX - this.dragOffsetX));
        const nextTop = Math.min(maxTop, Math.max(0, event.clientY - this.dragOffsetY));

        this.windowEl.style.left = `${nextLeft}px`;
        this.windowEl.style.top = `${nextTop}px`;
        this.emitBoundsChange();
    };

    private onPointerUp = (event: PointerEvent) => {
        if (this.dragPointerId !== event.pointerId) return;
        this.isDragging = false;
        this.dragPointerId = null;
        this.emitBoundsChange();
    };
}