export interface ParsedRow {
    operator: 'AND' | 'OR' | 'NOT';
    type: string;
    value: string;
    caseSensitive: boolean;
    isRegex: boolean;
}

export interface ParsedGroup {
    operator: 'AND' | 'OR' | 'NOT';
    rows: ParsedRow[];
}

export class QueryParser {
    static parse(query: string): ParsedRow[] {
        return this.parseGroups(query).flatMap(group => group.rows.map((row, index) => ({
            ...row,
            operator: index === 0 ? group.operator : row.operator
        })));
    }

    static parseGroups(query: string): ParsedGroup[] {
        if (!query.trim()) return [];

        const groupTokens = this.tokenizeTopLevel(query.trim());
        const groups: ParsedGroup[] = [];

        let pendingOperator: 'AND' | 'OR' | 'NOT' = 'AND';

        for (const token of groupTokens) {
            if (token === 'OR') {
                pendingOperator = 'OR';
                continue;
            }

            if (token.startsWith('-(') && token.endsWith(')')) {
                groups.push({
                    operator: 'NOT',
                    rows: this.parseGroupContent(token.slice(2, -1).trim())
                });
                pendingOperator = 'AND';
                continue;
            }

            if (token.startsWith('(') && token.endsWith(')') && this.isGroupedExpression(token)) {
                groups.push({
                    operator: pendingOperator,
                    rows: this.parseGroupContent(token.slice(1, -1).trim())
                });
                pendingOperator = 'AND';
                continue;
            }

            groups.push({
                operator: pendingOperator,
                rows: [this.parsePart(token, 'AND')]
            });
            pendingOperator = 'AND';
        }

        return groups;
    }

    private static parseGroupContent(content: string): ParsedRow[] {
        const tokens = this.tokenizeTopLevel(content);
        const rows: ParsedRow[] = [];
        let pendingOperator: 'AND' | 'OR' | 'NOT' = 'AND';

        for (const token of tokens) {
            if (token === 'OR') {
                pendingOperator = 'OR';
                continue;
            }

            if (token.startsWith('-')) {
                rows.push(this.parsePart(token.slice(1), 'NOT'));
                pendingOperator = 'AND';
                continue;
            }

            rows.push(this.parsePart(token, pendingOperator));
            pendingOperator = 'AND';
        }

        return rows;
    }

    private static tokenizeTopLevel(query: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inQuotes = false;
        let parenLevel = 0;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            if (char === '"') {
                inQuotes = !inQuotes;
                current += char;
                continue;
            }

            if (!inQuotes) {
                if (char === '(') {
                    parenLevel++;
                    current += char;
                    continue;
                }
                if (char === ')') {
                    parenLevel--;
                    current += char;
                    continue;
                }
                if (char === ' ' && parenLevel === 0) {
                    if (current.trim()) tokens.push(current.trim());
                    current = '';
                    continue;
                }
            }

            current += char;
        }

        if (current.trim()) tokens.push(current.trim());
        return tokens;
    }

    private static isGroupedExpression(token: string): boolean {
        const inner = token.slice(1, -1);
        const tokens = this.tokenizeTopLevel(inner);
        return tokens.length > 1;
    }

    private static parsePart(part: string, operator: 'AND' | 'OR' | 'NOT'): ParsedRow {
        let content = part.replace(/^\(|\)$/g, '').trim();

        let caseSensitive = false;
        let isRegex = false;
        let type = 'all';

        const typeMatch = content.match(/^(file|tag|path|content|line|block|section|task|task-todo|tasks-done):/);
        if (typeMatch?.[1]) {
            type = typeMatch[1];
            content = content.slice(typeMatch[0].length).trim();
            content = content.replace(/^\(|\)$/g, '').trim();
        }

        if (content.startsWith('match-case:')) {
            caseSensitive = true;
            content = content.slice(11).trim();
            content = content.replace(/^\(|\)$/g, '').trim();
        }

        if (content.startsWith('/') && content.endsWith('/')) {
            isRegex = true;
            content = content.slice(1, -1);
        }

        if (type === 'tag') {
            content = content.replace(/#/g, '');
        }

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
