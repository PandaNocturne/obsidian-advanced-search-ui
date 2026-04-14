export interface GraphColorGroupPayload {
    query: string;
}

export interface GraphColorGroupSyncResult {
    applied: boolean;
    mode: 'view-state' | 'dom' | 'none';
}

export class GraphColorGroupService {
    public buildPayloads(queries: string[]): GraphColorGroupPayload[] {
        return queries
            .map(query => query.trim())
            .filter(query => query.length > 0)
            .map(query => ({ query }));
    }

    public syncToLeaf(leaf: unknown, queries: string[]): GraphColorGroupSyncResult {
        const payloads = this.buildPayloads(queries);
        if (payloads.length === 0) {
            this.clearColorGroups(leaf);
            return { applied: false, mode: 'none' };
        }

        if (this.applyByDom(leaf, payloads)) {
            return { applied: true, mode: 'dom' };
        }

        if (this.applyByViewState(leaf, payloads)) {
            return { applied: true, mode: 'view-state' };
        }

        return { applied: false, mode: 'none' };
    }

    public clearColorGroups(leaf: unknown): void {
        this.applyByDom(leaf, []);
        this.applyByViewState(leaf, []);
    }

    private applyByDom(leaf: unknown, payloads: GraphColorGroupPayload[]): boolean {
        const container = this.getContainerEl(leaf);
        if (!(container instanceof HTMLElement)) return false;

        const groupsContainer = container.querySelector('.graph-color-groups-container');
        const addButton = container.querySelector('.graph-color-button-container > button');
        if (!(groupsContainer instanceof HTMLElement) || !(addButton instanceof HTMLButtonElement)) {
            return false;
        }

        this.clearDomGroups(groupsContainer);

        if (payloads.length === 0) {
            return true;
        }

        for (const payload of payloads) {
            addButton.click();
            const groupEl = groupsContainer.lastElementChild;
            if (!(groupEl instanceof HTMLElement)) return false;
            this.populateDomGroup(groupEl, payload);
        }

        return true;
    }

    private clearDomGroups(groupsContainer: HTMLElement): void {
        const existingGroups = Array.from(groupsContainer.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement
        );

        existingGroups.forEach(groupEl => {
            const removeButton = groupEl.querySelector('button[aria-label*="Remove"], button[aria-label*="删除"], .clickable-icon[aria-label*="Remove"], .clickable-icon[aria-label*="删除"]');
            if (removeButton instanceof HTMLElement) {
                removeButton.click();
                return;
            }

            groupEl.remove();
        });
    }

    private populateDomGroup(groupEl: HTMLElement, payload: GraphColorGroupPayload): void {
        const queryInput = this.findGroupQueryInput(groupEl);
        if (queryInput) {
            queryInput.value = payload.query;
            queryInput.dispatchEvent(new Event('input', { bubbles: true }));
            queryInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            queryInput.dispatchEvent(new Event('change', { bubbles: true }));
            queryInput.blur();
        }
    }

    private findGroupQueryInput(groupEl: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
        const directInput = groupEl.querySelector('input[type="search"], input[type="text"], textarea');
        if (directInput instanceof HTMLInputElement || directInput instanceof HTMLTextAreaElement) {
            return directInput;
        }

        const labeledInput = Array.from(groupEl.querySelectorAll('input, textarea')).find(element => {
            if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false;
            const label = [
                element.getAttribute('aria-label'),
                element.getAttribute('placeholder'),
                element.closest('label')?.textContent,
                element.parentElement?.textContent
            ].filter(Boolean).join(' ').toLowerCase();
            return label.includes('query') || label.includes('search') || label.includes('查询') || label.includes('检索');
        });

        return labeledInput instanceof HTMLInputElement || labeledInput instanceof HTMLTextAreaElement ? labeledInput : null;
    }

    private applyByViewState(leaf: unknown, payloads: GraphColorGroupPayload[]): boolean {
        const view = this.getView(leaf);
        if (!view) return false;

        let applied = false;
        const candidates = [view, view.renderer, view.graph, view.engine].filter(Boolean) as Array<Record<string, unknown>>;
        for (const candidate of candidates) {
            const options = this.getObject(candidate, 'options');
            if (options && this.setColorGroupsOnObject(options, payloads)) {
                applied = true;
            }

            const state = this.getObject(candidate, 'state');
            if (state && this.setColorGroupsOnObject(state, payloads)) {
                applied = true;
            }
        }

        const getViewState = this.getFunction(view, 'getViewState');
        const viewState = getViewState ? this.safeCall<Record<string, unknown>>(getViewState, view) : null;
        if (this.setColorGroupsOnObject(viewState, payloads)) {
            const setViewState = this.getFunction(view, 'setViewState');
            if (setViewState) {
                try {
                    void setViewState.call(view, viewState, { focus: false });
                } catch {
                    // ignore and keep any direct mutations that already succeeded
                }
            }
            applied = true;
        }

        if (applied) {
            this.refreshView(view);
        }

        return applied;
    }

    private refreshView(view: Record<string, unknown>): void {
        const methodNames = ['updateOptions', 'update', 'render', 'redraw', 'onOptionsChange'];
        for (const methodName of methodNames) {
            const method = this.getFunction(view, methodName);
            if (!method) continue;
            try {
                method.call(view);
                return;
            } catch {
                // try next refresh method
            }
        }
    }

    private setColorGroupsOnObject(target: unknown, payloads: GraphColorGroupPayload[]): boolean {
        if (!target || typeof target !== 'object') return false;
        const record = target as Record<string, unknown>;

        if ('colorGroups' in record) {
            record.colorGroups = this.clonePayloads(payloads);
            return true;
        }

        if ('groups' in record && Array.isArray(record.groups)) {
            record.groups = this.clonePayloads(payloads);
            return true;
        }

        if ('colorGroup' in record) {
            record.colorGroup = this.clonePayloads(payloads);
            return true;
        }

        return false;
    }

    private clonePayloads(payloads: GraphColorGroupPayload[]): GraphColorGroupPayload[] {
        return payloads.map(payload => ({
            query: payload.query
        }));
    }

    private getView(leaf: unknown): Record<string, unknown> | null {
        if (!leaf || typeof leaf !== 'object') return null;
        const maybeLeaf = leaf as Record<string, unknown>;
        return this.getObject(maybeLeaf, 'view');
    }

    private getContainerEl(leaf: unknown): HTMLElement | null {
        const view = this.getView(leaf);
        const containerEl = view ? this.getObject(view, 'containerEl') : null;
        return containerEl instanceof HTMLElement ? containerEl : null;
    }

    private getObject(source: unknown, key: string): Record<string, unknown> | null {
        if (!source || typeof source !== 'object') return null;
        const value = (source as Record<string, unknown>)[key];
        return value && typeof value === 'object' ? value as Record<string, unknown> : null;
    }

    private getFunction(source: unknown, key: string): (() => unknown) | null {
        if (!source || typeof source !== 'object') return null;
        const value = (source as Record<string, unknown>)[key];
        return typeof value === 'function' ? value as () => unknown : null;
    }

    private safeCall<T>(fn: () => unknown, context: unknown): T | null {
        try {
            return fn.call(context) as T;
        } catch {
            return null;
        }
    }
}