import { App, Notice } from 'obsidian';
import { SearchGroup, SearchGroupData } from '../components/SearchGroup';
import { SearchGroupDelegate } from '../components/SearchGroup';
import { t } from '../lang/helpers';
import { AdvancedSearchSettings } from '../settings';
import { QueryParser } from '../utils/QueryParser';

export class SearchImportService {
    constructor(
        private app: App,
        private delegate: SearchGroupDelegate,
        private getSettings: () => AdvancedSearchSettings,
        private getGroupsForContainer: (container: HTMLElement) => SearchGroup[],
        private setGroupsForContainer: (container: HTMLElement, groups: SearchGroup[]) => void,
        private updateGroupDragState: (group: SearchGroup) => void,
        private clearSearchForm: (uiContainer: HTMLElement, groupCount?: number, rowsPerGroup?: number) => void,
        private normalizeGroupRows: (group: SearchGroup) => void,
        private executeSearch: (uiContainer?: HTMLElement) => void
    ) {}

    public importFromSearchBox(uiContainer: HTMLElement) {
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

        const settings = this.getSettings();
        const existingGroups = this.getGroupsForContainer(uiContainer);
        const shouldReplace = settings.importMode === 'replace';
        const hasMeaningfulExistingGroups = existingGroups.some(group => group.hasMeaningfulRows());
        const shouldStartFresh = shouldReplace || !hasMeaningfulExistingGroups;

        if (!settings.enableExperimentalGrouping) {
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

                const group = new SearchGroup(this.app, section, this.delegate);
                this.updateGroupDragState(group);
                group.setData({ operator: groupData.operator, rows: uniqueRows as SearchGroupData['rows'] });
                groups.push(group);
            });

            if (!groups.length) {
                this.clearSearchForm(uiContainer, 1, 2);
                return;
            }

            this.setGroupsForContainer(uiContainer, groups);

            const mergedRows = groups.flatMap(group => group.rows.map(row => ({
                operator: row.operatorSelect.value as 'AND' | 'OR' | 'NOT',
                type: row.typeSelect.value,
                value: row.getValue(),
                caseSensitive: row.caseInput.checked,
                regex: row.regexInput.checked
            })));

            this.clearSearchForm(uiContainer, 1, Math.max(mergedRows.length || 2, 2));
            this.getGroupsForContainer(uiContainer)[0]?.setData({
                operator: 'AND',
                rows: mergedRows
            });
        } else {
            const isMultiGroupImport = parsedGroups.length > 1;

            if (shouldStartFresh) {
                existingGroups.forEach(group => group.destroy());
                section.innerHTML = '';
                this.setGroupsForContainer(uiContainer, []);
            }

            let groups = this.getGroupsForContainer(uiContainer);
            let targetGroup = groups[groups.length - 1] || null;

            if (!targetGroup && !isMultiGroupImport) {
                targetGroup = new SearchGroup(this.app, section, this.delegate);
                this.updateGroupDragState(targetGroup);
                targetGroup.setData({
                    operator: 'AND',
                    rows: [{ operator: 'AND', type: 'all', value: '', caseSensitive: false, regex: false }]
                });
                groups.push(targetGroup);
                this.setGroupsForContainer(uiContainer, groups);
            }

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

            parsedGroups.forEach(groupData => {
                const normalizedRows = groupData.rows.filter(row => !!row.value.trim());
                if (!normalizedRows.length) return;

                const uniqueRows = normalizedRows.filter(row => {
                    const targetOperator = isMultiGroupImport ? groupData.operator : (targetGroup?.operatorSelect.value as 'AND' | 'OR' | 'NOT');
                    const dedupeKey = JSON.stringify({
                        groupOperator: targetOperator,
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

                if (isMultiGroupImport) {
                    const group = new SearchGroup(this.app, section, this.delegate);
                    this.updateGroupDragState(group);
                    group.setData({ operator: groupData.operator, rows: uniqueRows as SearchGroupData['rows'] });
                    groups.push(group);
                } else if (targetGroup) {
                    const meaningfulRows = targetGroup.rows.filter(row => !!row.getValue());
                    if (meaningfulRows.length === 0 && targetGroup.rows.length > 0) {
                        targetGroup.rows[0]?.setData(uniqueRows[0]!);
                        uniqueRows.slice(1).forEach(rowData => {
                            const newRow = targetGroup!.addRow(targetGroup!.rows[targetGroup!.rows.length - 1]);
                            newRow.setData(rowData);
                        });
                    } else {
                        uniqueRows.forEach(rowData => {
                            const newRow = targetGroup!.addRow(targetGroup!.rows[targetGroup!.rows.length - 1]);
                            newRow.setData(rowData);
                        });
                    }
                    this.normalizeGroupRows(targetGroup);
                }
            });

            const meaningfulGroups = groups.filter(group => group.hasMeaningfulRows());
            if (!meaningfulGroups.length) {
                this.clearSearchForm(uiContainer, 1, 2);
                return;
            }

            groups.filter(group => !meaningfulGroups.includes(group)).forEach(group => group.destroy());
            this.setGroupsForContainer(uiContainer, meaningfulGroups);
        }

        if (settings.autoSearchAfterImport) {
            this.executeSearch(uiContainer);
        }
    }
}
