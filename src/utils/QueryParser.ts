/**
 * 搜索行的数据结构定义
 */
export interface ParsedRow {
    operator: 'AND' | 'OR' | 'NOT';
    type: string;
    value: string;
    caseSensitive: boolean;
    isRegex: boolean;
}

/**
 * 健壮的查询解析器，负责将 Obsidian 原生搜索字符串解析为可视化行结构
 */
export class QueryParser {
    /**
     * 将查询字符串拆分为各个部分的行
     */
    static parse(query: string): ParsedRow[] {
        if (!query.trim()) return [];

        const tokens = this.tokenize(query.trim());
        const rows: ParsedRow[] = [];

        let i = 0;
        while (i < tokens.length) {
            const token = tokens[i];
            if (token === undefined) break;

            let currentToken = token;
            let operator: 'AND' | 'OR' | 'NOT' = 'AND';

            // 1. 识别操作符
            if (currentToken === 'OR') {
                operator = 'OR';
                i++;
                if (i < tokens.length) {
                    currentToken = tokens[i]!;
                } else {
                    break; // 忽略末尾孤立的 OR
                }
            } else if (currentToken.startsWith('OR ')) {
                operator = 'OR';
                currentToken = currentToken.slice(3);
            } else if (currentToken.startsWith('-')) {
                operator = 'NOT';
                currentToken = currentToken.slice(1);
            }

            // 2. 解析核心内容
            rows.push(this.parsePart(currentToken, operator));
            i++;
        }

        return rows;
    }

    /**
     * 按空格拆分字符串，但忽略括号和引号内的空格
     */
    private static tokenize(query: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inQuotes = false;
        let parenLevel = 0;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
            } else if (char === '(' && !inQuotes) {
                parenLevel++;
                current += char;
            } else if (char === ')' && !inQuotes) {
                parenLevel--;
                current += char;
            } else if (char === ' ' && !inQuotes && parenLevel === 0) {
                if (current.trim()) {
                    tokens.push(current.trim());
                }
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) {
            tokens.push(current.trim());
        }
        return tokens;
    }

    /**
     * 解析单个查询片段（例如 "match-case:/(term)/" 或 "tag:#work"）
     */
    private static parsePart(part: string, operator: 'AND' | 'OR' | 'NOT'): ParsedRow {
        // 去掉最外层包裹的括号
        let content = part.replace(/^\(|\)$/g, '').trim();
        
        let caseSensitive = false;
        let isRegex = false;
        let type = 'all';

        // 识别 match-case:
        if (content.startsWith('match-case:')) {
            caseSensitive = true;
            content = content.slice(11).trim();
            // 剥掉可能存在的第二层括号，有些情况下生成的语句是 match-case:(...)
            content = content.replace(/^\(|\)$/g, '').trim();
        }

        // 识别内置类型前缀 (file:, tag:, path: 等)
        const typeMatch = content.match(/^(file|tag|path|content|line|block|section|task|task-todo|tasks-done):/);
        if (typeMatch && typeMatch[1]) {
            type = typeMatch[1];
            content = content.slice(typeMatch[0].length).trim();
            // 再剥掉一层括号，因为 convertToObsidianQuery 会生成 (type:(value))
            content = content.replace(/^\(|\)$/g, '').trim();
        }

        // 识别正则表达式 /.../
        if (content.startsWith('/') && content.endsWith('/')) {
            isRegex = true;
            content = content.slice(1, -1);
        }

        // 特殊处理标签，去掉 # 符号（UI 内部不显示 #，而是靠类型下拉框决定）
        if (type === 'tag') {
            content = content.replace(/#/g, '');
        }

        // 终极清理：再次剥掉可能存在的残余括号
        content = content.replace(/^\(|\)$/g, '').trim();

        return {
            operator,
            type,
            value: content,
            caseSensitive,
            isRegex
        };
    }
}
