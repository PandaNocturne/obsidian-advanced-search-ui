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
    onAddGroup(currentGroup: SearchGroup): void;
    onRemoveGroup(currentGroup: SearchGroup): void;
    onGroupOperatorChange(currentGroup: SearchGroup): void;
}

export class SearchGroup {
    public container: HTMLDivElement;
    public operatorSelect: HTMLSelectElement;
    public rowsContainer: HTMLDivElement;
    public rows: SearchRow[] = [];

    private app: App;
    private delegate: SearchGroupDelegate;
    private collapsed = false;

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
        setIcon(removeGroupBtn, 'minus-square');
        setIcon(addGroupBtn, 'plus-square');

        header.createDiv({ cls: 'asui-search-group-divider' });

        this.operatorSelect = header.createEl('select', { cls: 'asui-operator asui-group-operator' });
        ['AND', 'OR', 'NOT'].forEach(op => this.operatorSelect.createEl('option', { text: op, value: op }));

        this.rowsContainer = this.container.createDiv({ cls: 'asui-search-group-rows' });
    }

    private initialize() {
        this.operatorSelect.addEventListener('change', () => {
            this.delegate.onGroupOperatorChange(this);
        });

        this.container.querySelector('.asui-add-group')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onAddGroup(this);
        });

        this.container.querySelector('.asui-remove-group')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onRemoveGroup(this);
        });

        this.container.querySelector('.asui-search-group-divider')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleCollapsed();
        });
    }

    private toggleCollapsed() {
        this.collapsed = !this.collapsed;
        this.rowsContainer.style.display = this.collapsed ? 'none' : '';
        this.container.classList.toggle('is-collapsed', this.collapsed);
    }

    public addRow(afterRow?: SearchRow): SearchRow {
        const newRow = new SearchRow(this.app, this.rowsContainer, this.delegate);
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
