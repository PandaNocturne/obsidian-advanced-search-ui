import { App, FuzzySuggestModal, Modal, Notice, Plugin, TFile, TFolder, setIcon, moment } from 'obsidian';
import { t } from './lang/helpers';

/**
 * 高级检索 UI 插件的主入口类
 * 继承自 Obsidian Plugin，负责挂载在原生的检索界面上，实现图形化的复杂逻辑查询构造
 */
export default class AdvancedSearchPlugin extends Plugin {
    // 缓存检索界面容器对象（备用参考）
    private searchUI: HTMLDivElement | null = null;

    /**
     * 插件加载时运行，初始化生命周期钩子
     */
    async onload() {
        // 当工作区布局就绪时（即界面已经完全渲染出来时），注入搜索 UI 界面
        this.app.workspace.onLayoutReady(() => {
            this.injectSearchUI();
        });

        // 注册事件：当布局发生变化（比如刚打开了“搜索面板”）时，再次注入，防止因为面板切换导致 UI 丢失
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.injectSearchUI();
            })
        );
    }

    /**
     * 插件卸载时运行，负责清理战场，删掉注入到 DOM 里的元素
     */
    onunload() {
        // 查找并移除所有被注入到原生检索界面的容器元素
        const existingContainers = document.querySelectorAll('.search-form-container');
        existingContainers.forEach(container => container.remove());
    }

    /**
     * 将可视化的“高级检索表单”注入到 Obsidian 原生的检索面板中
     */
    private injectSearchUI() {
        // 试图获取所有的"search"（检索视图）视窗
        const searchLeaves = this.app.workspace.getLeavesOfType('search');
        if (searchLeaves.length === 0) return;

        // 给每个搜索视图都插入这个可视化控制器
        searchLeaves.forEach(leaf => {
            // 获取原生检索的核心 DOM 容器
            const searchContainer = leaf.view.containerEl;
            // 防止重复注入，如果是已经注过的，直接跳过
            if (searchContainer.querySelector('.search-form-container')) return;

            // 创建插件自己的控制器容器
            const queryControlsContainer = searchContainer.createDiv({ cls: 'search-form-container' });
            
            // 内部包括两个部分：1. 搜索条件组的容器
            const searchSection = queryControlsContainer.createDiv({ cls: 'search-section' });
            
            // 初始化首个查询行
            const firstRow = this.renderRow(searchSection);
            
            // 2. 底部的各类操作按钮容器
            const navButtons = queryControlsContainer.createDiv({ cls: 'navigation-buttons' });
            navButtons.createEl('button', { text: t('IMPORT_BUTTON'), cls: 'import-button' });
            navButtons.createEl('button', { text: t('COPY_BUTTON'), cls: 'copy-button' });
            navButtons.createEl('button', { text: t('GRAPH_BUTTON'), cls: 'graph-button' });
            navButtons.createEl('button', { text: t('SEARCH_BUTTON'), cls: 'search-button' });
            navButtons.createEl('button', { text: t('RESET_BUTTON'), cls: 'reset-button' });

            /**
             * 处理在控件输入框内原生的键盘事件
             * 这是由于 Obsidian 环境内有全局的快捷键拦截，需要在这里进行截断和特殊处理输入框的光标移动
             */
            const handleKeydown = (e: KeyboardEvent) => {
                e.stopPropagation();

                const active = document.activeElement as HTMLInputElement;
                if (active && active.tagName === 'INPUT') {
                    // 当处于输入框时，如果按下了方向键，则执行原生行为而不触发 Obsidian 快捷键
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

                            // 模拟不同编辑按键的行为
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

                            // 如果带有 Shift，执行选区操作，否则清空选区并挪动光标
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
            
            // 将键盘事件绑定到控件上以阻止冒泡
            queryControlsContainer.addEventListener('keydown', handleKeydown as EventListener);
            queryControlsContainer.addEventListener('keyup', (e) => e.stopPropagation());
            queryControlsContainer.addEventListener('keypress', (e) => e.stopPropagation());

            // 将我们拼装的控件扔在原生搜索面板的最前面（prepend）
            searchContainer.prepend(queryControlsContainer);
            // 进一步初始化各种绑定的事件（如操作按钮点击）
            this.initializeUI(queryControlsContainer);
        });
    }

    /**
     * 渲染单行的搜索条件
     * 负责生成需要的 DOM 并拼进父元素，但是这个时候先不绑定复杂的业务逻辑事件
     * @param parent 挂载点的 DOM 容器
     */
    private renderRow(parent: HTMLElement): HTMLDivElement {
        // 创建本行包裹
        const row = parent.createDiv({ cls: 'form-row' });
        
        // 操作符下拉：AND / OR / NOT
        const operatorSelect = row.createEl('select', { cls: 'operator' });
        ['AND', 'OR', 'NOT'].forEach(op => operatorSelect.createEl('option', { text: op }));
        
        // 目标类型下拉：全库, 特定标签, 特定文件夹, 特定文件等
        const typeSelect = row.createEl('select', { cls: 'type' });
        this.options.forEach(opt => typeSelect.createEl('option', { text: opt }));
        
        // 输入框包裹
        const inputGroup = row.createDiv({ cls: 'input-group' });
        const input = inputGroup.createEl('input', { type: 'search', cls: 'search-input' });
        input.name = 'file'; // Input 的默认名（仅标识）
        inputGroup.createEl('button', { cls: 'icon-button' }); // 备用的图标交互按钮
        
        // 修饰和开关控件块
        const controls = row.createDiv({ cls: 'controls' });
        
        // 大小写敏感开关 (match-case)
        const caseLabel = controls.createEl('label', { cls: 'toggle' });
        const caseInput = caseLabel.createEl('input', { type: 'radio' });
        caseInput.name = 'search-mode';
        caseInput.className = 'case-sensitive';
        caseLabel.createEl('span', { cls: 'toggle-label icon-case-sensitive' });
        
        // 正则表达式开关 (regex)
        const regexLabel = controls.createEl('label', { cls: 'toggle' });
        const regexInput = regexLabel.createEl('input', { type: 'radio' });
        regexInput.name = 'search-mode';
        regexInput.className = 'regex';
        regexLabel.createEl('span', { cls: 'toggle-label icon-regex' });
        
        // 最后面一排的添加、删除行按钮
        row.createEl('button', { cls: 'remove-row', attr: { 'aria-label': t('REMOVE_CRITERIA') } });
        row.createEl('button', { cls: 'add-row', attr: { 'aria-label': t('ADD_CRITERIA') } });
        
        return row;
    }

    /**
     * 将我们手动组装的搜索 UI 注册对应的点击事件
     * @param container 检索控件的外层包裹 
     */
    private initializeUI(container: HTMLDivElement) {
        // 对页面上现存所有的表单行绑定状态重置逻辑
        const rows = container.querySelectorAll('.form-row');
        rows.forEach(row => this.initializeRow(row as HTMLDivElement));

        // 对最底部的功能按钮绑定对应的入口
        container.querySelector('.add-row')?.addEventListener('click', (e) => this.addRow(e.target as HTMLButtonElement));
        container.querySelector('.remove-row')?.addEventListener('click', (e) => this.removeRow(e.target as HTMLButtonElement));
        container.querySelector('.import-button')?.addEventListener('click', () => this.importFromSearchBox(container));
        container.querySelector('.copy-button')?.addEventListener('click', () => this.copySearchQuery(container));
        container.querySelector('.graph-button')?.addEventListener('click', () => this.openGraphView(container));
        container.querySelector('.search-button')?.addEventListener('click', () => this.executeSearch(container));
        container.querySelector('.reset-button')?.addEventListener('click', () => this.clearSearchForm(container));
        
        // 初始设置：直接走一次清空重置，把行数设置成默认的 2 行
        this.clearSearchForm(container);
    }

    // 根据不同检索检索类型分配的图标映射
    private icons: Record<string, string> = {
        'file': 'file-text',
        'tag': 'tag',
        'path': 'folder'
    };

    // Obsidian 原生检索支持的所有可识别的操作符类型
    private options = ["all", "file", "tag", "path", "content", "line", "block", "section", "task", "task-todo", "tasks-done"];

    /**
     * 为单行内各自的输入框和控件附加对应的交互事件，以完善选择反馈逻辑
     * @param row 当前要初始化的那一行
     * @param type 如果传入，将其设为下拉默认项
     * @param clearInput 若为 true，代表需要彻底清空里面的所有输入文本 
     */
    private initializeRow(row: HTMLDivElement, type: string = 'all', clearInput: boolean = false) {
        if (clearInput) {
            // 注意这边囊括了 type=search 为了兼容清空新改动的输入框
            row.querySelectorAll('input[type="text"], input[type="search"]').forEach((input: HTMLInputElement) => input.value = '');
        }

        const typeSelect = row.querySelector('.type') as HTMLSelectElement;
        const iconButton = row.querySelector('.icon-button') as HTMLButtonElement;

        typeSelect.value = type;
        
        /**
         * 当选择的检索类型改变时，更新后方跟随的快捷按钮的图标（例如选文件夹，就变成 folder 图片）
         */
        const updateIcon = () => {
            const selected = typeSelect.value;
            iconButton.innerHTML = '';
            const iconName = this.icons[selected] || '';
            if (iconName) {
                setIcon(iconButton, iconName);
            }
            iconButton.setAttribute('data-select-option', iconName ? selected : '');
        };

        // 以下这几段代码确保如果原有的图标不存了就重新赋予原生 Obsidian SVG Icon
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

        // 把选择框改变后更新图标的方法绑定上，并在初始化时走一次确保显示正确
        typeSelect.onchange = updateIcon;
        // 使用 addEventListener 能避免被覆盖，但原有逻辑也保留
        typeSelect.addEventListener('change', updateIcon);
        updateIcon();

        // 按钮点击后允许模糊搜索出预设的文件名/标签名进行补全
        iconButton.onclick = () => this.handleTypeIconClick(row);

        // 为了保证只有单个 Radio 会在一排互斥工作，强制给 Radio 重写名字并配置为同一组
        const radios = row.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>;
        const rowName = `search-mode-${Math.random().toString(36).substr(2, 9)}`;
        radios.forEach(radio => {
            radio.name = rowName;
            let lastState = false;
            // 通过逻辑，允许即便点击互斥 Radio 也能起到类似 Checkbox 取消选中自己的效果
            radio.onclick = (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked && lastState) {
                    target.checked = false;
                }
                lastState = target.checked;
            };
        });

        // 按 Enter 就去触发执行整个界面的检索
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

    /**
     * 点击加号：新增一行
     * 将会继承当前行的基础状态（操作算符、选择栏的当前值）作为起点
     * @param button 加号按钮自身 
     */
    private addRow(button: HTMLButtonElement) {
        const currentRow = button.closest('.form-row') as HTMLDivElement;
        const currentType = (currentRow.querySelector('.type') as HTMLSelectElement).value;
        const currentOperator = (currentRow.querySelector('.operator') as HTMLSelectElement).value;
        
        const parent = currentRow.parentElement as HTMLElement;
        const newRow = this.renderRow(parent); // 先创建一个空壳子 DOM

        // 放到现在的这行的正下方
        currentRow.parentNode?.insertBefore(newRow, currentRow.nextSibling);
        // 初始化各种事件，并且继承 type，清空它的输入框内容
        this.initializeRow(newRow, currentType, true);
        (newRow.querySelector('.operator') as HTMLSelectElement).value = currentOperator;
    }

    /**
     * 点击减号：移除一行
     * 若已无多余条件时不作物理删除，仅将被操作的此行清空重置，防止误删而找不回 DOM
     * @param button 减号按钮自身 
     */
    private removeRow(button: HTMLButtonElement) {
        const row = button.closest('.form-row') as HTMLDivElement;
        const container = row.parentNode;
        // 如果目前不是孤零零只有一行，就直接移除元素
        if (container && container.querySelectorAll('.form-row').length > 1) {
            row.remove();
        } else {
            // 如果已经是最后一行了，那就重新还原它为空，而不是去把它干掉
            this.initializeRow(row, 'all', true);
            const textInput = row.querySelector('input[type="search"]') as HTMLInputElement;
            if (textInput) {
                // 主动派发事件以确保 Obsidian 或外部框架能够监听到这个还原的动作
                textInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    /**
     * 处理点击类型旁侧的图标（例如选择了 tag 时，输入框右侧出现的自动补全标签按钮）
     * 提供一个系统提供的模糊推荐弹窗
     * @param row 当前发生交互的那一行 DOM 
     */
    private async handleTypeIconClick(row: HTMLDivElement) {
        const typeSelect = row.querySelector('.type') as HTMLSelectElement;
        const type = typeSelect.value;
        // 获取可供提示的数据集，比如“全库所有标签名”、“全库所有文件名”
        const options = this.getOptionsByType(type);
        if (options.length === 0) return;

        // 这里开启我们自定义的模糊搜索弹窗去选取一个内容
        const choice = await new GenericSuggester(this.app, options).openAndGetValue();
        if (choice) {
            const input = row.querySelector('.search-input') as HTMLInputElement;
            if (!input) return;
            
            const currentValue = input.value.trim();
            let newValue = choice;

            // 特殊格式化处理（如：标签需要把 # 裁掉，因为搜索系统会自动生成查询前缀；带空格路径需要双引号等）
            if (type === 'tag') {
                newValue = choice.replace(/^#/, '');
            } else if (type === 'file' || type === 'path') {
                newValue = `"${choice}"`;
            }

            if (currentValue) {
                input.value = `${currentValue} ${newValue}`;
            } else {
                input.value = newValue;
            }
            
            // 提交修改，派发气泡 Input 事件告知系统重渲染
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * 根据下拉框的类型，抓取对应 Obsidian 整个库的实际数据列表以便填充提示下拉框
     * @param type 诸如 file / tag / path
     */
    private getOptionsByType(type: string): string[] {
        switch (type) {
            case 'file':
                // 返回所有 Markdown 文件的基础名并排个序
                return this.app.vault.getMarkdownFiles().map(f => f.basename).sort();
            case 'tag':
                // 对于标签，抓取内部缓存系统的全部 Tag 字典键，然后截掉开头的 #
                const tags = (this.app.metadataCache as any).getTags();
                return Object.keys(tags).map(t => t.replace(/^#/, '')).sort();
            case 'path':
                // 获取全部在载文件夹下的具体路径进行选择
                return this.app.vault.getAllLoadedFiles()
                    .filter(f => f instanceof TFolder)
                    .map(f => f.path)
                    .sort();
            default:
                return [];
        }
    }

    /**
     * 核心转换函数：
     * 将可视化多行的 HTML 表单条件状态，提取出并拼接为一个能被 Obsidian 原生引擎解析的标准字符串查询
     * @param container 被包裹的查询 UI 容器 
     * @param lineBreak 决定要不要带换行。如果在复制时经常希望使用换行分隔便于展示，可以传 `true`
     */
    private convertToObsidianQuery(container: HTMLElement, lineBreak = false): string {
        const formRows = container.querySelectorAll('.form-row');
        const query: string[] = [];

        formRows.forEach(row => {
            const operator = (row.querySelector('.operator') as HTMLSelectElement).value;
            let type = (row.querySelector('.type') as HTMLSelectElement).value;
            // 类型为 all 即全局，不需要声明前缀
            type = type === 'all' ? "" : `${type}:`;
            
            const input = (row.querySelector('input[type="search"]') as HTMLInputElement).value;
            const isCaseSensitive = (row.querySelector('.case-sensitive') as HTMLInputElement).checked;
            const isRegex = (row.querySelector('.regex') as HTMLInputElement).checked;

            if (input.trim()) {
                let searchTerm = input.trim();
                
                // 处理如果是正则格式的情况：包裹两条正斜杠 / / 
                if (isRegex) {
                    searchTerm = `/${searchTerm}/`;
                } else if (type === 'tag:') {
                    // 如果指定查询了 tag，需要检查用户给定的有没有加 # 不加的话补一下
                    searchTerm = searchTerm.split(" ").map(t => t.startsWith("#") ? t : `#${t}`).join(" ");
                } else {
                    // 通用的检索将其在原生查询内包裹成组以防逻辑覆盖
                    searchTerm = `(${searchTerm})`;
                }

                // 处理是否需要区分大小写
                if (isCaseSensitive) {
                    searchTerm = `match-case:${searchTerm}`;
                }

                // 添加行逻辑 AND OR NOT
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

    /**
     * 主动将表单组的逻辑拼组好，并直接发送到底下的原生输入框执行并模拟回车
     * @param uiContainer 获取当前操作区的 DOM 对象
     */
    private executeSearch(uiContainer?: HTMLElement) {
        if (uiContainer) {
            // 找到包含这个点击按钮的可视化查询树（所在的 Leaf）
            const leaf = this.app.workspace.getLeavesOfType('search').find(l => l.view.containerEl.contains(uiContainer));
            if (leaf) {
                this.performSearchOnLeaf(leaf, uiContainer);
                return;
            }
        }
        
        // 如果没有特定指定，找所有已存在的原生搜索视图并全都走一遍执行
        this.app.workspace.getLeavesOfType('search').forEach(leaf => {
            const searchUI = leaf.view.containerEl.querySelector('.search-form-container') as HTMLElement;
            if (!searchUI) return;
            this.performSearchOnLeaf(leaf, searchUI);
        });
    }

    /**
     * 将生成好的复杂指令写进原生 DOM Input，并制造“按下取消或回车”让底层框架响应请求
     * @param leaf 原生的视图对象（搜索主窗口） 
     * @param searchUI 咱们的高级可视化组件 DOM
     */
    private performSearchOnLeaf(leaf: any, searchUI: HTMLElement) {
        const queryValue = this.convertToObsidianQuery(searchUI);
        // 这是 Obsidian 原生隐藏的输入框
        const searchInput = leaf.view.containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
        
        if (searchInput && searchInput.value !== queryValue) {
            searchInput.value = queryValue;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            // 通过抛出 Escape KeyEvent，通常能迫使 Obsidian 取消焦点并进行刷新读取当前内容
            searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true
            }));
        }
    }

    /**
     * 把组装好的复杂检索指令传递到图谱查询上
     * @param uiContainer 获取当前操作区的 DOM 对象 
     */
    private openGraphView(uiContainer: HTMLElement) {
        const queryValue = this.convertToObsidianQuery(uiContainer);

        // 利用底层命令，主动呼出 Obsidian Graph
        (this.app as any).commands.executeCommandById("graph:open");

        // 延迟等图谱弹出并挂载至 DOM 完成后，再将搜索指令写进它的内置搜索框过滤
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
        }, 150); // 150ms 缓冲保证 DOM 建好了
    }

    /**
     * 将目前组册的高级筛选条件清除，并给表单重新填充指定的新空行数
     * @param uiContainer 要清理的 DOM 容器，不指定也会清理所有找得到的
     * @param n 清空后恢复呈现出多少行空的条件 
     */
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

            // 防止刚开启时还没初始化的情况
            if (!templateRow) return;

            // 粗暴地干掉所有 DOM 后重新添加 n 个空状态行
            container.innerHTML = '';
            for (let i = 0; i < n; i++) {
                const newRow = templateRow.cloneNode(true) as HTMLDivElement;
                container.appendChild(newRow);
                // 使用 all 并走 clearInput 初始化重置数据防挂单污染
                this.initializeRow(newRow, 'all', true);
            }
        });
    }

    /**
     * “导入”按钮事件：
     * 分析 Obsidian 原生文本框内由其它源头复制来的、手写的原生查询语句。
     * 将其反序列化，拆解成一块块逻辑，自动生成并配置我们的可视化检索模块
     * @param uiContainer 获取当前界面的 DOM 源 
     */
    private importFromSearchBox(uiContainer: HTMLElement) {
        const leaf = this.app.workspace.getLeavesOfType('search').find(l => l.view.containerEl.contains(uiContainer));
        if (!leaf) return;

        // 试图抓取原生的那一个搜索控制横条上的 Input
        const searchInput = leaf.view.containerEl.querySelector('.search-row input') as HTMLInputElement;
        if (!searchInput || !searchInput.value.trim()) {
            new Notice(t('NO_QUERY_TO_IMPORT'));
            return;
        }

        // 把语句抠出来，依据查询闭包右括号+特定组合词来进行反解析为逻辑片段 Parts
        const query = searchInput.value.trim();
        const parts = query.split(/(?<=\)) (?=[-(]|\w+:|\()/g).filter(p => p.trim());

        // 清空 UI，并且正好用 Parts 的数量作为参数，生成对应数量匹配的新条件行
        this.clearSearchForm(uiContainer, parts.length);
        const container = uiContainer.querySelector('.search-section') as HTMLElement;
        const rows = container.querySelectorAll('.form-row');

        // 将分段循环塞给对应的 UI 控制元件
        parts.forEach((part, index) => {
            const row = rows[index] as HTMLDivElement;
            if (!row) return;

            // 步骤一：推演操作符 (NOT / OR / AND)
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

            // 步骤二：识别是否含有特定的原生子类搜索类型
            const typeMatch = value.match(/^(file|tag|path|content|line|block|section|task|task-todo|tasks-done):/);
            if (typeMatch && typeMatch[1]) {
                type = typeMatch[1];
                value = value.slice(typeMatch[0].length); // 裁除类型头，留下剩余供解析的内容
            }

            // 修改 Type 并且非常关键的是需要立刻 dispatchEvent 'change'，这会确保我们触发了重置 Icon 等等 UI 一致化工作
            const typeSelect = row.querySelector('.type') as HTMLSelectElement;
            typeSelect.value = type;
            typeSelect.dispatchEvent(new Event('change'));

            // 步骤三：检测开关条件 match-case 和正则斜杠 
            if (value.startsWith('match-case:')) {
                (row.querySelector('.case-sensitive') as HTMLInputElement).checked = true;
                value = value.slice(11);
            }

            if (value.startsWith('/') && value.endsWith('/')) {
                (row.querySelector('.regex') as HTMLInputElement).checked = true;
                value = value.slice(1, -1);
            }

            // 特殊对 Tag 截一下 # 符号确保符合预期逻辑
            if (type === 'tag') {
                value = value.replace(/#/g, '');
            }
            
            // 兜底清理外部括号后注入到当前行的文本框中
            (row.querySelector('input[type="search"]') as HTMLInputElement).value = value.replace(/^\(|\)$/g, '');
        });
    }

    /**
     * 将现下组装出的查询字符串，转化为专门用于 Markdown 文档 query block 的语法
     * 然后自动放入剪贴板内，并给屏幕右边发一个气泡提示（Notice）
     * @param uiContainer 所属 DOM 节点
     */
    private copySearchQuery(uiContainer: HTMLElement) {
        // lineBreak=true 使它输出时每一行条件都是独立换行，更加干净美观
        const queryValue = this.convertToObsidianQuery(uiContainer, true);
        const formattedQuery = `\`\`\`query\n${queryValue}\n\`\`\``;
        
        navigator.clipboard.writeText(formattedQuery).then(() => {
            new Notice(t('COPIED_TO_CLIPBOARD'));
        }).catch(() => {
            new Notice(t('FAILED_TO_COPY'));
        });
    }
}

/**
 * 原生的 FuzzySuggestModal 扩展弹窗，帮助弹出一个简单的“点击选项自动填充关键词”弹窗的辅助类
 */
class GenericSuggester extends FuzzySuggestModal<string> {
    private resolve!: (value: string) => void;
    private options: string[];

    constructor(app: App, options: string[]) {
        super(app);
        this.options = options;
    }

    // 核心接口层实现：返回此弹层包含所有可能项的数组
    getItems(): string[] {
        return this.options;
    }

    // 核心接口层实现：将某一项映射出它要在界面上显示的文字
    getItemText(item: string): string {
        return item;
    }

    // 事件：用户敲击或者鼠标选了这个选项时的回调
    onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.resolve(item);
    }

    /**
     * 打开选择器并作为一个同步（Promise）来返回用户选中了什么字符串
     * 这让外部能够直接进行 await 操作而不用再拆散处理回到闭包
     */
    openAndGetValue(): Promise<string> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }
}
