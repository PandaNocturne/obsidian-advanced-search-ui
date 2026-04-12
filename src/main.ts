import { Notice, Plugin, setIcon } from 'obsidian';
import { t } from './lang/helpers';
import { AdvancedSearchSettings, DEFAULT_SETTINGS } from './settings';
import { AdvancedSearchSettingTab } from './ui/settings-tab';
import { SearchRow } from './components/SearchRow';
import { SearchGroup, SearchGroupDelegate } from './components/SearchGroup';
import { SearchQueryBuilder } from './services/SearchQueryBuilder';
import { SearchExecutionService } from './services/SearchExecutionService';
import { SearchImportService } from './services/SearchImportService';

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
    private searchExecution = new SearchExecutionService(
        this.app,
        this.queryBuilder,
        container => this.containerGroups.get(container) || [],
        () => this.settings.searchAlsoGraph,
        () => this.settings.adaptToFloatSearch
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
            const searchParams = searchContainer.querySelector('.search-params') as HTMLElement;
            if (!searchParams) return;

            if (!searchContainer.querySelector('.asui-search-form-container')) {
                const queryControlsContainer = searchParams.createDiv({ cls: 'asui-search-form-container' });
                if (this.settings.defaultCollapsed) queryControlsContainer.classList.add('is-hidden');

                queryControlsContainer.createDiv({ cls: 'search-section' });

                const navButtons = queryControlsContainer.createDiv({ cls: 'navigation-buttons' });
                this.createNavButton(navButtons, t('IMPORT_BUTTON'), 'import-button', () => this.searchImport.importFromSearchBox(queryControlsContainer));
                this.createNavButton(navButtons, t('COPY_BUTTON'), 'copy-button', () => { void this.searchExecution.copySearchQuery(queryControlsContainer); });

                const isModal = searchContainer.closest('.modal-container') || searchContainer.closest('.modal');
                if (!isModal) {
                    this.createNavButton(navButtons, t('GRAPH_BUTTON'), 'graph-button', () => this.searchExecution.openGraphView(queryControlsContainer, true));
                }

                this.createNavButton(navButtons, t('SEARCH_BUTTON'), 'search-button', () => this.searchExecution.executeSearch(queryControlsContainer));
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

    private isGroupDragEnabled() {
        return this.settings.enableExperimentalGrouping && this.settings.enableExperimentalGroupDragAndDrop;
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
        this.updateGroupDragState(newGroup);

        newGroup.setData({
            operator: currentGroup.operatorSelect.value as 'AND' | 'OR' | 'NOT',
            rows: [{ operator: 'AND', type: 'all', value: '', caseSensitive: false, regex: false }]
        });
    }

    onDuplicateGroup(currentGroup: SearchGroup) {
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
        this.updateGroupDragState(newGroup);
        newGroup.setData(currentGroup.getData());
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
        if (!this.settings.autoSearchOnOperatorChange || !this.shouldAutoSearchForGroup(currentGroup)) return;
        const container = this.findContainerByGroup(currentGroup);
        if (container) this.searchExecution.executeSearch(container);
    }

    onGroupDragStart(currentGroup: SearchGroup) {
        if (!this.isGroupDragEnabled()) return;
        this.draggingGroup = currentGroup;
        document.querySelectorAll('.asui-search-group').forEach(el => {
            el.classList.toggle('is-drag-dimmed', el !== currentGroup.container);
        });
    }

    onGroupDragEnter(currentGroup: SearchGroup) {
        if (!this.draggingGroup || this.draggingGroup === currentGroup || this.draggingRow) return;
        this.onGroupDragOver(currentGroup);
    }

    onGroupDragOver(currentGroup: SearchGroup, event?: DragEvent) {
        if (!this.draggingGroup || this.draggingGroup === currentGroup || this.draggingRow) return;
        const container = this.findContainerByGroup(currentGroup);
        if (!container) return;
        const groups = this.containerGroups.get(container);
        const section = container.querySelector('.search-section') as HTMLElement;
        if (!groups || !section) return;

        const fromIndex = groups.indexOf(this.draggingGroup);
        const currentIndex = groups.indexOf(currentGroup);
        if (fromIndex < 0 || currentIndex < 0) return;

        let insertIndex = currentIndex;
        if (event) {
            const rect = currentGroup.container.getBoundingClientRect();
            const insertAfter = event.clientY > rect.top + rect.height / 2;
            insertIndex = currentIndex + (insertAfter ? 1 : 0);
        }

        if (fromIndex < insertIndex) {
            insertIndex -= 1;
        }

        if (insertIndex === fromIndex) return;

        groups.splice(fromIndex, 1);
        groups.splice(insertIndex, 0, this.draggingGroup);

        const referenceGroup = groups[insertIndex + 1];
        if (referenceGroup) {
            section.insertBefore(this.draggingGroup.container, referenceGroup.container);
        } else {
            section.appendChild(this.draggingGroup.container);
        }
    }

    onGroupDragEnd() {
        this.draggingGroup = null;
        document.querySelectorAll('.asui-search-group').forEach(el => el.classList.remove('is-drag-dimmed', 'is-dragging'));
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
            this.updateGroupDragState(group);
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
                const groupHandle = group.container.querySelector('.asui-search-group-handle') as HTMLElement | null;
                const groupDivider = group.container.querySelector('.asui-search-group-divider') as HTMLElement | null;
                const groupOperator = group.container.querySelector('.asui-group-operator') as HTMLSelectElement | null;
                if (groupActions) groupActions.style.display = 'none';
                if (groupHandle) groupHandle.style.display = 'none';
                if (groupDivider) groupDivider.style.display = 'none';
                if (groupOperator) groupOperator.style.display = 'none';
            }

            newGroups.push(group);
        }
        this.containerGroups.set(uiContainer, newGroups);
    }
}
