import { Plugin, setIcon, Notice } from 'obsidian';
import { t } from './lang/helpers';
import { AdvancedSearchSettings, DEFAULT_SETTINGS } from './settings';
import { AdvancedSearchSettingTab } from './ui/settings-tab';
import { SearchRow } from './components/SearchRow';
import { SearchGroup, SearchGroupData, SearchGroupDelegate } from './components/SearchGroup';
import { SearchQueryBuilder } from './services/SearchQueryBuilder';
import { SearchExecutionService } from './services/SearchExecutionService';
import { SearchImportService } from './services/SearchImportService';
import { GraphColorGroupService } from './services/GraphColorGroupService';
import { QueryParser } from './utils/QueryParser';

type LegacyAdvancedSearchSettings = Partial<AdvancedSearchSettings> & {
    enableExperimentalDragAndDrop?: boolean;
};

export default class AdvancedSearchPlugin extends Plugin implements SearchGroupDelegate {
    public settings: AdvancedSearchSettings;

    private containerGroups: Map<HTMLElement, SearchGroup[]> = new Map();
    private injectionInterval: number | null = null;
    private observer: MutationObserver | null = null;
    private draggingGroup: SearchGroup | null = null;
    private draggingRow: SearchRow | null = null;
    private rowDropGroup: SearchGroup | null = null;
    private rowDropIndex: number | null = null;
    private queryBuilder = new SearchQueryBuilder();
    private graphColorGroupService = new GraphColorGroupService();
    private searchExecution = new SearchExecutionService(
        this.app,
        this.queryBuilder,
        this.graphColorGroupService,
        container => this.containerGroups.get(container) || [],
        () => this.settings.searchAlsoGraph,
        () => this.settings.adaptToFloatSearch,
        () => this.settings.enableExperimentalGrouping,
        () => this.settings.clearGraphColorGroupsOnReset
    );
    private searchImport = new SearchImportService(
        this.app,
        this,
        () => this.settings,
        container => this.containerGroups.get(container) || [],
        (container, groups) => this.containerGroups.set(container, groups),
        group => this.updateGroupDragState(group),
        (container, groupCount, rowsPerGroup) => this.clearSearchForm(container, groupCount, rowsPerGroup),
        group => this.normalizeGroupRows(group),
        container => this.searchExecution.executeSearch(container)
    );

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
                this.observer = new MutationObserver(mutations => {
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
        const rawSettings = ((await this.loadData()) as LegacyAdvancedSearchSettings | null) || {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings);

        if (rawSettings.enableExperimentalDragAndDrop !== undefined) {
            if (rawSettings.enableExperimentalGroupDragAndDrop === undefined) {
                this.settings.enableExperimentalGroupDragAndDrop = rawSettings.enableExperimentalDragAndDrop;
            }
            if (rawSettings.enableExperimentalRowDragAndDrop === undefined) {
                this.settings.enableExperimentalRowDragAndDrop = false;
            }
        }
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
            const searchParams = searchContainer.querySelector('.search-params');
            if (!(searchParams instanceof HTMLElement)) return;

            if (!searchContainer.querySelector('.asui-search-form-container')) {
                const queryControlsContainer = searchParams.createDiv({ cls: 'asui-search-form-container' });
                if (this.settings.defaultCollapsed) queryControlsContainer.classList.add('is-hidden');

                queryControlsContainer.createDiv({ cls: 'search-section' });

                const navButtons = queryControlsContainer.createDiv({ cls: 'navigation-buttons' });
                this.createNavButton(navButtons, t('IMPORT_BUTTON'), 'import-button', () => this.searchImport.importFromSearchBox(queryControlsContainer));
                this.createNavButton(navButtons, t('COPY_BUTTON'), 'copy-button', () => {
                    void this.searchExecution.copySearchQuery(queryControlsContainer);
                });

                const isModal = searchContainer.closest('.modal-container') || searchContainer.closest('.modal');
                if (!isModal) {
                    this.createNavButton(navButtons, t('GRAPH_BUTTON'), 'graph-button', () => {
                        void this.searchExecution.openGraphView(queryControlsContainer, true);
                    });
                }

                this.createNavButton(navButtons, t('SEARCH_BUTTON'), 'search-button', () => this.searchExecution.executeSearch(queryControlsContainer));
                this.createNavButton(navButtons, t('RESET_BUTTON'), 'reset-button', () => {
                    this.searchExecution.clearGraphColorGroups();
                    this.clearSearchForm(queryControlsContainer);
                });

                this.containerGroups.set(queryControlsContainer, []);
                this.handleKeyboardEvents(queryControlsContainer);

                const searchRowEl = searchContainer.querySelector('.search-row');
                if (searchRowEl instanceof HTMLElement) searchRowEl.insertAdjacentElement('afterend', queryControlsContainer);
                else searchParams.prepend(queryControlsContainer);

                this.clearSearchForm(queryControlsContainer, 1, 2);
            }

            const searchRow = searchContainer.querySelector('.search-row');
            if (searchRow instanceof HTMLElement && !searchRow.querySelector('.advanced-search-ui-toggle-wrapper')) {
                const switchWrapper = searchRow.createDiv({ cls: 'advanced-search-ui-toggle-wrapper' });
                const toggleBtn = switchWrapper.createEl('div', {
                    cls: 'clickable-icon advanced-search-toggle',
                    attr: { 'aria-label': t('TOGGLE_ADVANCED_SEARCH') || 'Toggle advanced search' }
                });

                if (!this.settings.defaultCollapsed) toggleBtn.classList.add('is-active');
                setIcon(toggleBtn, 'list-filter');

                toggleBtn.onclick = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const queryControlsContainer = searchContainer.querySelector('.asui-search-form-container');
                    if (!(queryControlsContainer instanceof HTMLElement)) return;
                    const isHidden = queryControlsContainer.classList.toggle('is-hidden');
                    toggleBtn.classList.toggle('is-active', !isHidden);
                };
            }
        });
    }

    private createNavButton(parent: HTMLElement, text: string, cls: string, clickHandler: () => void) {
        const btn = parent.createEl('button', { text, cls, attr: { type: 'button' } });
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            clickHandler();
        };
        return btn;
    }

    private handleKeyboardEvents(container: HTMLElement) {
        const handleKeydown = (e: KeyboardEvent) => {
            e.stopPropagation();
            const active = document.activeElement;
            if (!(active instanceof HTMLElement)) return;

            if (['INPUT', 'SELECT', 'BUTTON'].includes(active.tagName) && e.key === 'Tab') {
                e.preventDefault();
                const focusableElements = Array.from(container.querySelectorAll('input, select, button')).filter(
                    (el): el is HTMLElement => {
                        if (!(el instanceof HTMLElement)) return false;
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && !el.hasAttribute('disabled');
                    }
                );

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
                    focusableElements[nextIndex]?.focus();
                }
            }
        };
        container.addEventListener('keydown', handleKeydown);
        container.addEventListener('keyup', e => e.stopPropagation());
        container.addEventListener('keypress', e => e.stopPropagation());
    }

    private isGroupDragEnabled() {
        return this.settings.enableExperimentalGrouping && this.settings.enableExperimentalGroupDragAndDrop;
    }

    public isGroupingEnabled() {
        return this.settings.enableExperimentalGrouping;
    }

    private isRowDragEnabled() {
        return this.settings.enableExperimentalRowDragAndDrop;
    }

    private updateGroupDragState(group: SearchGroup) {
        group.setDragEnabled(this.isGroupDragEnabled(), this.isRowDragEnabled());
    }

    private clearAllRowDropIndicators() {
        for (const groups of this.containerGroups.values()) {
            groups.forEach(group => group.clearDropIndicators());
        }
    }

    private findGroupByRow(currentRow: SearchRow): SearchGroup | null {
        const groupEl = currentRow.container.closest('.asui-search-group');
        if (!(groupEl instanceof HTMLElement)) return null;
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

    private normalizeGroupRows(group: SearchGroup) {
        group.rows.forEach((row, index) => {
            if (index === 0) {
                row.operatorSelect.value = 'AND';
            }
        });
    }

    private shouldAutoSearchForRow(currentRow: SearchRow) {
        return !!currentRow.getValue();
    }

    private shouldAutoSearchForGroup(currentGroup: SearchGroup) {
        return currentGroup.rows.some(row => !!row.getValue());
    }

    async copyGroupQuery(currentGroup: SearchGroup): Promise<boolean> {
        const query = this.queryBuilder.buildGroupQuery(currentGroup).trim();
        if (!query) {
            return false;
        }

        try {
            await navigator.clipboard.writeText(query);
            new Notice(t('COPIED_TO_CLIPBOARD'));
            return true;
        } catch {
            new Notice(t('FAILED_TO_COPY'));
            return false;
        }
    }

    async pasteGroupQuery(currentGroup: SearchGroup): Promise<boolean> {
        let clipboardText = '';
        try {
            clipboardText = (await navigator.clipboard.readText()).trim();
        } catch {
            return false;
        }

        if (!clipboardText) {
            return false;
        }

        const parsedGroups = QueryParser.parseGroups(clipboardText);
        if (parsedGroups.length !== 1) {
            return false;
        }

        const parsedGroup = parsedGroups[0];
        if (!parsedGroup) {
            return false;
        }

        const rebuiltQuery = this.queryBuilder.buildGroupQuery(currentGroupFromParsed(parsedGroup)).trim();
        if (!parsedGroup.rows.length || rebuiltQuery !== clipboardText) {
            return false;
        }

        currentGroup.setData({
            operator: currentGroup.operatorSelect.value as 'AND' | 'OR' | 'NOT',
            rows: parsedGroup.rows.map(row => ({
                operator: row.operator,
                type: row.type,
                value: row.value,
                caseSensitive: row.caseSensitive,
                regex: row.isRegex
            }))
        });
        this.normalizeGroupRows(currentGroup);

        const container = this.findContainerByGroup(currentGroup);
        if (container && this.shouldAutoSearchForGroup(currentGroup)) {
            this.searchExecution.executeSearch(container);
        }
        return true;

        function currentGroupFromParsed(group: ReturnType<typeof QueryParser.parseGroups>[number]): SearchGroup {
            return {
                rows: group.rows.map(row => ({
                    operatorSelect: { value: row.operator } as HTMLSelectElement,
                    typeSelect: { value: row.type } as HTMLSelectElement,
                    caseInput: { checked: row.caseSensitive } as HTMLInputElement,
                    regexInput: { checked: row.isRegex } as HTMLInputElement,
                    getValue: () => row.value
                }))
            } as unknown as SearchGroup;
        }
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
        this.searchExecution.executeSearch();
    }

    onOperatorChange(currentRow: SearchRow) {
        if (!this.settings.autoSearchOnOperatorChange || !this.shouldAutoSearchForRow(currentRow)) return;
        const group = this.findGroupByRow(currentRow);
        const container = group ? this.findContainerByGroup(group) : null;
        if (container) this.searchExecution.executeSearch(container);
    }

    onRowDragStart(currentRow: SearchRow) {
        if (!this.isRowDragEnabled()) return;
        this.draggingRow = currentRow;
        this.rowDropGroup = null;
        this.rowDropIndex = null;
    }

    onRowDragEnter(currentRow: SearchRow, event: DragEvent) {
        this.onRowDragOver(currentRow, event);
    }

    onRowDragOver(currentRow: SearchRow, event: DragEvent) {
        if (!this.draggingRow || this.draggingGroup) return;
        const targetGroup = this.findGroupByRow(currentRow);
        if (!targetGroup) return;

        const rect = currentRow.container.getBoundingClientRect();
        const insertAfter = event.clientY > rect.top + rect.height / 2;
        const currentIndex = targetGroup.rows.indexOf(currentRow);
        if (currentIndex < 0) return;

        this.clearAllRowDropIndicators();
        this.rowDropGroup = targetGroup;
        this.rowDropIndex = currentIndex + (insertAfter ? 1 : 0);
        targetGroup.setDropTarget(true);
        currentRow.setDropIndicator(insertAfter ? 'after' : 'before');
    }

    onRowDragEnd() {
        const draggingRow = this.draggingRow;
        const targetGroup = this.rowDropGroup;
        const targetIndex = this.rowDropIndex;

        this.clearAllRowDropIndicators();
        this.draggingRow = null;
        this.rowDropGroup = null;
        this.rowDropIndex = null;

        if (!draggingRow || !targetGroup || targetIndex === null) return;

        const sourceGroup = this.findGroupByRow(draggingRow);
        if (!sourceGroup) return;

        const sourceIndex = sourceGroup.rows.indexOf(draggingRow);
        if (sourceIndex < 0) return;

        let finalIndex = targetIndex;
        if (sourceGroup === targetGroup && sourceIndex < finalIndex) {
            finalIndex -= 1;
        }

        if (sourceGroup === targetGroup && sourceIndex === finalIndex) return;

        sourceGroup.detachRow(draggingRow);
        targetGroup.insertRowAt(draggingRow, finalIndex);

        this.normalizeGroupRows(sourceGroup);
        this.normalizeGroupRows(targetGroup);

        if (sourceGroup.rows.length === 0) {
            const sourceContainer = this.findContainerByGroup(sourceGroup);
            const groups = sourceContainer ? this.containerGroups.get(sourceContainer) : null;
            if (groups && groups.length > 1) {
                const groupIndex = groups.indexOf(sourceGroup);
                if (groupIndex >= 0) groups.splice(groupIndex, 1);
                sourceGroup.destroy();
            } else {
                sourceGroup.ensurePlaceholderRow();
                this.normalizeGroupRows(sourceGroup);
            }
        }

        const targetContainer = this.findContainerByGroup(targetGroup);
        if (targetContainer && this.shouldAutoSearchForGroup(targetGroup)) {
            this.searchExecution.executeSearch(targetContainer);
        }
    }

    onAddGroup(currentGroup: SearchGroup) {
        const container = this.findContainerByGroup(currentGroup);
        if (!container) return;

        const groups = this.containerGroups.get(container) || [];
        const groupIndex = groups.indexOf(currentGroup);
        const newGroup = new SearchGroup(this.app, currentGroup.container.parentElement || container, this);
        this.updateGroupDragState(newGroup);
        newGroup.setData({
            operator: currentGroup.operatorSelect.value as 'AND' | 'OR' | 'NOT',
            rows: [{ operator: 'AND', type: 'all', value: '', caseSensitive: false, regex: false }]
        });

        currentGroup.container.insertAdjacentElement('afterend', newGroup.container);
        groups.splice(groupIndex + 1, 0, newGroup);
        this.containerGroups.set(container, groups);
    }

    onDuplicateGroup(currentGroup: SearchGroup) {
        const container = this.findContainerByGroup(currentGroup);
        if (!container) return;

        const groups = this.containerGroups.get(container) || [];
        const groupIndex = groups.indexOf(currentGroup);
        const duplicateGroup = new SearchGroup(this.app, currentGroup.container.parentElement || container, this);
        this.updateGroupDragState(duplicateGroup);
        duplicateGroup.setData(currentGroup.getData());

        currentGroup.container.insertAdjacentElement('afterend', duplicateGroup.container);
        groups.splice(groupIndex + 1, 0, duplicateGroup);
        this.containerGroups.set(container, groups);
    }

    onRemoveGroup(currentGroup: SearchGroup) {
        const container = this.findContainerByGroup(currentGroup);
        if (!container) return;

        const groups = this.containerGroups.get(container) || [];
        if (groups.length > 1) {
            const groupIndex = groups.indexOf(currentGroup);
            if (groupIndex >= 0) {
                groups.splice(groupIndex, 1);
                currentGroup.destroy();
            }
        } else {
            currentGroup.clearRows();
            const row = currentGroup.addRow();
            row.setData({ operator: 'AND' });
        }
    }

    onGroupOperatorChange(currentGroup: SearchGroup) {
        const container = this.findContainerByGroup(currentGroup);
        if (!container || !this.settings.autoSearchOnOperatorChange || !this.shouldAutoSearchForGroup(currentGroup)) return;
        this.searchExecution.executeSearch(container);
    }

    onGroupDragStart(currentGroup: SearchGroup) {
        if (!this.isGroupDragEnabled()) return;
        this.draggingGroup = currentGroup;
        for (const groups of this.containerGroups.values()) {
            groups.forEach(group => group.container.classList.toggle('is-drag-dimmed', group !== currentGroup));
        }
    }

    onGroupDragEnter(currentGroup: SearchGroup) {
        if (!this.draggingGroup || this.draggingGroup === currentGroup) return;
        currentGroup.container.classList.add('is-drop-target');
    }

    onGroupDragOver(currentGroup: SearchGroup, event: DragEvent) {
        if (!this.draggingGroup || this.draggingGroup === currentGroup) return;
        const currentContainer = this.findContainerByGroup(currentGroup);
        const draggingContainer = this.findContainerByGroup(this.draggingGroup);
        if (!currentContainer || !draggingContainer || currentContainer !== draggingContainer) return;

        const groups = this.containerGroups.get(currentContainer) || [];
        groups.forEach(group => {
            if (group !== currentGroup) {
                group.container.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after');
            }
        });

        const rect = currentGroup.container.getBoundingClientRect();
        const insertAfter = event.clientY > rect.top + rect.height / 2;
        currentGroup.container.classList.add('is-drop-target');
        currentGroup.container.classList.toggle('is-drop-before', !insertAfter);
        currentGroup.container.classList.toggle('is-drop-after', insertAfter);
    }

    onGroupDragEnd() {
        const draggingGroup = this.draggingGroup;
        if (!draggingGroup) return;

        const sourceContainer = this.findContainerByGroup(draggingGroup);
        if (!sourceContainer) {
            this.draggingGroup = null;
            return;
        }

        const groups = this.containerGroups.get(sourceContainer);
        if (!groups) {
            this.draggingGroup = null;
            return;
        }

        const targetGroup = groups.find(group => group.container.classList.contains('is-drop-before') || group.container.classList.contains('is-drop-after'));
        const insertAfter = !!targetGroup?.container.classList.contains('is-drop-after');

        this.draggingGroup = null;

        if (targetGroup && targetGroup !== draggingGroup) {
            const sourceIndex = groups.indexOf(draggingGroup);
            const targetIndex = groups.indexOf(targetGroup);
            if (sourceIndex >= 0 && targetIndex >= 0) {
                groups.splice(sourceIndex, 1);

                let insertIndex = groups.indexOf(targetGroup);
                if (insertIndex >= 0 && insertAfter) {
                    insertIndex += 1;
                }
                if (insertIndex < 0) {
                    insertIndex = groups.length;
                }

                groups.splice(insertIndex, 0, draggingGroup);

                const section = sourceContainer.querySelector('.search-section');
                if (section instanceof HTMLElement) {
                    const referenceGroup = groups[insertIndex + 1];
                    if (referenceGroup) {
                        section.insertBefore(draggingGroup.container, referenceGroup.container);
                    } else {
                        section.appendChild(draggingGroup.container);
                    }
                }

                this.containerGroups.set(sourceContainer, groups);
            }
        }

        for (const groupList of this.containerGroups.values()) {
            groupList.forEach(group => {
                group.container.classList.remove('is-drag-dimmed', 'is-drop-target', 'is-drop-before', 'is-drop-after');
            });
        }
    }

    private clearSearchForm(uiContainer?: HTMLElement, groupCount = 1, rowsPerGroup = 2) {
        const containers = uiContainer ? [uiContainer] : Array.from(this.containerGroups.keys());

        containers.forEach(container => {
            const groups = this.containerGroups.get(container) || [];
            groups.forEach(group => group.destroy());

            const nextGroups: SearchGroup[] = [];
            const section = container.querySelector('.search-section');
            if (!(section instanceof HTMLElement)) return;

            for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
                const group = new SearchGroup(this.app, section, this);
                this.updateGroupDragState(group);

                const rows: SearchGroupData['rows'] = Array.from({ length: rowsPerGroup }, () => ({
                    operator: 'AND',
                    type: 'all',
                    value: '',
                    caseSensitive: false,
                    regex: false
                }));

                group.setData({
                    operator: groupIndex === 0 ? 'AND' : 'OR',
                    rows
                });
                nextGroups.push(group);
            }

            this.containerGroups.set(container, nextGroups);

            const searchBtn = container.querySelector('.search-button');
            const graphBtn = container.querySelector('.graph-button');
            const copyBtn = container.querySelector('.copy-button');
            const resetBtn = container.querySelector('.reset-button');
            searchBtn?.classList.remove('is-hidden');
            graphBtn?.classList.remove('is-hidden');
            copyBtn?.classList.remove('is-hidden');
            resetBtn?.classList.remove('is-hidden');
        });
    }
}