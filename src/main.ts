import { Notice, Plugin, setIcon } from 'obsidian';
import { t } from './lang/helpers';
import { AdvancedSearchSettings, DEFAULT_SETTINGS } from './settings';
import { AdvancedSearchSettingTab } from './ui/settings-tab';
import { SearchRow, SearchRowDelegate } from './components/SearchRow';
import { QueryParser } from './utils/QueryParser';

/**
 * 高级检索 UI 插件的主入口类
 * 负责 UI 的生命周期管理、容器注入、以及全局的搜索指令执行
 */
export default class AdvancedSearchPlugin extends Plugin implements SearchRowDelegate {
    public settings: AdvancedSearchSettings;

    private containerRows: Map<HTMLElement, SearchRow[]> = new Map();
    private injectionInterval: number | null = null;
    private observer: MutationObserver | null = null;

    async onload() {
        await this.loadSettings();

        if (this.settings.autoScaleUI) {
            document.body.classList.add('advanced-search-auto-scale');
        }

        this.app.workspace.onLayoutReady(() => this.injectSearchUI());
        this.registerEvent(this.app.workspace.on('layout-change', () => this.injectSearchUI()));
        this.updateInterval();
        this.addSettingTab(new AdvancedSearchSettingTab(this.app, this));
    }

    public updateInterval() {
        if (this.settings.adaptToFloatSearch) {
            if (!this.injectionInterval) {
                this.injectionInterval = window.setInterval(() => this.injectSearchUI(), 500);
                this.registerInterval(this.injectionInterval);
            }

            if (!this.observer) {
                this.observer = new MutationObserver((mutations) => {
                    let shouldInject = false;
                    for (const mutation of mutations) {
                        if (mutation.addedNodes.length > 0) {
                            for (const node of Array.from(mutation.addedNodes)) {
                                if (node instanceof HTMLElement) {
                                    if (node.classList.contains('search-form-container') || node.classList.contains('advanced-search-view-switch')) {
                                        continue;
                                    }

                                    if (
                                        node.classList.contains('modal-container') ||
                                        node.classList.contains('search-view-outer') ||
                                        node.classList.contains('search-row') ||
                                        node.classList.contains('search-params') ||
                                        node.classList.contains('float-search-view-switch')
                                    ) {
                                        shouldInject = true;
                                        break;
                                    }
                                    if (node.tagName === 'DIV' && node.querySelector('.search-params')) {
                                        shouldInject = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (shouldInject) break;
                    }
                    if (shouldInject) {
                        this.injectSearchUI();
                    }
                });
                this.observer.observe(document.body, { childList: true, subtree: true });
            }
        } else {
            if (this.injectionInterval) {
                window.clearInterval(this.injectionInterval);
                this.injectionInterval = null;
            }
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData() as Partial<AdvancedSearchSettings>));
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        document.body.classList.remove('advanced-search-auto-scale');
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.injectionInterval) {
            window.clearInterval(this.injectionInterval);
            this.injectionInterval = null;
        }

        document.querySelectorAll('.search-form-container').forEach(container => container.remove());
        document.querySelectorAll('.advanced-search-ui-toggle-wrapper').forEach(btn => btn.remove());
        this.containerRows.clear();
    }

    private injectSearchUI() {
        const searchContainers = new Set<HTMLElement>();

        this.app.workspace.getLeavesOfType('search').forEach(leaf => searchContainers.add(leaf.view.containerEl));

        if (this.settings.adaptToFloatSearch) {
            document.querySelectorAll('.search-params').forEach(searchParams => {
                let parent = searchParams.parentElement;
                while (parent && !parent.querySelector('.search-input-container') && !parent.classList.contains('modal')) {
                    parent = parent.parentElement;
                }
                if (parent) searchContainers.add(parent);
            });
        }

        searchContainers.forEach(searchContainer => {
            const searchParams = searchContainer.querySelector('.search-params') as HTMLElement;
            if (!searchParams) return;

            if (!searchContainer.querySelector('.search-form-container')) {
                const queryControlsContainer = searchParams.createDiv({ cls: 'search-form-container' });
                if (this.settings.defaultCollapsed) {
                    queryControlsContainer.classList.add('is-hidden');
                }

                queryControlsContainer.createDiv({ cls: 'search-section' });

                const navButtons = queryControlsContainer.createDiv({ cls: 'navigation-buttons' });
                this.createNavButton(navButtons, t('IMPORT_BUTTON'), 'import-button', () => this.importFromSearchBox(queryControlsContainer));
                this.createNavButton(navButtons, t('COPY_BUTTON'), 'copy-button', () => { void this.copySearchQuery(queryControlsContainer); });

                const isModal = searchContainer.closest('.modal-container') || searchContainer.closest('.modal');
                if (!isModal) {
                    this.createNavButton(navButtons, t('GRAPH_BUTTON'), 'graph-button', () => this.openGraphView(queryControlsContainer, true));
                }

                this.createNavButton(navButtons, t('SEARCH_BUTTON'), 'search-button', () => this.executeSearch(queryControlsContainer));
                this.createNavButton(navButtons, t('RESET_BUTTON'), 'reset-button', () => this.clearSearchForm(queryControlsContainer));

                this.containerRows.set(queryControlsContainer, []);
                this.handleKeyboardEvents(queryControlsContainer);

                const searchRowEl = searchContainer.querySelector('.search-row') as HTMLElement;
                if (searchRowEl) {
                    searchRowEl.insertAdjacentElement('afterend', queryControlsContainer);
                } else {
                    searchParams.prepend(queryControlsContainer);
                }

                this.clearSearchForm(queryControlsContainer, 2);
            }

            const searchRow = searchContainer.querySelector('.search-row') as HTMLElement;
            if (searchRow && !searchRow.querySelector('.advanced-search-ui-toggle-wrapper')) {
                const switchWrapper = searchRow.createDiv({ cls: 'advanced-search-ui-toggle-wrapper' });
                const toggleBtn = switchWrapper.createEl('div', {
                    cls: 'clickable-icon advanced-search-toggle',
                    attr: { 'aria-label': t('TOGGLE_ADVANCED_SEARCH') || 'Toggle advanced search' }
                });

                if (!this.settings.defaultCollapsed) {
                    toggleBtn.classList.add('is-active');
                }

                setIcon(toggleBtn, 'list-filter');

                toggleBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const queryControlsContainer = searchContainer.querySelector('.search-form-container') as HTMLElement;
                    if (queryControlsContainer) {
                        const isHidden = queryControlsContainer.classList.toggle('is-hidden');
                        if (isHidden) {
                            toggleBtn.classList.remove('is-active');
                        } else {
                            toggleBtn.classList.add('is-active');
                        }
                    }
                };
            }
        });
    }

    private createNavButton(parent: HTMLElement, text: string, cls: string, clickHandler: () => void) {
        const btn = parent.createEl('button', { text, cls, attr: { type: 'button' } });
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            clickHandler();
        };
        return btn;
    }

    private handleKeyboardEvents(container: HTMLElement) {
        const handleKeydown = (e: KeyboardEvent) => {
            e.stopPropagation();
            const active = document.activeElement as HTMLElement;
            if (!active) return;

            if (['INPUT', 'SELECT', 'BUTTON'].includes(active.tagName)) {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const focusableElements = Array.from(container.querySelectorAll('.search-input')).filter((el: Element) => {
                        const htmlEl = el as HTMLElement;
                        const style = window.getComputedStyle(htmlEl);
                        return style.display !== 'none' && style.visibility !== 'hidden' && !htmlEl.hasAttribute('disabled');
                    });

                    if (focusableElements.length > 0) {
                        const index = focusableElements.indexOf(active);
                        let nextIndex = 0;
                        if (index > -1) {
                            nextIndex = e.shiftKey ? index - 1 : index + 1;
                            if (nextIndex < 0) nextIndex = focusableElements.length - 1;
                            if (nextIndex >= focusableElements.length) nextIndex = 0;
                        } else if (e.shiftKey) {
                            nextIndex = focusableElements.length - 1;
                        }

                        (focusableElements[nextIndex] as HTMLElement).focus();
                    }
                } else if (active.tagName === 'INPUT') {
                    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                    if (keys.includes(e.key)) {
                        const inputActive = active as HTMLInputElement;
                        const start = inputActive.selectionStart;
                        const end = inputActive.selectionEnd;
                        if (start !== null && end !== null) {
                            const len = inputActive.value.length;
                            let newPos = start;
                            if (e.key === 'ArrowLeft') newPos = Math.max(0, (e.shiftKey ? (inputActive.selectionDirection === 'backward' ? start : end) : start) - 1);
                            else if (e.key === 'ArrowRight') newPos = Math.min(len, (e.shiftKey ? (inputActive.selectionDirection === 'backward' ? start : end) : end) + 1);
                            else if (e.key === 'Home') newPos = 0;
                            else if (e.key === 'End') newPos = len;

                            if (e.shiftKey) {
                                inputActive.setSelectionRange(start, newPos);
                            } else {
                                inputActive.setSelectionRange(newPos, newPos);
                            }
                        }
                    }
                }
            }
        };
        container.addEventListener('keydown', handleKeydown as EventListener);
        container.addEventListener('keyup', (e) => e.stopPropagation());
        container.addEventListener('keypress', (e) => e.stopPropagation());
    }

    onAddRow(currentRow: SearchRow) {
        const container = currentRow.container.parentElement?.parentElement as HTMLElement;
        const rows = this.containerRows.get(container);
        if (!rows) return;

        const index = rows.indexOf(currentRow);
        const section = container.querySelector('.search-section') as HTMLElement;

        const newRow = new SearchRow(this.app, section, this);
        currentRow.container.parentNode?.insertBefore(newRow.container, currentRow.container.nextSibling);
        rows.splice(index + 1, 0, newRow);

        newRow.setData({
            type: currentRow.typeSelect.value,
            operator: currentRow.operatorSelect.value
        });
    }

    onRemoveRow(currentRow: SearchRow) {
        const container = currentRow.container.parentElement?.parentElement as HTMLElement;
        const rows = this.containerRows.get(container);
        if (!rows) return;

        if (rows.length > 1) {
            const index = rows.indexOf(currentRow);
            rows.splice(index, 1);
            currentRow.destroy();
        } else {
            currentRow.clear();
        }
    }

    onExecuteSearch() {
        this.executeSearch();
    }

    onOperatorChange(currentRow: SearchRow) {
        if (!this.settings.autoSearchOnOperatorChange) return;

        const container = currentRow.container.parentElement?.parentElement as HTMLElement;
        if (!container) return;

        this.executeSearch(container);
    }

    private executeSearch(uiContainer?: HTMLElement) {
        const containers = this.settings.adaptToFloatSearch
            ? Array.from(document.querySelectorAll('.search-params')).map(el => el.parentElement).filter(el => el)
            : this.app.workspace.getLeavesOfType('search').map(l => l.view.containerEl);

        const uniqueContainers = Array.from(new Set(containers as HTMLElement[]));

        uniqueContainers.forEach(containerEl => {
            const currentUI = containerEl.querySelector('.search-form-container') as HTMLElement;
            if (!currentUI) return;
            if (uiContainer && currentUI !== uiContainer) return;

            const queryValue = this.convertToObsidianQuery(currentUI);
            const isModal = containerEl.closest('.modal-container') || containerEl.closest('.modal');
            if (this.settings.searchAlsoGraph && !isModal) {
                this.openGraphView(currentUI, false);
            }

            const searchInput = containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = queryValue;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.focus();

                if (!containerEl.closest('.modal-container') && !containerEl.closest('.modal')) {
                    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }
            }
        });
    }

    private convertToObsidianQuery(container: HTMLElement, lineBreak = false): string {
        const rows = this.containerRows.get(container) || [];
        const queryParts: string[] = [];
        let hasEffectiveCondition = false;

        rows.forEach(row => {
            const value = row.getValue();
            if (!value) return;

            const op = row.operatorSelect.value;
            const typePrefix = row.typeSelect.value === 'all' ? '' : `${row.typeSelect.value}:`;
            const isCase = row.caseInput.checked;
            const isRegex = row.regexInput.checked;

            let searchTerm = value;
            if (isRegex) {
                searchTerm = `/${searchTerm}/`;
            } else if (row.typeSelect.value === 'tag') {
                searchTerm = searchTerm.split(' ').map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
            } else {
                searchTerm = `(${searchTerm})`;
            }

            if (isCase) searchTerm = `match-case:${searchTerm}`;

            let part = '';
            if (!hasEffectiveCondition) {
                part = op === 'NOT'
                    ? `-(${typePrefix}${searchTerm})`
                    : `(${typePrefix}${searchTerm})`;
            } else {
                switch (op) {
                    case 'AND': part = `(${typePrefix}${searchTerm})`; break;
                    case 'OR': part = `OR (${typePrefix}${searchTerm})`; break;
                    case 'NOT': part = `-(${typePrefix}${searchTerm})`; break;
                }
            }

            queryParts.push(part);
            hasEffectiveCondition = true;
        });

        return lineBreak ? queryParts.join('\n') : queryParts.join(' ');
    }

    private importFromSearchBox(uiContainer: HTMLElement) {
        let searchInput: HTMLInputElement | null = null;

        const leaf = this.app.workspace.getLeavesOfType('search').find(l => l.view.containerEl.contains(uiContainer));
        if (leaf) {
            searchInput = leaf.view.containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
        }

        if (!searchInput) {
            const container = uiContainer.closest('.workspace-leaf-content, .view-content, .search-view, .float-search-container, .modal-container') as HTMLElement;
            if (container) {
                searchInput = container.querySelector('.search-input-container input, input[type="search"]') as HTMLInputElement;
            }

            if (!searchInput && uiContainer.parentElement) {
                searchInput = uiContainer.parentElement.querySelector('.search-input-container input, input[type="search"]') as HTMLInputElement;
            }
        }

        if (!searchInput || !searchInput.value.trim()) {
            new Notice(t('NO_QUERY_TO_IMPORT'));
            return;
        }

        const query = searchInput.value.trim();
        const parsedRows = QueryParser.parse(query);

        if (parsedRows.length === 0) {
            new Notice(t('NO_QUERY_TO_IMPORT'));
            return;
        }

        const section = uiContainer.querySelector('.search-section') as HTMLElement;
        if (!section) return;

        const existingRows = this.containerRows.get(uiContainer) || [];
        const shouldReplace = this.settings.importMode === 'replace';
        const hasMeaningfulExistingRows = existingRows.some(row => !!row.getValue());
        const shouldStartFresh = shouldReplace || !hasMeaningfulExistingRows;
        const rows = shouldStartFresh ? [] : [...existingRows];
        const dedupeKeys = new Set(
            rows
                .filter(row => !!row.getValue())
                .map(row => JSON.stringify({
                    operator: row.operatorSelect.value,
                    type: row.typeSelect.value,
                    value: row.getValue(),
                    caseSensitive: row.caseInput.checked,
                    regex: row.regexInput.checked
                }))
        );

        if (shouldStartFresh) {
            existingRows.forEach(row => row.destroy());
            section.innerHTML = '';
        }

        parsedRows.forEach(data => {
            const dedupeKey = JSON.stringify({
                operator: data.operator,
                type: data.type,
                value: data.value.trim(),
                caseSensitive: data.caseSensitive,
                regex: data.isRegex
            });

            if (dedupeKeys.has(dedupeKey)) {
                return;
            }

            const newRow = new SearchRow(this.app, section, this);
            newRow.setData({
                operator: data.operator,
                type: data.type,
                value: data.value,
                caseSensitive: data.caseSensitive,
                regex: data.isRegex
            });
            rows.push(newRow);
            dedupeKeys.add(dedupeKey);
        });
        this.containerRows.set(uiContainer, rows);

        if (this.settings.autoSearchAfterImport) {
            this.executeSearch(uiContainer);
        }
    }

    private clearSearchForm(uiContainer: HTMLElement, n = 2) {
        const section = uiContainer.querySelector('.search-section') as HTMLElement;
        if (!section) return;

        const oldRows = this.containerRows.get(uiContainer) || [];
        oldRows.forEach(r => r.destroy());

        const newRows: SearchRow[] = [];
        section.innerHTML = '';
        for (let i = 0; i < n; i++) {
            newRows.push(new SearchRow(this.app, section, this));
        }
        this.containerRows.set(uiContainer, newRows);
    }

    private openGraphView(uiContainer: HTMLElement, forceOpen = false) {
        const queryValue = this.convertToObsidianQuery(uiContainer);
        const graphLeaves = this.app.workspace.getLeavesOfType('graph');

        if (graphLeaves.length === 0 && !forceOpen) return;

        if (forceOpen) {
            (this.app as unknown as { commands: { executeCommandById(id: string): void } }).commands.executeCommandById('graph:open');
        }

        setTimeout(() => {
            const currentGraphLeaves = this.app.workspace.getLeavesOfType('graph');
            currentGraphLeaves.forEach(leaf => {
                const graphSearch = leaf.view.containerEl.querySelector('.graph-control-section .search-input-container input') as HTMLInputElement;
                if (graphSearch) {
                    graphSearch.value = queryValue;
                    graphSearch.dispatchEvent(new Event('input', { bubbles: true }));
                    graphSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }
            });
        }, 250);
    }

    private async copySearchQuery(uiContainer: HTMLElement) {
        const queryValue = this.convertToObsidianQuery(uiContainer, true);
        const formattedQuery = `\`\`\`query\n${queryValue}\n\`\`\``;
        await navigator.clipboard.writeText(formattedQuery);
        new Notice(t('COPIED_TO_CLIPBOARD'));
    }
}
