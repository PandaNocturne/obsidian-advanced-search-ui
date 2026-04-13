import { App, setIcon } from 'obsidian';
import { SearchRow, SearchRowDelegate } from './SearchRow';

export interface SearchGroupData {
    operator: 'AND' | 'OR' | 'NOT';
    rows: Array<{
        operator: 'AND' | 'OR' | 'NOT';
        type: string;
        value: string;
        caseSensitive: boolean;
        regex: boolean;
    }>;
}

export interface SearchGroupDelegate extends SearchRowDelegate {
    isGroupingEnabled(): boolean;
    onAddGroup(currentGroup: SearchGroup): void;
    onDuplicateGroup(currentGroup: SearchGroup): void;
    onRemoveGroup(currentGroup: SearchGroup): void;
    onGroupOperatorChange(currentGroup: SearchGroup): void;
    onGroupDragStart(currentGroup: SearchGroup): void;
    onGroupDragEnter(currentGroup: SearchGroup): void;
    onGroupDragOver(currentGroup: SearchGroup, event: DragEvent): void;
    onGroupDragEnd(): void;
}

export class SearchGroup {
    public container: HTMLDivElement;
    public operatorSelect: HTMLSelectElement;
    public rowsContainer: HTMLDivElement;
    public rows: SearchRow[] = [];

    private app: App;
    private delegate: SearchGroupDelegate;
    private collapsed = false;
    private rowDragEnabled = false;
    private dragStarted = false;

    constructor(app: App, parent: HTMLElement, delegate: SearchGroupDelegate) {
        this.app = app;
        this.delegate = delegate;
        this.render(parent);
        this.initialize();
    }

    private render(parent: HTMLElement) {
        this.container = parent.createDiv({ cls: 'asui-search-group' });

        const header = this.container.createDiv({ cls: 'asui-search-group-header' });

        const actions = header.createDiv({ cls: 'asui-search-group-actions' });
        const removeGroupBtn = actions.createEl('button', { cls: 'asui-remove-group', attr: { type: 'button', 'aria-label': 'Remove group' } });
        const addGroupBtn = actions.createEl('button', { cls: 'asui-add-group', attr: { type: 'button', 'aria-label': 'Add group' } });
        const duplicateGroupBtn = actions.createEl('button', { cls: 'asui-duplicate-group', attr: { type: 'button', 'aria-label': 'Duplicate group' } });
        setIcon(removeGroupBtn, 'minus-square');
        setIcon(addGroupBtn, 'plus-square');
        setIcon(duplicateGroupBtn, 'copy');

        const handle = header.createDiv({ cls: 'asui-search-group-handle' });
        handle.createDiv({ cls: 'asui-search-group-divider' });

        this.operatorSelect = header.createEl('select', { cls: 'asui-operator asui-group-operator' });
        ['AND', 'OR', 'NOT'].forEach(op => this.operatorSelect.createEl('option', { text: op, value: op }));

        this.rowsContainer = this.container.createDiv({ cls: 'asui-search-group-rows' });
    }

    private initialize() {
        this.operatorSelect.addEventListener('change', () => {
            this.delegate.onGroupOperatorChange(this);
        });

        this.container.querySelector('.asui-add-group')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onAddGroup(this);
        });

        this.container.querySelector('.asui-duplicate-group')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onDuplicateGroup(this);
        });

        this.container.querySelector('.asui-remove-group')?.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onRemoveGroup(this);
        });

        const handle = this.container.querySelector('.asui-search-group-handle');
        if (handle instanceof HTMLDivElement) {
            handle.addEventListener('pointerdown', () => {
                this.dragStarted = false;
            });

            handle.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (this.dragStarted) {
                    this.dragStarted = false;
                    return;
                }
                this.toggleCollapsed();
            });

            handle.draggable = true;
            handle.addEventListener('dragstart', e => {
                this.dragStarted = true;
                this.container.classList.add('is-dragging');
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', 'asui-search-group');
                }
                this.delegate.onGroupDragStart(this);
            });
            handle.addEventListener('dragenter', e => {
                e.preventDefault();
                this.delegate.onGroupDragEnter(this);
            });
            handle.addEventListener('dragover', e => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                this.delegate.onGroupDragOver(this, e);
            });
            handle.addEventListener('dragend', () => {
                this.container.classList.remove('is-dragging');
                window.setTimeout(() => {
                    this.dragStarted = false;
                }, 0);
                this.delegate.onGroupDragEnd();
            });
        }
    }

    private toggleCollapsed() {
        this.setCollapsed(!this.collapsed);
    }

    private setCollapsed(collapsed: boolean, _persist = true) {
        this.collapsed = collapsed;
        this.container.classList.toggle('is-collapsed', this.collapsed);
    }

    public getData(): SearchGroupData {
        return {
            operator: this.operatorSelect.value as 'AND' | 'OR' | 'NOT',
            rows: this.rows.map(row => ({
                operator: row.operatorSelect.value as 'AND' | 'OR' | 'NOT',
                type: row.typeSelect.value,
                value: row.getValue(),
                caseSensitive: row.caseInput.checked,
                regex: row.regexInput.checked
            }))
        };
    }

    public setDragEnabled(groupDragEnabled: boolean, rowDragEnabled = false) {
        const isGroupingEnabled = this.delegate.isGroupingEnabled();
        const header = this.container.querySelector('.asui-search-group-header');
        if (header instanceof HTMLDivElement) {
            header.classList.toggle('is-hidden', !isGroupingEnabled);
        }
        this.container.classList.toggle('is-grouping-disabled', !isGroupingEnabled);

        const handle = this.container.querySelector('.asui-search-group-handle');
        if (!(handle instanceof HTMLDivElement)) return;
        handle.draggable = isGroupingEnabled && groupDragEnabled;
        this.rowDragEnabled = rowDragEnabled;
        this.rows.forEach(row => row.setDragEnabled(rowDragEnabled));
        this.container.classList.toggle('is-draggable', isGroupingEnabled && groupDragEnabled);
    }

    public setDropTarget(active: boolean) {
        this.container.classList.toggle('is-row-drop-target', active);
    }

    public clearDropIndicators() {
        this.rows.forEach(row => row.setDropIndicator(null));
        this.setDropTarget(false);
    }

    public insertRowAt(row: SearchRow, targetIndex: number) {
        const clampedIndex = Math.max(0, Math.min(targetIndex, this.rows.length));
        const referenceRow = this.rows[clampedIndex];
        if (referenceRow) {
            this.rowsContainer.insertBefore(row.container, referenceRow.container);
        } else {
            this.rowsContainer.appendChild(row.container);
        }
        this.rows.splice(clampedIndex, 0, row);
        row.setDragEnabled(this.rowDragEnabled);
    }

    public detachRow(row: SearchRow) {
        const index = this.rows.indexOf(row);
        if (index >= 0) {
            this.rows.splice(index, 1);
        }
    }

    public ensurePlaceholderRow() {
        if (this.rows.length === 0) {
            const row = this.addRow();
            row.setData({ operator: 'AND' });
        }
    }

    public addRow(afterRow?: SearchRow): SearchRow {
        const newRow = new SearchRow(this.app, this.rowsContainer, this.delegate);
        newRow.setDragEnabled(this.rowDragEnabled);
        if (!afterRow) {
            this.rows.push(newRow);
            return newRow;
        }

        const index = this.rows.indexOf(afterRow);
        afterRow.container.parentNode?.insertBefore(newRow.container, afterRow.container.nextSibling);
        this.rows.splice(index + 1, 0, newRow);
        return newRow;
    }

    public removeRow(row: SearchRow) {
        if (this.rows.length > 1) {
            const index = this.rows.indexOf(row);
            if (index >= 0) {
                this.rows.splice(index, 1);
                row.destroy();
            }
        } else {
            row.clear();
        }
    }

    public setData(data: SearchGroupData) {
        this.operatorSelect.value = data.operator;
        this.clearRows();

        if (data.rows.length === 0) {
            const row = this.addRow();
            row.setData({ operator: 'AND' });
            return;
        }

        data.rows.forEach(rowData => {
            const row = this.addRow();
            row.setData(rowData);
        });
    }

    public hasMeaningfulRows(): boolean {
        return this.rows.some(row => !!row.getValue());
    }

    public clearRows() {
        this.rows.forEach(row => row.destroy());
        this.rows = [];
        this.rowsContainer.empty();
    }

    public destroy() {
        this.clearRows();
        this.container.remove();
    }
}
