import { Notice, Plugin } from 'obsidian';
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
    
    // 跟踪每个搜索面板中对应的可视化行对象列表
    private containerRows: Map<HTMLElement, SearchRow[]> = new Map();

    /**
     * 插件加载
     */
    async onload() {
        await this.loadSettings();

        // 界面就绪后开始注入，并注册布局变动事件防止 UI 丢失
        this.app.workspace.onLayoutReady(() => this.injectSearchUI());
        this.registerEvent(this.app.workspace.on('layout-change', () => this.injectSearchUI()));

        // 设置页
        this.addSettingTab(new AdvancedSearchSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData() as Partial<AdvancedSearchSettings>));
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * 卸载清理
     */
    onunload() {
        const existingContainers = document.querySelectorAll('.search-form-container');
        existingContainers.forEach(container => container.remove());
        this.containerRows.clear();
    }

    /**
     * 将可视化的“高级检索表单”注入到 Obsidian 原生的检索面板中
     * 优化点：直接注入到 search-params 区，跟随原生的显示/隐藏逻辑
     */
    private injectSearchUI() {
        const searchLeaves = this.app.workspace.getLeavesOfType('search');
        searchLeaves.forEach(leaf => {
            const searchContainer = leaf.view.containerEl;
            
            // 找寻目标注入点：原生检索选项区 (search-params)
            const searchParams = searchContainer.querySelector('.search-params') as HTMLElement;
            if (!searchParams) return;

            // 防止重复注入
            if (searchParams.querySelector('.search-form-container')) return;

            // 1. 创建主面板容器 (Search Form)
            const queryControlsContainer = searchParams.createDiv({ cls: 'search-form-container' });
            queryControlsContainer.createDiv({ cls: 'search-section' });
            
            // 2. 底部操作区
            const navButtons = queryControlsContainer.createDiv({ cls: 'navigation-buttons' });
            this.createNavButton(navButtons, t('IMPORT_BUTTON'), 'import-button', () => this.importFromSearchBox(queryControlsContainer));
            this.createNavButton(navButtons, t('COPY_BUTTON'), 'copy-button', () => { void this.copySearchQuery(queryControlsContainer); });
            this.createNavButton(navButtons, t('GRAPH_BUTTON'), 'graph-button', () => this.openGraphView(queryControlsContainer, true));
            this.createNavButton(navButtons, t('SEARCH_BUTTON'), 'search-button', () => this.executeSearch(queryControlsContainer));
            this.createNavButton(navButtons, t('RESET_BUTTON'), 'reset-button', () => this.clearSearchForm(queryControlsContainer));

            // 初始化行管理
            this.containerRows.set(queryControlsContainer, []);
            
            // 劫持键盘事件
            this.handleKeyboardEvents(queryControlsContainer);

            // 将面板插入到 search-params 的最前端
            searchParams.prepend(queryControlsContainer);
            
            // 默认初始化出 2 行
            this.clearSearchForm(queryControlsContainer, 2);
        });
    }

    /**
     * 快速创建导航按钮的辅助函数
     */
    private createNavButton(parent: HTMLElement, text: string, cls: string, clickHandler: () => void) {
        const btn = parent.createEl('button', { text, cls });
        btn.onclick = clickHandler;
        return btn;
    }

    /**
     * 针对输入控件的键盘行为进行微调，防止如 Home/End、方向键等被 Obsidian 原生拦截
     */
    private handleKeyboardEvents(container: HTMLElement) {
        const handleKeydown = (e: KeyboardEvent) => {
            e.stopPropagation();
            const active = document.activeElement as HTMLInputElement;
            if (active && active.tagName === 'INPUT') {
                const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                if (keys.includes(e.key)) {
                    // 让这些按键在原生输入框内工作（处理选区和移动光标）
                    const start = active.selectionStart;
                    const end = active.selectionEnd;
                    if (start !== null && end !== null) {
                        // 这是一个简单的原生光标管理逻辑，保持现有实现即可
                        const len = active.value.length;
                        let newPos = start;
                        if (e.key === 'ArrowLeft') newPos = Math.max(0, (e.shiftKey ? (active.selectionDirection === 'backward' ? start : end) : start) - 1);
                        else if (e.key === 'ArrowRight') newPos = Math.min(len, (e.shiftKey ? (active.selectionDirection === 'backward' ? start : end) : end) + 1);
                        else if (e.key === 'Home') newPos = 0;
                        else if (e.key === 'End') newPos = len;

                        if (e.shiftKey) {
                           active.setSelectionRange(start, newPos);
                        } else {
                           active.setSelectionRange(newPos, newPos);
                        }
                    }
                }
            }
        };
        container.addEventListener('keydown', handleKeydown as EventListener);
        container.addEventListener('keyup', (e) => e.stopPropagation());
        container.addEventListener('keypress', (e) => e.stopPropagation());
    }

    /**
     * SearchRowDelegate 实现: 添加行
     */
    onAddRow(currentRow: SearchRow) {
        const container = currentRow.container.parentElement?.parentElement as HTMLElement;
        const rows = this.containerRows.get(container);
        if (!rows) return;

        const index = rows.indexOf(currentRow);
        const section = container.querySelector('.search-section') as HTMLElement;
        
        const newRow = new SearchRow(this.app, section, this);
        // 插入到当前行后面
        currentRow.container.parentNode?.insertBefore(newRow.container, currentRow.container.nextSibling);
        rows.splice(index + 1, 0, newRow);

        // 继承当前行的一些状态
        newRow.setData({
            type: currentRow.typeSelect.value,
            operator: currentRow.operatorSelect.value
        });
    }

    /**
     * SearchRowDelegate 实现: 移除行
     */
    onRemoveRow(currentRow: SearchRow) {
        const container = currentRow.container.parentElement?.parentElement as HTMLElement;
        const rows = this.containerRows.get(container);
        if (!rows) return;

        if (rows.length > 1) {
            const index = rows.indexOf(currentRow);
            rows.splice(index, 1);
            currentRow.destroy();
        } else {
            // 最后一行的逻辑不是物理删除，而是重置
            currentRow.clear();
        }
    }

    /**
     * SearchRowDelegate 实现: 执行检索
     */
    onExecuteSearch() {
        this.executeSearch();
    }

    /**
     * 核心逻辑：执行检索并写入原生输入框
     */
    private executeSearch(uiContainer?: HTMLElement) {
        const searchLeaves = this.app.workspace.getLeavesOfType('search');
        
        searchLeaves.forEach(leaf => {
            const currentUI = leaf.view.containerEl.querySelector('.search-form-container') as HTMLElement;
            if (!currentUI) return;
            if (uiContainer && currentUI !== uiContainer) return;

            const queryValue = this.convertToObsidianQuery(currentUI);
            
            // 是否触发图谱搜索 (仅在图谱已打开的情况下生效，不自动开启)
            if (this.settings.searchAlsoGraph) {
                this.openGraphView(currentUI, false);
            }

            const searchInput = leaf.view.containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = queryValue;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            }
        });
    }

    /**
     * 核心逻辑：转换可视化条件为标准查询字符串
     */
    private convertToObsidianQuery(container: HTMLElement, lineBreak = false): string {
        const rows = this.containerRows.get(container) || [];
        const queryParts: string[] = [];

        rows.forEach(row => {
            const value = row.getValue();
            if (!value) return;

            const op = row.operatorSelect.value;
            let typePrefix = row.typeSelect.value === 'all' ? '' : `${row.typeSelect.value}:`;
            const isCase = row.caseInput.checked;
            const isRegex = row.regexInput.checked;

            let searchTerm = value;
            if (isRegex) {
                searchTerm = `/${searchTerm}/`;
            } else if (row.typeSelect.value === 'tag') {
                searchTerm = searchTerm.split(" ").map(t => t.startsWith("#") ? t : `#${t}`).join(" ");
            } else {
                searchTerm = `(${searchTerm})`;
            }

            if (isCase) searchTerm = `match-case:${searchTerm}`;

            let part = '';
            switch (op) {
                case 'AND': part = `(${typePrefix}${searchTerm})`; break;
                case 'OR':  part = `OR (${typePrefix}${searchTerm})`; break;
                case 'NOT': part = `-(${typePrefix}${searchTerm})`; break;
            }
            queryParts.push(part);
        });

        return lineBreak ? queryParts.join("\n") : queryParts.join(" ");
    }

    /**
     * “导入”逻辑：利用刚才创建的 Parser 健壮拆解查询
     */
    private importFromSearchBox(uiContainer: HTMLElement) {
        const leaf = this.app.workspace.getLeavesOfType('search').find(l => l.view.containerEl.contains(uiContainer));
        if (!leaf) return;

        const searchInput = leaf.view.containerEl.querySelector('.search-row input') as HTMLInputElement;
        if (!searchInput || !searchInput.value.trim()) {
            new Notice(t('NO_QUERY_TO_IMPORT'));
            return;
        }

        const query = searchInput.value.trim();
        const parsedRows = QueryParser.parse(query);

        if (parsedRows.length === 0) {
            new Notice(t('NO_QUERY_TO_IMPORT')); // 或者一个专门的错误提示
            return;
        }

        // 清空 UI 后重新填充
        const section = uiContainer.querySelector('.search-section') as HTMLElement;
        this.clearSearchForm(uiContainer, 0); // 先彻底清空

        const rows: SearchRow[] = [];
        parsedRows.forEach(data => {
            const newRow = new SearchRow(this.app, section, this);
            newRow.setData({
                operator: data.operator,
                type: data.type,
                value: data.value,
                caseSensitive: data.caseSensitive,
                regex: data.isRegex
            });
            rows.push(newRow);
        });
        this.containerRows.set(uiContainer, rows);
    }

    /**
     * 重置表单
     */
    private clearSearchForm(uiContainer: HTMLElement, n = 2) {
        const section = uiContainer.querySelector('.search-section') as HTMLElement;
        if (!section) return;

        // 清除旧对象引用
        const oldRows = this.containerRows.get(uiContainer) || [];
        oldRows.forEach(r => r.destroy());
        
        const newRows: SearchRow[] = [];
        section.innerHTML = '';
        for (let i = 0; i < n; i++) {
            newRows.push(new SearchRow(this.app, section, this));
        }
        this.containerRows.set(uiContainer, newRows);
    }

    /**
     * 更新全局图谱查询
     * @param uiContainer 所在的容器
     * @param forceOpen 是否强制打开图谱（点击图谱按钮时为 true）
     */
    private openGraphView(uiContainer: HTMLElement, forceOpen = false) {
        const queryValue = this.convertToObsidianQuery(uiContainer);
        const graphLeaves = this.app.workspace.getLeavesOfType('graph');

        // 如果图谱没开，且没有要求强制开启，则直接跳过（自动同步逻辑）
        if (graphLeaves.length === 0 && !forceOpen) return;

        // 如果是手动点击按钮（forceOpen = true），无论开没开都执行指令，以达到打开或聚焦的效果
        if (forceOpen) {
            (this.app as unknown as { commands: { executeCommandById(id: string): void } }).commands.executeCommandById("graph:open");
        }

        // 延迟等图谱挂载或同步（如果是刚打开，需要一点时间加载 DOM）
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
        }, 300); // 增加一点延迟确保新面板已经就绪
    }

    /**
     * 复制查询块
     */
    private async copySearchQuery(uiContainer: HTMLElement) {
        const queryValue = this.convertToObsidianQuery(uiContainer, true);
        const formattedQuery = `\`\`\`query\n${queryValue}\n\`\`\``;
        await navigator.clipboard.writeText(formattedQuery);
        new Notice(t('COPIED_TO_CLIPBOARD'));
    }
}
