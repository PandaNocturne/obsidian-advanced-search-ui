import { Notice, Plugin, setIcon } from 'obsidian';
import { t } from './lang/helpers';
import { AdvancedSearchSettings, DEFAULT_SETTINGS } from './settings';
import { AdvancedSearchSettingTab } from './ui/settings-tab';
import { SearchRow } from './components/SearchRow';
import { SearchGroup, SearchGroupData, SearchGroupDelegate } from './components/SearchGroup';
import { QueryParser } from './utils/QueryParser';

export default class AdvancedSearchPlugin extends Plugin implements SearchGroupDelegate {
    public settings: AdvancedSearchSettings;

    private containerGroups: Map<HTMLElement, SearchGroup[]> = new Map();
    private injectionInterval: number | null = null;
    private observer: MutationObserver | null = null;

    public refreshSearchUI() {
        document.querySelectorAll('.asui-search-form-container').forEach(container => container.remove());
        document.querySelectorAll('.advanced-search-ui-toggle-wrapper').forEach(btn => btn.remove());
        this.containerGroups.clear();
        this.injectSearchUI();
    }

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
                                if (!(node instanceof HTMLElement)) continue;
                                if (node.classList.contains('asui-search-form-container') || node.classList.contains('advanced-search-view-switch')) continue;
                                if (
                                    node.classList.contains('modal-container') ||
                                    node.classList.contains('search-view-outer') ||
                                    node.classList.contains('search-row') ||
                                    node.classList.contains('search-params') ||
                                    node.classList.contains('float-search-view-switch') ||
                                    (node.tagName === 'DIV' && !!node.querySelector('.search-params'))
                                ) {
                                    shouldInject = true;
                                    break;
                                }
                            }
                        }
                        if (shouldInject) break;
                    }
                    if (shouldInject) this.injectSearchUI();
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
        this.observer?.disconnect();
        this.observer = null;
        if (this.injectionInterval) {
            window.clearInterval(this.injectionInterval);
            this.injectionInterval = null;
        }

        document.querySelectorAll('.asui-search-form-container').forEach(container => container.remove());
        document.querySelectorAll('.advanced-search-ui-toggle-wrapper').forEach(btn => btn.remove());
        this.containerGroups.clear();
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

            if (!searchContainer.querySelector('.asui-search-form-container')) {
                const queryControlsContainer = searchParams.createDiv({ cls: 'asui-search-form-container' });
                if (this.settings.defaultCollapsed) queryControlsContainer.classList.add('is-hidden');

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

                this.containerGroups.set(queryControlsContainer, []);
                this.handleKeyboardEvents(queryControlsContainer);

                const searchRowEl = searchContainer.querySelector('.search-row') as HTMLElement;
                if (searchRowEl) searchRowEl.insertAdjacentElement('afterend', queryControlsContainer);
                else searchParams.prepend(queryControlsContainer);

                this.clearSearchForm(queryControlsContainer, 1, 2);
            }

            const searchRow = searchContainer.querySelector('.search-row') as HTMLElement;
            if (searchRow && !searchRow.querySelector('.advanced-search-ui-toggle-wrapper')) {
                const switchWrapper = searchRow.createDiv({ cls: 'advanced-search-ui-toggle-wrapper' });
                const toggleBtn = switchWrapper.createEl('div', {
                    cls: 'clickable-icon advanced-search-toggle',
                    attr: { 'aria-label': t('TOGGLE_ADVANCED_SEARCH') || 'Toggle advanced search' }
                });

                if (!this.settings.defaultCollapsed) toggleBtn.classList.add('is-active');
                setIcon(toggleBtn, 'list-filter');

                toggleBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const queryControlsContainer = searchContainer.querySelector('.asui-search-form-container') as HTMLElement;
                    if (!queryControlsContainer) return;
                    const isHidden = queryControlsContainer.classList.toggle('is-hidden');
                    toggleBtn.classList.toggle('is-active', !isHidden);
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

            if (['INPUT', 'SELECT', 'BUTTON'].includes(active.tagName) && e.key === 'Tab') {
                e.preventDefault();
                const focusableElements = Array.from(container.querySelectorAll('input, select, button')).filter((el: Element) => {
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
            }
        };
        container.addEventListener('keydown', handleKeydown as EventListener);
        container.addEventListener('keyup', e => e.stopPropagation());
        container.addEventListener('keypress', e => e.stopPropagation());
    }

    private findGroupByRow(currentRow: SearchRow): SearchGroup | null {
        const groupEl = currentRow.container.closest('.asui-search-group') as HTMLElement | null;
        if (!groupEl) return null;
        for (const groups of this.containerGroups.values()) {
            const group = groups.find(item => item.container === groupEl);
            if (group) return group;
        }
        return null;
    }

    private findContainerByGroup(currentGroup: SearchGroup): HTMLElement | null {
        for (const [container, groups] of this.containerGroups.entries()) {
            if (groups.includes(currentGroup)) return container;
        }
        return null;
    }

    onAddRow(currentRow: SearchRow) {
        const group = this.findGroupByRow(currentRow);
        if (!group) return;

        const newRow = group.addRow(currentRow);
        newRow.setData({
            type: currentRow.typeSelect.value,
            operator: currentRow.operatorSelect.value
        });
    }

    onRemoveRow(currentRow: SearchRow) {
        const group = this.findGroupByRow(currentRow);
        if (!group) return;
        group.removeRow(currentRow);
    }

    onExecuteSearch() {
        this.executeSearch();
    }

    onOperatorChange(currentRow: SearchRow) {
        if (!this.settings.autoSearchOnOperatorChange) return;
        const group = this.findGroupByRow(currentRow);
        const container = group ? this.findContainerByGroup(group) : null;
        if (container) this.executeSearch(container);
    }

    onAddGroup(currentGroup: SearchGroup) {
        if (!this.settings.enableExperimentalGrouping) return;

        const container = this.findContainerByGroup(currentGroup);
        if (!container) return;
        const groups = this.containerGroups.get(container);
        const section = container.querySelector('.search-section') as HTMLElement;
        if (!groups || !section) return;

        const index = groups.indexOf(currentGroup);
        const newGroup = new SearchGroup(this.app, section, this);
        currentGroup.container.parentNode?.insertBefore(newGroup.container, currentGroup.container.nextSibling);
        groups.splice(index + 1, 0, newGroup);

        newGroup.setData({
            operator: currentGroup.operatorSelect.value as 'AND' | 'OR' | 'NOT',
            rows: [{ operator: 'AND', type: currentGroup.rows[0]?.typeSelect.value || 'all', value: '', caseSensitive: false, regex: false }]
        });
    }

    onRemoveGroup(currentGroup: SearchGroup) {
        const container = this.findContainerByGroup(currentGroup);
        if (!container) return;
        const groups = this.containerGroups.get(container);
        if (!groups) return;

        if (groups.length > 1) {
            const index = groups.indexOf(currentGroup);
            groups.splice(index, 1);
            currentGroup.destroy();
        } else {
            this.clearSearchForm(container, 1, 2);
        }
    }

    onGroupOperatorChange(currentGroup: SearchGroup) {
        if (!this.settings.autoSearchOnOperatorChange) return;
        const container = this.findContainerByGroup(currentGroup);
        if (container) this.executeSearch(container);
    }

    private executeSearch(uiContainer?: HTMLElement) {
        const containers = this.settings.adaptToFloatSearch
            ? Array.from(document.querySelectorAll('.search-params')).map(el => el.parentElement).filter(el => el)
            : this.app.workspace.getLeavesOfType('search').map(leaf => leaf.view.containerEl);

        const uniqueContainers = Array.from(new Set(containers as HTMLElement[]));
        uniqueContainers.forEach(containerEl => {
            const currentUI = containerEl.querySelector('.asui-search-form-container') as HTMLElement;
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

    private buildRowQuery(row: SearchRow): string {
        const value = row.getValue();
        if (!value) return '';

        const typePrefix = row.typeSelect.value === 'all' ? '' : `${row.typeSelect.value}:`;
        let searchTerm = value;
        if (row.regexInput.checked) {
            searchTerm = `/${searchTerm}/`;
        } else if (row.typeSelect.value === 'tag') {
            searchTerm = searchTerm.split(' ').map(tag => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ');
        } else {
            searchTerm = `(${searchTerm})`;
        }

        if (row.caseInput.checked) {
            searchTerm = `match-case:${searchTerm}`;
        }

        return `(${typePrefix}${searchTerm})`;
    }

    private convertToObsidianQuery(container: HTMLElement, lineBreak = false): string {
        const groups = this.containerGroups.get(container) || [];
        const queryParts: string[] = [];
        let hasEffectiveGroup = false;

        groups.forEach(group => {
            const rowParts: string[] = [];
            let hasEffectiveRow = false;

            group.rows.forEach(row => {
                const rowQuery = this.buildRowQuery(row);
                if (!rowQuery) return;

                const rowOperator = row.operatorSelect.value;
                let part = '';
                if (!hasEffectiveRow) {
                    part = rowOperator === 'NOT' ? `-${rowQuery}` : rowQuery;
                } else {
                    switch (rowOperator) {
                        case 'AND': part = rowQuery; break;
                        case 'OR': part = `OR ${rowQuery}`; break;
                        case 'NOT': part = `-${rowQuery}`; break;
                    }
                }
                rowParts.push(part);
                hasEffectiveRow = true;
            });

            if (!rowParts.length) return;

            const grouped = rowParts.length === 1 ? rowParts[0]! : `(${rowParts.join(' ')})`;
            let groupPart: string;
            if (!hasEffectiveGroup) {
                groupPart = group.operatorSelect.value === 'NOT' ? `-${grouped}` : grouped;
            } else {
                switch (group.operatorSelect.value) {
                    case 'AND': groupPart = grouped; break;
                    case 'OR': groupPart = `OR ${grouped}`; break;
                    case 'NOT': groupPart = `-${grouped}`; break;
                    default: groupPart = grouped; break;
                }
            }

            queryParts.push(groupPart);
            hasEffectiveGroup = true;
        });

        return lineBreak ? queryParts.join('\n') : queryParts.join(' ');
    }

    private importFromSearchBox(uiContainer: HTMLElement) {
        let searchInput: HTMLInputElement | null = null;
        const leaf = this.app.workspace.getLeavesOfType('search').find(item => item.view.containerEl.contains(uiContainer));
        if (leaf) {
            searchInput = leaf.view.containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
        }

        if (!searchInput) {
            const container = uiContainer.closest('.workspace-leaf-content, .view-content, .search-view, .float-search-container, .modal-container') as HTMLElement;
            if (container) searchInput = container.querySelector('.search-input-container input, input[type="search"]') as HTMLInputElement;
            if (!searchInput && uiContainer.parentElement) {
                searchInput = uiContainer.parentElement.querySelector('.search-input-container input, input[type="search"]') as HTMLInputElement;
            }
        }

        if (!searchInput || !searchInput.value.trim()) {
            new Notice(t('NO_QUERY_TO_IMPORT'));
            return;
        }

        const parsedGroups = QueryParser.parseGroups(searchInput.value.trim());
        if (!parsedGroups.length) {
            new Notice(t('NO_QUERY_TO_IMPORT'));
            return;
        }

        const section = uiContainer.querySelector('.search-section') as HTMLElement;
        if (!section) return;

        const existingGroups = this.containerGroups.get(uiContainer) || [];
        const shouldReplace = this.settings.importMode === 'replace';
        const hasMeaningfulExistingGroups = existingGroups.some(group => group.hasMeaningfulRows());
        const shouldStartFresh = shouldReplace || !hasMeaningfulExistingGroups;
        const groups = shouldStartFresh ? [] : [...existingGroups];
        const dedupeKeys = new Set(
            groups.flatMap(group => group.rows.filter(row => !!row.getValue()).map(row => JSON.stringify({
                groupOperator: group.operatorSelect.value,
                operator: row.operatorSelect.value,
                type: row.typeSelect.value,
                value: row.getValue(),
                caseSensitive: row.caseInput.checked,
                regex: row.regexInput.checked
            })))
        );

        if (shouldStartFresh) {
            existingGroups.forEach(group => group.destroy());
            section.innerHTML = '';
        }

        parsedGroups.forEach(groupData => {
            const normalizedRows = groupData.rows.filter(row => !!row.value.trim());
            if (!normalizedRows.length) return;

            const uniqueRows = normalizedRows.filter(row => {
                const dedupeKey = JSON.stringify({
                    groupOperator: groupData.operator,
                    operator: row.operator,
                    type: row.type,
                    value: row.value.trim(),
                    caseSensitive: row.caseSensitive,
                    regex: row.isRegex
                });
                if (dedupeKeys.has(dedupeKey)) return false;
                dedupeKeys.add(dedupeKey);
                return true;
            }).map(row => ({
                operator: row.operator,
                type: row.type,
                value: row.value,
                caseSensitive: row.caseSensitive,
                regex: row.isRegex
            }));

            if (!uniqueRows.length) return;

            const group = new SearchGroup(this.app, section, this);
            group.setData({ operator: groupData.operator, rows: uniqueRows as SearchGroupData['rows'] });
            groups.push(group);
        });

        if (!groups.length) {
            this.clearSearchForm(uiContainer, 1, 2);
            return;
        }

        this.containerGroups.set(uiContainer, groups);

        if (!this.settings.enableExperimentalGrouping) {
            const mergedRows = groups.flatMap(group => group.rows.map(row => ({
                operator: row.operatorSelect.value as 'AND' | 'OR' | 'NOT',
                type: row.typeSelect.value,
                value: row.getValue(),
                caseSensitive: row.caseInput.checked,
                regex: row.regexInput.checked
            })));

            this.clearSearchForm(uiContainer, 1, Math.max(mergedRows.length || 2, 2));
            this.containerGroups.get(uiContainer)?.[0]?.setData({
                operator: 'AND',
                rows: mergedRows
            });
        }

        if (this.settings.autoSearchAfterImport) {
            this.executeSearch(uiContainer);
        }
    }

    private clearSearchForm(uiContainer: HTMLElement, groupCount = 1, rowsPerGroup = 2) {
        const section = uiContainer.querySelector('.search-section') as HTMLElement;
        if (!section) return;

        const oldGroups = this.containerGroups.get(uiContainer) || [];
        oldGroups.forEach(group => group.destroy());

        const newGroups: SearchGroup[] = [];
        section.innerHTML = '';

        const effectiveGroupCount = this.settings.enableExperimentalGrouping ? groupCount : 1;

        for (let i = 0; i < effectiveGroupCount; i++) {
            const group = new SearchGroup(this.app, section, this);
            group.setData({
                operator: 'AND',
                rows: Array.from({ length: rowsPerGroup }, () => ({
                    operator: 'AND',
                    type: 'all',
                    value: '',
                    caseSensitive: false,
                    regex: false
                }))
            });

            if (!this.settings.enableExperimentalGrouping) {
                group.container.classList.add('asui-grouping-disabled');
                const groupActions = group.container.querySelector('.asui-search-group-actions') as HTMLElement | null;
                const groupDivider = group.container.querySelector('.asui-search-group-divider') as HTMLElement | null;
                const groupOperator = group.container.querySelector('.asui-group-operator') as HTMLSelectElement | null;
                if (groupActions) groupActions.style.display = 'none';
                if (groupDivider) groupDivider.style.display = 'none';
                if (groupOperator) groupOperator.style.display = 'none';
            }

            newGroups.push(group);
        }
        this.containerGroups.set(uiContainer, newGroups);
    }

    private openGraphView(uiContainer: HTMLElement, forceOpen = false) {
        const queryValue = this.convertToObsidianQuery(uiContainer);
        const graphLeaves = this.app.workspace.getLeavesOfType('graph');
        if (graphLeaves.length === 0 && !forceOpen) return;

        if (forceOpen) {
            (this.app as unknown as { commands: { executeCommandById(id: string): void } }).commands.executeCommandById('graph:open');
        }

        setTimeout(() => {
            this.app.workspace.getLeavesOfType('graph').forEach(leaf => {
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
