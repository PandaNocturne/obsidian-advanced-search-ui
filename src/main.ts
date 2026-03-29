import { App, FuzzySuggestModal, Modal, Notice, Plugin, TFile, TFolder, setIcon, moment } from 'obsidian';
import { t } from './lang/helpers';

export default class AdvancedSearchPlugin extends Plugin {
    private searchUI: HTMLDivElement | null = null;

    async onload() {
        this.app.workspace.onLayoutReady(() => {
            this.injectSearchUI();
        });

        // Re-inject when the layout changes (e.g., search view opened)
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.injectSearchUI();
            })
        );

    }

    onunload() {
        const existingContainers = document.querySelectorAll('.search-form-container');
        existingContainers.forEach(container => container.remove());
    }

    private injectSearchUI() {
        const searchLeaves = this.app.workspace.getLeavesOfType('search');
        if (searchLeaves.length === 0) return;

        searchLeaves.forEach(leaf => {
            const searchContainer = leaf.view.containerEl;
            if (searchContainer.querySelector('.search-form-container')) return;

            const queryControlsContainer = searchContainer.createDiv({ cls: 'search-form-container' });
            
            const searchSection = queryControlsContainer.createDiv({ cls: 'search-section' });
            
            // Add initial row
            const firstRow = this.renderRow(searchSection);
            
            const navButtons = queryControlsContainer.createDiv({ cls: 'navigation-buttons' });
            navButtons.createEl('button', { text: t('IMPORT_BUTTON'), cls: 'import-button' });
            navButtons.createEl('button', { text: t('COPY_BUTTON'), cls: 'copy-button' });
            navButtons.createEl('button', { text: t('GRAPH_BUTTON'), cls: 'graph-button' });
            navButtons.createEl('button', { text: t('SEARCH_BUTTON'), cls: 'search-button' });
            navButtons.createEl('button', { text: t('RESET_BUTTON'), cls: 'reset-button' });

            const handleKeydown = (e: KeyboardEvent) => {
                e.stopPropagation();

                const active = document.activeElement as HTMLInputElement;
                if (active && active.tagName === 'INPUT') {
                    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                    if (keys.includes(e.key)) {
                        const start = active.selectionStart;
                        const end = active.selectionEnd;
                        const len = active.value.length;
                        
                        if (start !== null && end !== null) {
                            let newPos = start;
                            
                            const isSelected = start !== end;
                            const isBackward = active.selectionDirection === 'backward';
                            const activeEdge = isSelected ? (isBackward ? start : end) : start;
                            const anchorEdge = isSelected ? (isBackward ? end : start) : start;

                            if (e.key === 'ArrowLeft') {
                                newPos = Math.max(0, (e.shiftKey ? activeEdge : (isSelected ? start : start)) - 1);
                                if (!e.shiftKey && isSelected) newPos = start;
                            } else if (e.key === 'ArrowRight') {
                                newPos = Math.min(len, (e.shiftKey ? activeEdge : (isSelected ? end : start)) + 1);
                                if (!e.shiftKey && isSelected) newPos = end;
                            } else if (e.key === 'Home') {
                                newPos = 0;
                            } else if (e.key === 'End') {
                                newPos = len;
                            }

                            if (e.shiftKey) {
                                if (newPos < anchorEdge) {
                                    active.setSelectionRange(newPos, anchorEdge, 'backward');
                                } else {
                                    active.setSelectionRange(anchorEdge, newPos, 'forward');
                                }
                            } else {
                                active.setSelectionRange(newPos, newPos);
                            }
                        }
                    }
                }
            };
            queryControlsContainer.addEventListener('keydown', handleKeydown as EventListener);
            queryControlsContainer.addEventListener('keyup', (e) => e.stopPropagation());
            queryControlsContainer.addEventListener('keypress', (e) => e.stopPropagation());

            searchContainer.prepend(queryControlsContainer);
            this.initializeUI(queryControlsContainer);
        });
    }

    private renderRow(parent: HTMLElement): HTMLDivElement {
        const row = parent.createDiv({ cls: 'form-row' });
        
        const operatorSelect = row.createEl('select', { cls: 'operator' });
        ['AND', 'OR', 'NOT'].forEach(op => operatorSelect.createEl('option', { text: op }));
        
        const typeSelect = row.createEl('select', { cls: 'type' });
        this.options.forEach(opt => typeSelect.createEl('option', { text: opt }));
        
        const inputGroup = row.createDiv({ cls: 'input-group' });
        const input = inputGroup.createEl('input', { type: 'search', cls: 'search-input' });
        input.name = 'file';
        inputGroup.createEl('button', { cls: 'icon-button' });
        
        const controls = row.createDiv({ cls: 'controls' });
        
        const caseLabel = controls.createEl('label', { cls: 'toggle' });
        const caseInput = caseLabel.createEl('input', { type: 'radio' });
        caseInput.name = 'search-mode';
        caseInput.className = 'case-sensitive';
        caseLabel.createEl('span', { cls: 'toggle-label icon-case-sensitive' });
        
        const regexLabel = controls.createEl('label', { cls: 'toggle' });
        const regexInput = regexLabel.createEl('input', { type: 'radio' });
        regexInput.name = 'search-mode';
        regexInput.className = 'regex';
        regexLabel.createEl('span', { cls: 'toggle-label icon-regex' });
        
        row.createEl('button', { cls: 'remove-row', attr: { 'aria-label': t('REMOVE_CRITERIA') } });
        row.createEl('button', { cls: 'add-row', attr: { 'aria-label': t('ADD_CRITERIA') } });
        
        return row;
    }

    private initializeUI(container: HTMLDivElement) {
        const rows = container.querySelectorAll('.form-row');
        rows.forEach(row => this.initializeRow(row as HTMLDivElement));

        container.querySelector('.add-row')?.addEventListener('click', (e) => this.addRow(e.target as HTMLButtonElement));
        container.querySelector('.remove-row')?.addEventListener('click', (e) => this.removeRow(e.target as HTMLButtonElement));
        container.querySelector('.import-button')?.addEventListener('click', () => this.importFromSearchBox(container));
        container.querySelector('.copy-button')?.addEventListener('click', () => this.copySearchQuery(container));
        container.querySelector('.graph-button')?.addEventListener('click', () => this.openGraphView(container));
        container.querySelector('.search-button')?.addEventListener('click', () => this.executeSearch(container));
        container.querySelector('.reset-button')?.addEventListener('click', () => this.clearSearchForm(container));
        
        // Initial set up
        this.clearSearchForm(container);
    }

    private icons: Record<string, string> = {
        'file': 'file-text',
        'tag': 'tag',
        'path': 'folder'
    };

    private options = ["all", "file", "tag", "path", "content", "line", "block", "section", "task", "task-todo", "tasks-done"];

    private initializeRow(row: HTMLDivElement, type: string = 'all', clearInput: boolean = false) {
        if (clearInput) {
            row.querySelectorAll('input[type="text"]').forEach((input: HTMLInputElement) => input.value = '');
        }

        const typeSelect = row.querySelector('.type') as HTMLSelectElement;
        const iconButton = row.querySelector('.icon-button') as HTMLButtonElement;

        typeSelect.value = type;
        
        const updateIcon = () => {
            const selected = typeSelect.value;
            iconButton.innerHTML = '';
            const iconName = this.icons[selected] || '';
            if (iconName) {
                setIcon(iconButton, iconName);
            }
            iconButton.setAttribute('data-select-option', iconName ? selected : '');
        };

        const caseSensitiveLabel = row.querySelector('.icon-case-sensitive') as HTMLElement;
        if (caseSensitiveLabel && !caseSensitiveLabel.hasChildNodes()) {
            setIcon(caseSensitiveLabel, 'case-sensitive');
        }

        const regexLabel = row.querySelector('.icon-regex') as HTMLElement;
        if (regexLabel && !regexLabel.hasChildNodes()) {
            setIcon(regexLabel, 'regex');
        }

        const removeRowBtn = row.querySelector('.remove-row') as HTMLElement;
        if (removeRowBtn && !removeRowBtn.hasChildNodes()) {
            setIcon(removeRowBtn, 'minus');
        }

        const addRowBtn = row.querySelector('.add-row') as HTMLElement;
        if (addRowBtn && !addRowBtn.hasChildNodes()) {
            setIcon(addRowBtn, 'plus');
        }

        typeSelect.onchange = updateIcon;
        updateIcon();

        iconButton.onclick = () => this.handleTypeIconClick(row);

        const radios = row.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
        const rowName = `search-mode-${Math.random().toString(36).substr(2, 9)}`;
        radios.forEach(radio => {
            radio.name = rowName;
            let lastState = false;
            radio.onclick = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked && lastState) {
                    target.checked = false;
                }
                lastState = target.checked;
            };
        });

        const textInput = row.querySelector('input[type="search"]') as HTMLInputElement;
        if (textInput) {
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.executeSearch();
                }
            });
        }

        row.querySelector('.remove-row')?.addEventListener('click', () => this.removeRow(row.querySelector('.remove-row') as HTMLButtonElement));
        row.querySelector('.add-row')?.addEventListener('click', () => this.addRow(row.querySelector('.add-row') as HTMLButtonElement));
    }

    private addRow(button: HTMLButtonElement) {
        const currentRow = button.closest('.form-row') as HTMLDivElement;
        const currentType = (currentRow.querySelector('.type') as HTMLSelectElement).value;
        const currentOperator = (currentRow.querySelector('.operator') as HTMLSelectElement).value;
        
        const parent = currentRow.parentElement as HTMLElement;
        const newRow = this.renderRow(parent);

        currentRow.parentNode?.insertBefore(newRow, currentRow.nextSibling);
        this.initializeRow(newRow, currentType, true);
        (newRow.querySelector('.operator') as HTMLSelectElement).value = currentOperator;
    }

    private removeRow(button: HTMLButtonElement) {
        const row = button.closest('.form-row') as HTMLDivElement;
        const container = row.parentNode;
        if (container && container.querySelectorAll('.form-row').length > 1) {
            row.remove();
        }
    }

    private async handleTypeIconClick(row: HTMLDivElement) {
        const type = (row.querySelector('.type') as HTMLSelectElement).value;
        const options = this.getOptionsByType(type);
        if (options.length === 0) return;

        const choice = await new GenericSuggester(this.app, options).openAndGetValue();
        if (choice) {
            const input = row.querySelector('input[type="text"]') as HTMLInputElement;
            if (type === 'tag') {
                input.value += ` ${choice.replace(/^#/, '')}`;
            } else {
                input.value += ` "${choice}"`;
            }
        }
    }

    private getOptionsByType(type: string): string[] {
        switch (type) {
            case 'file':
                return this.app.vault.getMarkdownFiles().map(f => f.basename).sort();
            case 'tag':
                return Object.keys((this.app.metadataCache as any).getTags()).sort();
            case 'path':
                return this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder).map(f => f.path);
            default:
                return [];
        }
    }

    private convertToObsidianQuery(container: HTMLElement, lineBreak = false): string {
        const formRows = container.querySelectorAll('.form-row');
        const query: string[] = [];

        formRows.forEach(row => {
            const operator = (row.querySelector('.operator') as HTMLSelectElement).value;
            let type = (row.querySelector('.type') as HTMLSelectElement).value;
            type = type === 'all' ? "" : `${type}:`;
            const input = (row.querySelector('input[type="search"]') as HTMLInputElement).value;
            const isCaseSensitive = (row.querySelector('.case-sensitive') as HTMLInputElement).checked;
            const isRegex = (row.querySelector('.regex') as HTMLInputElement).checked;

            if (input.trim()) {
                let searchTerm = input.trim();
                if (isRegex) {
                    searchTerm = `/${searchTerm}/`;
                } else if (type === 'tag:') {
                    searchTerm = searchTerm.split(" ").map(t => t.startsWith("#") ? t : `#${t}`).join(" ");
                } else {
                    searchTerm = `(${searchTerm})`;
                }

                if (isCaseSensitive) {
                    searchTerm = `match-case:${searchTerm}`;
                }

                let queryPart = '';
                switch (operator) {
                    case 'AND': queryPart = `(${type}${searchTerm})`; break;
                    case 'OR': queryPart = `${operator} (${type}${searchTerm})`; break;
                    case 'NOT': queryPart = `-(${type}${searchTerm})`; break;
                }
                query.push(queryPart);
            }
        });

        return lineBreak ? query.join("\n") : query.join(" ");
    }

    private executeSearch(uiContainer?: HTMLElement) {
        if (uiContainer) {
            const leaf = this.app.workspace.getLeavesOfType('search').find(l => l.view.containerEl.contains(uiContainer));
            if (leaf) {
                this.performSearchOnLeaf(leaf, uiContainer);
                return;
            }
        }
        
        this.app.workspace.getLeavesOfType('search').forEach(leaf => {
            const searchUI = leaf.view.containerEl.querySelector('.search-form-container') as HTMLElement;
            if (!searchUI) return;
            this.performSearchOnLeaf(leaf, searchUI);
        });
    }

    private performSearchOnLeaf(leaf: any, searchUI: HTMLElement) {
        const queryValue = this.convertToObsidianQuery(searchUI);
        const searchInput = leaf.view.containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
        
        if (searchInput && searchInput.value !== queryValue) {
            searchInput.value = queryValue;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true
            }));
        }
    }

    private openGraphView(uiContainer: HTMLElement) {
        const queryValue = this.convertToObsidianQuery(uiContainer);

        (this.app as any).commands.executeCommandById("graph:open");

        setTimeout(() => {
            const graphLeaves = this.app.workspace.getLeavesOfType('graph');
            graphLeaves.forEach(leaf => {
                const graphSearch = leaf.view.containerEl.querySelector('.graph-control-section .search-input-container input') as HTMLInputElement;
                if (graphSearch) {
                    graphSearch.value = queryValue;
                    graphSearch.dispatchEvent(new Event('input', { bubbles: true }));
                    graphSearch.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Escape',
                        code: 'Escape',
                        keyCode: 27,
                        bubbles: true
                    }));
                }
            });
        }, 150);
    }

    private clearSearchForm(uiContainer?: HTMLElement, n = 2) {
        let sections: HTMLElement[] = [];
        if (uiContainer) {
            const section = uiContainer.querySelector('.search-section') as HTMLElement;
            if (section) sections = [section];
        } else {
            this.app.workspace.getLeavesOfType('search').forEach(leaf => {
                const section = leaf.view.containerEl.querySelector('.search-section') as HTMLElement;
                if (section) sections.push(section);
            });
        }

        sections.forEach(container => {
            const templateRow = container.querySelector('.form-row') as HTMLDivElement;
            const newRows: HTMLDivElement[] = [];

            // If no row exists yet, we can't clone. But onload creates it.
            if (!templateRow) return;

            container.innerHTML = '';
            for (let i = 0; i < n; i++) {
                const newRow = templateRow.cloneNode(true) as HTMLDivElement;
                container.appendChild(newRow);
                this.initializeRow(newRow, 'all', true);
            }
        });
    }

    private importFromSearchBox(uiContainer: HTMLElement) {
        const leaf = this.app.workspace.getLeavesOfType('search').find(l => l.view.containerEl.contains(uiContainer));
        if (!leaf) return;

        const searchInput = leaf.view.containerEl.querySelector('.search-row input') as HTMLInputElement;
        if (!searchInput || !searchInput.value.trim()) {
            new Notice(t('NO_QUERY_TO_IMPORT'));
            return;
        }

        const query = searchInput.value.trim();
        const parts = query.split(/(?<=\)) (?=[-(]|\w+:|\()/g).filter(p => p.trim());

        this.clearSearchForm(uiContainer, parts.length);
        const container = uiContainer.querySelector('.search-section') as HTMLElement;
        const rows = container.querySelectorAll('.form-row');

        parts.forEach((part, index) => {
            const row = rows[index] as HTMLDivElement;
            if (!row) return;

            if (part.startsWith('-')) {
                (row.querySelector('.operator') as HTMLSelectElement).value = 'NOT';
                part = part.slice(1);
            } else if (part.startsWith('OR ')) {
                (row.querySelector('.operator') as HTMLSelectElement).value = 'OR';
                part = part.slice(3);
            } else {
                (row.querySelector('.operator') as HTMLSelectElement).value = 'AND';
            }

            let type = 'all';
            let value = part.replace(/^\(|\)$/g, '');

            const typeMatch = value.match(/^(file|tag|path|content|line|block|section|task|task-todo|tasks-done):/);
            if (typeMatch && typeMatch[1]) {
                type = typeMatch[1];
                value = value.slice(typeMatch[0].length);
            }

            (row.querySelector('.type') as HTMLSelectElement).value = type;

            if (value.startsWith('match-case:')) {
                (row.querySelector('.case-sensitive') as HTMLInputElement).checked = true;
                value = value.slice(11);
            }

            if (value.startsWith('/') && value.endsWith('/')) {
                (row.querySelector('.regex') as HTMLInputElement).checked = true;
                value = value.slice(1, -1);
            }

            if (type === 'tag') {
                value = value.replace(/#/g, '');
            }
            (row.querySelector('input[type="search"]') as HTMLInputElement).value = value.replace(/^\(|\)$/g, '');
        });
    }

    private copySearchQuery(uiContainer: HTMLElement) {
        const queryValue = this.convertToObsidianQuery(uiContainer, true);
        const formattedQuery = `\`\`\`query\n${queryValue}\n\`\`\``;
        
        navigator.clipboard.writeText(formattedQuery).then(() => {
            new Notice(t('COPIED_TO_CLIPBOARD'));
        }).catch(() => {
            new Notice(t('FAILED_TO_COPY'));
        });
    }
}

class GenericSuggester extends FuzzySuggestModal<string> {
    private resolve!: (value: string) => void;
    private options: string[];

    constructor(app: App, options: string[]) {
        super(app);
        this.options = options;
    }

    getItems(): string[] {
        return this.options;
    }

    getItemText(item: string): string {
        return item;
    }

    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.resolve(item);
    }

    openAndGetValue(): Promise<string> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }
}
