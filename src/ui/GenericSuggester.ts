import { App, FuzzySuggestModal } from 'obsidian';

/**
 * 原生的 FuzzySuggestModal 扩展弹窗，帮助弹出一个简单的“点击选项自动填充关键词”弹窗的辅助类
 */
export class GenericSuggester extends FuzzySuggestModal<string> {
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
