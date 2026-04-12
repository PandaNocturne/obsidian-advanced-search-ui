import { App, setIcon, TFolder } from 'obsidian';
import { t } from '../lang/helpers';
import { GenericSuggester } from '../ui/GenericSuggester';

export interface SearchRowDelegate {
    onAddRow(currentRow: SearchRow): void;
    onRemoveRow(currentRow: SearchRow): void;
    onExecuteSearch(): void;
    onOperatorChange(currentRow: SearchRow): void;
    onRowDragStart(currentRow: SearchRow): void;
    onRowDragEnter(currentRow: SearchRow, event: DragEvent): void;
    onRowDragOver(currentRow: SearchRow, event: DragEvent): void;
    onRowDragEnd(): void;
}

export class SearchRow {
    public container: HTMLDivElement;
    public operatorSelect: HTMLSelectElement;
    public typeSelect: HTMLSelectElement;
    public input: HTMLInputElement;
    public caseInput: HTMLInputElement;
    public regexInput: HTMLInputElement;
    private iconButton: HTMLButtonElement;
    private dragHandle: HTMLButtonElement;

    private app: App;
    private delegate: SearchRowDelegate;

    private static readonly ICONS: Record<string, string> = {
        file: 'file-text',
        tag: 'tag',
        path: 'folder'
    };

    private static readonly OPTIONS = ['all', 'file', 'tag', 'path', 'content', 'line', 'block', 'section', 'task', 'task-todo', 'tasks-done'];

    constructor(app: App, parent: HTMLElement, delegate: SearchRowDelegate) {
        this.app = app;
        this.delegate = delegate;
        this.render(parent);
        this.initialize();
    }

    private render(parent: HTMLElement) {
        this.container = parent.createDiv({ cls: 'asui-form-row' });

        this.dragHandle = this.container.createEl('button', { cls: 'asui-row-drag-handle', attr: { type: 'button', 'aria-label': 'Drag row' } });
        this.operatorSelect = this.container.createEl('select', { cls: 'asui-operator' });
        ['AND', 'OR', 'NOT'].forEach(op => this.operatorSelect.createEl('option', { text: op, value: op }));

        this.typeSelect = this.container.createEl('select', { cls: 'asui-type' });
        SearchRow.OPTIONS.forEach(opt => this.typeSelect.createEl('option', { text: t(opt as Parameters<typeof t>[0]) || opt, value: opt }));

        const inputGroup = this.container.createDiv({ cls: 'asui-input-group' });
        this.input = inputGroup.createEl('input', { type: 'search', cls: 'asui-search-input' });
        this.input.placeholder = t('SEARCH_BUTTON');
        this.iconButton = inputGroup.createEl('button', { cls: 'asui-icon-button', attr: { type: 'button' } });

        const controls = this.container.createDiv({ cls: 'asui-controls' });

        const caseLabel = controls.createEl('label', { cls: 'asui-toggle' });
        this.caseInput = caseLabel.createEl('input', { type: 'radio' });
        caseLabel.createEl('span', { cls: 'asui-toggle-label asui-icon-case-sensitive' });

        const regexLabel = controls.createEl('label', { cls: 'asui-toggle' });
        this.regexInput = regexLabel.createEl('input', { type: 'radio' });
        regexLabel.createEl('span', { cls: 'asui-toggle-label asui-icon-regex' });

        this.container.createEl('button', { cls: 'asui-remove-row', attr: { 'aria-label': t('REMOVE_CRITERIA'), type: 'button' } });
        this.container.createEl('button', { cls: 'asui-add-row', attr: { 'aria-label': t('ADD_CRITERIA'), type: 'button' } });
    }

    private initialize() {
        const updateIcon = () => {
            const selected = this.typeSelect.value;
            this.iconButton.innerHTML = '';
            const iconName = SearchRow.ICONS[selected] || '';
            if (iconName) {
                setIcon(this.iconButton, iconName);
            }
            this.iconButton.setAttribute('data-select-option', iconName ? selected : '');
        };

        this.typeSelect.onchange = updateIcon;
        updateIcon();

        SearchRow.setIconForEl(this.dragHandle, 'grip-vertical');
        SearchRow.setIconForEl(this.container.querySelector('.asui-icon-case-sensitive') as HTMLElement, 'case-sensitive');
        SearchRow.setIconForEl(this.container.querySelector('.asui-icon-regex') as HTMLElement, 'regex');
        SearchRow.setIconForEl(this.container.querySelector('.asui-remove-row') as HTMLElement, 'minus');
        SearchRow.setIconForEl(this.container.querySelector('.asui-add-row') as HTMLElement, 'plus');

        this.dragHandle.draggable = true;
        this.dragHandle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        this.dragHandle.addEventListener('dragstart', (e) => {
            this.container.classList.add('is-dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'asui-search-row');
            }
            this.delegate.onRowDragStart(this);
        });
        this.dragHandle.addEventListener('dragend', () => {
            this.container.classList.remove('is-dragging');
            this.delegate.onRowDragEnd();
        });

        this.container.addEventListener('dragenter', (e) => {
            e.preventDefault();
            this.delegate.onRowDragEnter(this, e);
        });
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            this.delegate.onRowDragOver(this, e);
        });

        this.iconButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            void this.handleIconClick();
        };

        this.operatorSelect.addEventListener('change', () => {
            this.delegate.onOperatorChange(this);
        });

        const radios = [this.caseInput, this.regexInput];
        const rowId = `search-mode-${Math.random().toString(36).substring(2, 11)}`;
        radios.forEach(radio => {
            radio.name = rowId;
            let lastState = false;
            radio.onclick = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked && lastState) {
                    target.checked = false;
                }
                lastState = target.checked;
            };
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.delegate.onExecuteSearch();
            }
        });

        this.container.querySelector('.asui-remove-row')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onRemoveRow(this);
        });
        this.container.querySelector('.asui-add-row')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onAddRow(this);
        });
    }

    private async handleIconClick() {
        const type = this.typeSelect.value;
        const options = this.getOptionsByType(type);
        if (options.length === 0) return;

        const choice = await new GenericSuggester(this.app, options).openAndGetValue();
        if (choice) {
            const currentValue = this.input.value.trim();
            let newValue = choice;

            if (type === 'tag') {
                newValue = choice.replace(/^#/, '');
                this.input.value = currentValue ? `${currentValue} ${newValue}` : newValue;
            } else if (type === 'file' || type === 'path') {
                newValue = `"${choice}"`;
                this.input.value = newValue;
            } else {
                this.input.value = currentValue ? `${currentValue} ${newValue}` : newValue;
            }

            this.input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    private getOptionsByType(type: string): string[] {
        switch (type) {
            case 'file':
                return this.app.vault.getMarkdownFiles().map(f => f.basename).sort();
            case 'tag': {
                const tags = (this.app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags();
                return Object.keys(tags).map(tag => tag.replace(/^#/, '')).sort();
            }
            case 'path':
                return this.app.vault.getAllLoadedFiles()
                    .filter(file => file instanceof TFolder)
                    .map(file => file.path)
                    .sort();
            default:
                return [];
        }
    }

    private static setIconForEl(el: HTMLElement, iconName: string) {
        if (el && !el.hasChildNodes()) {
            setIcon(el, iconName);
        }
    }

    public setDragEnabled(enabled: boolean) {
        this.dragHandle.draggable = enabled;
        this.container.classList.toggle('is-draggable', enabled);
        this.dragHandle.style.display = enabled ? '' : 'none';
    }

    public setDropIndicator(position: 'before' | 'after' | null) {
        this.container.classList.toggle('is-drop-before', position === 'before');
        this.container.classList.toggle('is-drop-after', position === 'after');
    }

    public setData(data: { operator?: string; type?: string; value?: string; caseSensitive?: boolean; regex?: boolean }) {
        if (data.operator !== undefined) this.operatorSelect.value = data.operator;
        if (data.type !== undefined) {
            this.typeSelect.value = data.type;
            this.typeSelect.dispatchEvent(new Event('change'));
        }
        if (data.value !== undefined) this.input.value = data.value;
        if (data.caseSensitive !== undefined) this.caseInput.checked = data.caseSensitive;
        if (data.regex !== undefined) this.regexInput.checked = data.regex;
    }

    public getValue(): string {
        return this.input.value.trim();
    }

    public clear() {
        this.input.value = '';
        this.typeSelect.value = 'all';
        this.typeSelect.dispatchEvent(new Event('change'));
        this.caseInput.checked = false;
        this.regexInput.checked = false;
    }

    public destroy() {
        this.container.remove();
    }
}
