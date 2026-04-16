import { setIcon } from 'obsidian';
import type { FloatingPanelBounds } from '../settings';

export interface FloatingSearchPanelOptions {
    title: string;
    bounds?: FloatingPanelBounds | null;
    mountEl?: HTMLElement;
    onClose: () => void;
    onOpenSettings?: () => void;
    onBoundsChange?: (bounds: FloatingPanelBounds) => void;
    onResize?: (bounds: FloatingPanelBounds) => void;
    onCollapsedChange?: (collapsed: boolean) => void;
    onCompactChange?: (compact: boolean) => void;
}

type PanelStretchMode = 'normal' | 'fullscreen';

export class FloatingSearchPanel {
    public readonly rootEl: HTMLElement;
    public readonly windowEl: HTMLElement;
    public readonly titleEl: HTMLElement;
    public readonly contentEl: HTMLElement;

    private readonly settingsBtn: HTMLButtonElement;
    private readonly collapseBtn: HTMLButtonElement;
    private readonly compactBtn: HTMLButtonElement;
    private readonly fullscreenBtn: HTMLButtonElement;
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
    private stretchMode: PanelStretchMode = 'normal';
    private restoredBounds: FloatingPanelBounds | null = null;

    constructor(options: FloatingSearchPanelOptions) {
        this.onBoundsChange = options.onBoundsChange;
        this.onResize = options.onResize;
        this.onCollapsedChange = options.onCollapsedChange;
        this.onCompactChange = options.onCompactChange;
        const mountEl = options.mountEl ?? document.body;
        this.rootEl = mountEl.createDiv({ cls: 'asui-floating-panel-root' });
        this.windowEl = this.rootEl.createDiv({ cls: 'asui-floating-panel-window' });

        const defaultWidth = Math.min(720, window.innerWidth - 48);
        const defaultHeight = Math.min(560, window.innerHeight - 48);
        const bounds = options.bounds;
        const initialWidth = bounds ? Math.min(bounds.width, window.innerWidth - 24) : defaultWidth;
        const initialHeight = bounds ? Math.min(bounds.height, window.innerHeight - 24) : defaultHeight;
        const initialLeft = bounds ? bounds.left : Math.max(24, Math.round((window.innerWidth - initialWidth) / 2));
        const initialTop = bounds ? bounds.top : Math.max(24, Math.round((window.innerHeight - initialHeight) / 2));

        this.applyBounds(
            {
                left: initialLeft,
                top: initialTop,
                width: initialWidth,
                height: initialHeight
            },
            false
        );
        this.expandedHeight = this.windowEl.offsetHeight;

        const headerEl = this.windowEl.createDiv({ cls: 'asui-floating-panel-header' });
        const titleWrapEl = headerEl.createDiv({ cls: 'asui-floating-panel-title-wrap' });
        const titleIconEl = titleWrapEl.createDiv({ cls: 'asui-floating-panel-title-icon' });
        setIcon(titleIconEl, 'text-search');
        this.titleEl = titleWrapEl.createDiv({ cls: 'asui-floating-panel-title', text: options.title });
        const controlsEl = headerEl.createDiv({ cls: 'asui-floating-panel-controls' });

        this.settingsBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-floating-panel-control asui-floating-panel-settings',
            attr: { type: 'button', 'aria-label': '打开插件设置', title: '打开插件设置' }
        });
        setIcon(this.settingsBtn, 'settings');
        this.settingsBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            options.onOpenSettings?.();
        };

        this.fullscreenBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-floating-panel-control asui-floating-panel-fullscreen',
            attr: { type: 'button', 'aria-label': '全屏显示', title: '全屏显示' }
        });
        setIcon(this.fullscreenBtn, 'maximize');
        this.fullscreenBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleStretchMode('fullscreen');
        };

        this.collapseBtn = controlsEl.createEl('button', {
            cls: 'clickable-icon asui-floating-panel-control asui-floating-panel-collapse',
            attr: { type: 'button', 'aria-label': '折叠面板', title: '折叠面板' }
        });
        setIcon(this.collapseBtn, 'chevrons-down-up');
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

        headerEl.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
        this.resizeObserver = new ResizeObserver(() => this.emitResize());
        this.resizeObserver.observe(this.windowEl);
        this.updateStretchControls();
    }

    public focus() {
        this.rootEl.classList.add('is-active');
    }

    public getBounds(): FloatingPanelBounds {
        return {
            left: this.windowEl.offsetLeft,
            top: this.windowEl.offsetTop,
            width: this.windowEl.offsetWidth,
            height: this.windowEl.offsetHeight
        };
    }

    public getPersistedBounds(): FloatingPanelBounds {
        return this.stretchMode === 'fullscreen'
            ? { ...(this.restoredBounds ?? this.getBounds()) }
            : this.getBounds();
    }

    public destroy() {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        this.rootEl.remove();
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

        if (collapsed) {
            const headerHeight = this.windowEl.querySelector('.asui-floating-panel-header')?.clientHeight ?? 48;
            this.windowEl.style.height = `${headerHeight}px`;
        } else if (this.stretchMode === 'fullscreen') {
            this.applyStretchBounds();
            return;
        } else if (this.expandedHeight) {
            this.windowEl.style.height = `${this.expandedHeight}px`;
        }

        this.onCollapsedChange?.(collapsed);
        this.emitResize();
    }

    private toggleStretchMode(nextMode: Exclude<PanelStretchMode, 'normal'>) {
        const mode = this.stretchMode === nextMode ? 'normal' : nextMode;
        this.setStretchMode(mode);
    }

    private setStretchMode(mode: PanelStretchMode) {
        if (this.stretchMode === mode) return;

        if (mode === 'normal') {
            this.restoreBounds();
        } else {
            this.captureRestoreBounds();
            this.applyStretchBounds();
        }

        this.stretchMode = mode;
        this.windowEl.classList.toggle('is-fullscreen', mode === 'fullscreen');
        this.updateStretchControls();
        this.emitResize();
    }

    private captureRestoreBounds() {
        if (this.stretchMode !== 'normal') return;
        this.restoredBounds = this.getBounds();
    }

    private restoreBounds() {
        const bounds = this.restoredBounds;
        if (!bounds) return;
        this.applyBounds(bounds, false);
        this.restoredBounds = null;
    }

    private getTopSafeInset() {
        const appContainerEl = document.body.querySelector('.app-container, .workspace-split') as HTMLElement | null;
        const headerEl = this.windowEl.querySelector('.asui-floating-panel-header') as HTMLElement | null;
        const titlebarHeight = Math.max(0, appContainerEl?.offsetTop ?? 0);
        const headerBuffer = Math.max(12, Math.ceil((headerEl?.offsetHeight ?? 40) * 1));
        return titlebarHeight + headerBuffer;
    }

    private applyStretchBounds() {
        const margin = 56;
        const topSafeInset = this.getTopSafeInset();
        const fullWidth = Math.max(420, window.innerWidth - margin * 2);
        const fullHeight = Math.max(260, window.innerHeight - topSafeInset - margin);

        this.applyBounds(
            {
                left: margin,
                top: topSafeInset,
                width: fullWidth,
                height: fullHeight
            },
            false
        );
    }

    private updateStretchControls() {
        this.fullscreenBtn.classList.toggle('is-active', this.stretchMode === 'fullscreen');
        setIcon(this.fullscreenBtn, this.stretchMode === 'fullscreen' ? 'minimize' : 'maximize');
    }

    private applyBounds(bounds: FloatingPanelBounds, emit = true) {
        const width = Math.max(420, Math.min(bounds.width, window.innerWidth - 24));
        const height = Math.max(260, Math.min(bounds.height, window.innerHeight - 24));
        const topSafeInset = this.getTopSafeInset();
        const maxLeft = Math.max(0, window.innerWidth - width);
        const maxTop = Math.max(topSafeInset, window.innerHeight - height);
        const left = Math.min(maxLeft, Math.max(0, bounds.left));
        const top = Math.min(maxTop, Math.max(topSafeInset, bounds.top));

        this.windowEl.style.width = `${width}px`;
        this.windowEl.style.height = `${height}px`;
        this.windowEl.style.left = `${left}px`;
        this.windowEl.style.top = `${top}px`;

        if (emit) {
            this.emitBoundsChange();
        }
    }

    private emitBoundsChange() {
        if (this.stretchMode === 'fullscreen') return;
        this.onBoundsChange?.(this.getBounds());
    }

    private emitResize() {
        const bounds = this.getBounds();
        if (this.stretchMode !== 'fullscreen') {
            this.onBoundsChange?.(bounds);
        }
        this.onResize?.(bounds);
    }

    private onPointerDown = (event: PointerEvent) => {
        if (!(event.target instanceof HTMLElement)) return;
        if (event.target.closest('button')) return;
        if (this.stretchMode === 'fullscreen') return;

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

        const topSafeInset = this.getTopSafeInset();
        const maxLeft = Math.max(0, window.innerWidth - this.windowEl.offsetWidth);
        const maxTop = Math.max(topSafeInset, window.innerHeight - this.windowEl.offsetHeight);
        const nextLeft = Math.min(maxLeft, Math.max(0, event.clientX - this.dragOffsetX));
        const nextTop = Math.min(maxTop, Math.max(topSafeInset, event.clientY - this.dragOffsetY));

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