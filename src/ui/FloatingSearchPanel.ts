import type { FloatingPanelBounds } from '../settings';

export interface FloatingSearchPanelOptions {
    title: string;
    bounds?: FloatingPanelBounds | null;
    onClose: () => void;
    onBoundsChange?: (bounds: FloatingPanelBounds) => void;
}

export class FloatingSearchPanel {
    public readonly rootEl: HTMLElement;
    public readonly windowEl: HTMLElement;
    public readonly titleEl: HTMLElement;
    public readonly contentEl: HTMLElement;

    private readonly closeBtn: HTMLButtonElement;
    private readonly onBoundsChange?: (bounds: FloatingPanelBounds) => void;
    private isDragging = false;
    private dragPointerId: number | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private resizeObserver: ResizeObserver | null = null;

    constructor(options: FloatingSearchPanelOptions) {
        this.onBoundsChange = options.onBoundsChange;
        this.rootEl = document.body.createDiv({ cls: 'asui-floating-panel-root' });
        this.windowEl = this.rootEl.createDiv({ cls: 'asui-floating-panel-window' });

        const defaultWidth = Math.min(720, window.innerWidth - 48);
        const defaultHeight = Math.min(560, window.innerHeight - 48);
        const bounds = options.bounds;
        const initialWidth = bounds ? Math.min(bounds.width, window.innerWidth - 24) : defaultWidth;
        const initialHeight = bounds ? Math.min(bounds.height, window.innerHeight - 24) : defaultHeight;
        const initialLeft = bounds ? bounds.left : Math.max(24, Math.round((window.innerWidth - initialWidth) / 2));
        const initialTop = bounds ? bounds.top : Math.max(24, Math.round((window.innerHeight - initialHeight) / 2));

        this.applyBounds({
            left: initialLeft,
            top: initialTop,
            width: initialWidth,
            height: initialHeight
        }, false);

        const headerEl = this.windowEl.createDiv({ cls: 'asui-floating-panel-header' });
        this.titleEl = headerEl.createDiv({ cls: 'asui-floating-panel-title', text: options.title });

        this.closeBtn = headerEl.createEl('button', {
            cls: 'clickable-icon asui-floating-panel-close',
            attr: { type: 'button', 'aria-label': options.title }
        });
        this.closeBtn.setText('×');
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
        this.resizeObserver = new ResizeObserver(() => this.emitBoundsChange());
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