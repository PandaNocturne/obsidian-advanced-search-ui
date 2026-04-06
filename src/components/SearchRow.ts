import { App, setIcon, TFolder } from 'obsidian';
import { t } from '../lang/helpers';
import { GenericSuggester } from '../ui/GenericSuggester';

/**
 * 搜索行的行为委托接口，用于将行内事件（如点击加减号、按回车）通知给管理类
 */
export interface SearchRowDelegate {
    onAddRow(currentRow: SearchRow): void;
    onRemoveRow(currentRow: SearchRow): void;
    onExecuteSearch(): void;
}

/**
 * 代表单条检索条件的 UI 组件类
 * 封装了 HTML 结构的生成、样式图标初始化、以及各个控件的本地事件响应
 */
export class SearchRow {
    public container: HTMLDivElement;
    public operatorSelect: HTMLSelectElement;
    public typeSelect: HTMLSelectElement;
    public input: HTMLInputElement;
    public caseInput: HTMLInputElement;
    public regexInput: HTMLInputElement;
    private iconButton: HTMLButtonElement;
    
    private app: App;
    private delegate: SearchRowDelegate;

    // 根据不同检索检索类型分配的图标映射
    private static readonly ICONS: Record<string, string> = {
        'file': 'file-text',
        'tag': 'tag',
        'path': 'folder'
    };

    // Obsidian 原生检索支持的所有可识别的操作符类型列表
    private static readonly OPTIONS = ["all", "file", "tag", "path", "content", "line", "block", "section", "task", "task-todo", "tasks-done"];

    constructor(app: App, parent: HTMLElement, delegate: SearchRowDelegate) {
        this.app = app;
        this.delegate = delegate;
        this.render(parent);
        this.initialize();
    }

    /**
     * 渲染单行的搜索条件 DOM
     * 静态地拼装 HTML 结构
     */
    private render(parent: HTMLElement) {
        this.container = parent.createDiv({ cls: 'form-row' });
        
        // 逻辑符下拉
        this.operatorSelect = this.container.createEl('select', { cls: 'operator' });
        ['AND', 'OR', 'NOT'].forEach(op => this.operatorSelect.createEl('option', { text: op, value: op }));
        
        // 检索类型下拉
        this.typeSelect = this.container.createEl('select', { cls: 'type' });
        SearchRow.OPTIONS.forEach(opt => this.typeSelect.createEl('option', { text: t(opt as Parameters<typeof t>[0]) || opt, value: opt }));
        
        // 输入框组
        const inputGroup = this.container.createDiv({ cls: 'input-group' });
        this.input = inputGroup.createEl('input', { type: 'search', cls: 'search-input' });
        this.input.placeholder = t('SEARCH_BUTTON'); // 设一个占位符或随便什么
        this.iconButton = inputGroup.createEl('button', { cls: 'icon-button', attr: { type: 'button' } });
        
        // 控制开关
        const controls = this.container.createDiv({ cls: 'controls' });
        
        // 大小写敏感
        const caseLabel = controls.createEl('label', { cls: 'toggle' });
        this.caseInput = caseLabel.createEl('input', { type: 'radio' });
        caseLabel.createEl('span', { cls: 'toggle-label icon-case-sensitive' });
        
        // 正则表达式
        const regexLabel = controls.createEl('label', { cls: 'toggle' });
        this.regexInput = regexLabel.createEl('input', { type: 'radio' });
        regexLabel.createEl('span', { cls: 'toggle-label icon-regex' });
        
        // 添加删除按钮
        this.container.createEl('button', { cls: 'remove-row', attr: { 'aria-label': t('REMOVE_CRITERIA'), type: 'button' } });
        this.container.createEl('button', { cls: 'add-row', attr: { 'aria-label': t('ADD_CRITERIA'), type: 'button' } });
    }

    /**
     * 初始化图标、绑定交互事件
     */
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

        // 设置图标
        this.typeSelect.onchange = updateIcon;
        updateIcon();

        // 为各个功能按钮设置图标
        SearchRow.setIconForEl(this.container.querySelector('.icon-case-sensitive') as HTMLElement, 'case-sensitive');
        SearchRow.setIconForEl(this.container.querySelector('.icon-regex') as HTMLElement, 'regex');
        SearchRow.setIconForEl(this.container.querySelector('.remove-row') as HTMLElement, 'minus');
        SearchRow.setIconForEl(this.container.querySelector('.add-row') as HTMLElement, 'plus');

        // 按钮交互
        this.iconButton.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleIconClick();
        };
        
        // Radio 逻辑：同一个组互斥，且允许取消选中
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

        // 键盘回车执行检索
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.delegate.onExecuteSearch();
            }
        });

        // 加减号按钮绑定
        this.container.querySelector('.remove-row')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onRemoveRow(this);
        });
        this.container.querySelector('.add-row')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.delegate.onAddRow(this);
        });
    }

    /**
     * 处理点击类型图标执行的自动补全
     */
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
            } else if (type === 'file' || type === 'path') {
                newValue = `"${choice}"`;
            }

            this.input.value = currentValue ? `${currentValue} ${newValue}` : newValue;
            this.input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    private getOptionsByType(type: string): string[] {
        switch (type) {
            case 'file':
                return this.app.vault.getMarkdownFiles().map(f => f.basename).sort();
            case 'tag': {
                const tags = (this.app.metadataCache as unknown as { getTags(): Record<string, number> }).getTags();
                return Object.keys(tags).map(t => t.replace(/^#/, '')).sort();
            }
            case 'path':
                return this.app.vault.getAllLoadedFiles()
                    .filter(f => f instanceof TFolder)
                    .map(f => f.path)
                    .sort();
            default:
                return [];
        }
    }

    /**
     * 辅助方法：确保 DOM 元素已经设置了指定图标
     */
    private static setIconForEl(el: HTMLElement, iconName: string) {
        if (el && !el.hasChildNodes()) {
            setIcon(el, iconName);
        }
    }

    /**
     * 设置行里的显示数据
     */
    public setData(data: { operator?: string, type?: string, value?: string, caseSensitive?: boolean, regex?: boolean }) {
        if (data.operator !== undefined) this.operatorSelect.value = data.operator;
        if (data.type !== undefined) {
             this.typeSelect.value = data.type;
             this.typeSelect.dispatchEvent(new Event('change')); // 触发图标更新
        }
        if (data.value !== undefined) this.input.value = data.value;
        if (data.caseSensitive !== undefined) this.caseInput.checked = data.caseSensitive;
        if (data.regex !== undefined) this.regexInput.checked = data.regex;
    }

    /**
     * 获取当前行输入的值（用于构建查询语句）
     */
    public getValue(): string {
        return this.input.value.trim();
    }

    /**
     * 清空此行数据
     */
    public clear() {
        this.input.value = '';
        this.typeSelect.value = 'all';
        this.typeSelect.dispatchEvent(new Event('change'));
        this.caseInput.checked = false;
        this.regexInput.checked = false;
    }

    /**
     * 销毁此行
     */
    public destroy() {
        this.container.remove();
    }
}
