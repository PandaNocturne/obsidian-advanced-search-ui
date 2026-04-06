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

    private injectionInterval: number | null = null;
    private observer: MutationObserver | null = null;

    /**
     * 插件加载
     */
    async onload() {
        await this.loadSettings();

        if (this.settings.autoScaleUI) {
            document.body.classList.add('advanced-search-auto-scale');
        }

        // 界面就绪后开始注入，并注册布局变动事件防止 UI 丢失
        this.app.workspace.onLayoutReady(() => this.injectSearchUI());
        this.registerEvent(this.app.workspace.on('layout-change', () => this.injectSearchUI()));
        this.updateInterval();

        // 设置页
        this.addSettingTab(new AdvancedSearchSettingTab(this.app, this));
    }

    /**
     * 更新定时注入任务与观察者（针对 Float Search Modal 无延迟适配）
     */
    public updateInterval() {
        if (this.settings.adaptToFloatSearch) {
            // 后备轮询（以防 DOM 事件遗漏）
            if (!this.injectionInterval) {
                this.injectionInterval = window.setInterval(() => this.injectSearchUI(), 500);
                this.registerInterval(this.injectionInterval);
            }

            // 无延迟突变监听
            if (!this.observer) {
                this.observer = new MutationObserver((mutations) => {
                    let shouldInject = false;
                    for (const mutation of mutations) {
                        if (mutation.addedNodes.length > 0) {
                            for (const node of Array.from(mutation.addedNodes)) {
                                if (node instanceof HTMLElement) {
                                    // 过滤掉当前插件自身的 DOM，防止循环触发
                                    if (node.classList.contains('search-form-container') || node.classList.contains('advanced-search-view-switch')) {
                                        continue;
                                    }

                                    if (
                                        node.classList.contains('modal-container') ||
                                        node.classList.contains('search-view-outer') ||
                                        node.classList.contains('search-row') ||
                                        node.classList.contains('search-params') ||
                                        node.classList.contains('float-search-view-switch')
                                    ) {
                                        shouldInject = true;
                                        break;
                                    }
                                    // 常规容器内部是否存在搜索面板块
                                    if (node.tagName === 'DIV' && node.querySelector('.search-params')) {
                                        shouldInject = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (shouldInject) break;
                    }
                    if (shouldInject) {
                        this.injectSearchUI();
                    }
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

    /**
     * 卸载清理
     */
    onunload() {
        document.body.classList.remove('advanced-search-auto-scale');
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.injectionInterval) {
            window.clearInterval(this.injectionInterval);
            this.injectionInterval = null;
        }

        const existingContainers = document.querySelectorAll('.search-form-container');
        existingContainers.forEach(container => container.remove());
        const existingToggles = document.querySelectorAll('.advanced-search-ui-toggle-wrapper');
        existingToggles.forEach(btn => btn.remove());
        this.containerRows.clear();
    }

    /**
     * 将可视化的“高级检索表单”注入到 Obsidian 原生的检索面板中
     * 优化点：直接注入到 search-params 区，跟随原生的显示/隐藏逻辑
     */
    private injectSearchUI() {
        const searchContainers = new Set<HTMLElement>();

        // 1. 标准侧边栏面板搜索
        this.app.workspace.getLeavesOfType('search').forEach(leaf => searchContainers.add(leaf.view.containerEl));

        // 2. 尝试获取 Float Search 乃至所有含有 .search-params 的容器
        if (this.settings.adaptToFloatSearch) {
            document.querySelectorAll('.search-params').forEach(searchParams => {
                let parent = searchParams.parentElement;
                // 向上找到能够包含 search-input-container 的范围，或者直接返回父级
                while (parent && !parent.querySelector('.search-input-container') && !parent.classList.contains('modal')) {
                    parent = parent.parentElement;
                }
                if (parent) searchContainers.add(parent);
            });
        }

        searchContainers.forEach(searchContainer => {
            // 找寻目标注入点：原生检索选项区 (search-params)
            const searchParams = searchContainer.querySelector('.search-params') as HTMLElement;
            if (!searchParams) return;

            // 防止重复注入
            if (!searchContainer.querySelector('.search-form-container')) {
                // 1. 创建主面板容器 (Search Form)
                const queryControlsContainer = searchParams.createDiv({ cls: 'search-form-container' });
                if (this.settings.defaultCollapsed) {
                    queryControlsContainer.style.display = 'none';
                }

                queryControlsContainer.createDiv({ cls: 'search-section' });

                // 2. 底部操作区
                const navButtons = queryControlsContainer.createDiv({ cls: 'navigation-buttons' });
                this.createNavButton(navButtons, t('IMPORT_BUTTON'), 'import-button', () => this.importFromSearchBox(queryControlsContainer));
                this.createNavButton(navButtons, t('COPY_BUTTON'), 'copy-button', () => { void this.copySearchQuery(queryControlsContainer); });

                // 仅在非 Modal 环境下才启用图谱检索按钮，防止触发窗口焦点变换导致弹窗关闭
                const isModal = searchContainer.closest('.modal-container') || searchContainer.closest('.modal');
                if (!isModal) {
                    this.createNavButton(navButtons, t('GRAPH_BUTTON'), 'graph-button', () => this.openGraphView(queryControlsContainer, true));
                }

                this.createNavButton(navButtons, t('SEARCH_BUTTON'), 'search-button', () => this.executeSearch(queryControlsContainer));
                this.createNavButton(navButtons, t('RESET_BUTTON'), 'reset-button', () => this.clearSearchForm(queryControlsContainer));

                // 初始化行管理
                this.containerRows.set(queryControlsContainer, []);

                // 劫持键盘事件
                this.handleKeyboardEvents(queryControlsContainer);

                // 将面板插入到 search-row 的下方
                const searchRowEl = searchContainer.querySelector('.search-row') as HTMLElement;
                if (searchRowEl) {
                    searchRowEl.insertAdjacentElement('afterend', queryControlsContainer);
                } else {
                    searchParams.prepend(queryControlsContainer);
                }

                // 默认初始化出 2 行
                this.clearSearchForm(queryControlsContainer, 2);
            }

            // 注入折叠/展开按钮到 search-row 中
            const searchRow = searchContainer.querySelector('.search-row') as HTMLElement;
            if (searchRow && !searchRow.querySelector('.advanced-search-ui-toggle-wrapper')) {
                // 包装层，赋予更具描述性的类名
                const switchWrapper = searchRow.createDiv({ cls: 'advanced-search-ui-toggle-wrapper' });
                // 使用 Obsidian 标准的可点击图标样式并设置 aria-label 方便展示 tooltip
                const toggleBtn = switchWrapper.createEl('div', {
                    cls: 'clickable-icon advanced-search-toggle',
                    attr: { 'aria-label': t('TOGGLE_ADVANCED_SEARCH') || 'Toggle advanced search' }
                });

                if (!this.settings.defaultCollapsed) {
                    toggleBtn.classList.add('is-active');
                }

                // 使用类似滤镜的图标
                toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-list-filter"><path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/></svg>`;

                toggleBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const queryControlsContainer = searchContainer.querySelector('.search-form-container') as HTMLElement;
                    if (queryControlsContainer) {
                        if (queryControlsContainer.style.display === 'none') {
                            queryControlsContainer.style.display = 'block';
                            toggleBtn.classList.add('is-active');
                        } else {
                            queryControlsContainer.style.display = 'none';
                            toggleBtn.classList.remove('is-active');
                        }
                    }
                };
            }
        });
    }

    /**
     * 快速创建导航按钮的辅助函数
     */
    private createNavButton(parent: HTMLElement, text: string, cls: string, clickHandler: () => void) {
        const btn = parent.createEl('button', { text, cls, attr: { type: 'button' } });
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            clickHandler();
        };
        return btn;
    }

    /**
     * 针对输入控件的键盘行为进行微调，防止如 Home/End、方向键等被 Obsidian 原生拦截
     */
    private handleKeyboardEvents(container: HTMLElement) {
        const handleKeydown = (e: KeyboardEvent) => {
            e.stopPropagation();
            const active = document.activeElement as HTMLElement;
            if (!active) return;

            if (['INPUT', 'SELECT', 'BUTTON'].includes(active.tagName)) {
                // 手动接管 Tab 键切换焦点的逻辑（因为上游 Modal 可能拦截并禁用了基于原生的 Tab 轮询）
                if (e.key === 'Tab') {
                    e.preventDefault();
                    // 用户要求：只在纯文本检索输入框之间互相切换
                    const focusableElements = Array.from(container.querySelectorAll('.search-input')).filter((el: Element) => {
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
                } else if (active.tagName === 'INPUT') {
                    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                    if (keys.includes(e.key)) {
                        // 让这些按键在原生输入框内工作（处理选区和移动光标）
                        const inputActive = active as HTMLInputElement;
                        const start = inputActive.selectionStart;
                        const end = inputActive.selectionEnd;
                        if (start !== null && end !== null) {
                            const len = inputActive.value.length;
                            let newPos = start;
                            if (e.key === 'ArrowLeft') newPos = Math.max(0, (e.shiftKey ? (inputActive.selectionDirection === 'backward' ? start : end) : start) - 1);
                            else if (e.key === 'ArrowRight') newPos = Math.min(len, (e.shiftKey ? (inputActive.selectionDirection === 'backward' ? start : end) : end) + 1);
                            else if (e.key === 'Home') newPos = 0;
                            else if (e.key === 'End') newPos = len;

                            if (e.shiftKey) {
                                inputActive.setSelectionRange(start, newPos);
                            } else {
                                inputActive.setSelectionRange(newPos, newPos);
                            }
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
        const containers = this.settings.adaptToFloatSearch
            ? Array.from(document.querySelectorAll('.search-params')).map(el => el.parentElement).filter(el => el)
            : this.app.workspace.getLeavesOfType('search').map(l => l.view.containerEl);

        const uniqueContainers = Array.from(new Set(containers as HTMLElement[]));

        uniqueContainers.forEach(containerEl => {
            const currentUI = containerEl.querySelector('.search-form-container') as HTMLElement;
            if (!currentUI) return;
            if (uiContainer && currentUI !== uiContainer) return;

            const queryValue = this.convertToObsidianQuery(currentUI);

            // 是否触发图谱搜索 (仅在图谱已打开的情况下生效，不自动开启)
            // 且不允许在 Modal 里触发，因为调用底层视图刷新会导致弹窗自动崩溃/关闭
            const isModal = containerEl.closest('.modal-container') || containerEl.closest('.modal');
            if (this.settings.searchAlsoGraph && !isModal) {
                this.openGraphView(currentUI, false);
            }

            const searchInput = containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = queryValue;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));

                // 将焦点重定向回原生输入框，防止因焦点遗失（停留在按钮上）导致 Float Search 等基于焦点监控的弹窗将自身判定为失焦进而自动清理关闭
                // searchInput.focus();

                // [临时注释掉 Escape 派发以免触发 Float Search 的异常关闭]
                // if (!containerEl.closest('.modal-container') && !containerEl.closest('.modal')) {
                //     searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                // }
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
                case 'OR': part = `OR (${typePrefix}${searchTerm})`; break;
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
        let searchInput: HTMLInputElement | null = null;

        // 先尝试通过 getLeavesOfType 寻找
        const leaf = this.app.workspace.getLeavesOfType('search').find(l => l.view.containerEl.contains(uiContainer));
        if (leaf) {
            searchInput = leaf.view.containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
        }

        // 兼容 float search 或其它未知容器
        if (!searchInput) {
            const container = Array.from(document.querySelectorAll('.search-params')).find(el => el.contains(uiContainer))?.parentElement;
            if (container) {
                searchInput = container.querySelector('.search-input-container > input') as HTMLInputElement;
            }
        }

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
        }, 250); // 增加一点延迟确保新面板已经就绪
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
