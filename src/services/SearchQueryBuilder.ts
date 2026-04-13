import { SearchGroup } from '../components/SearchGroup';
import { SearchRow } from '../components/SearchRow';

export class SearchQueryBuilder {
    public buildRowQuery(row: SearchRow): string {
        const value = row.getValue();
        if (!value) return '';

        const typePrefix = row.typeSelect.value === 'all' ? '' : `${row.typeSelect.value}:`;
        let searchTerm = value;

        if (row.regexInput.checked) {
            searchTerm = `/${searchTerm}/`;
        } else if (row.typeSelect.value === 'tag') {
            searchTerm = searchTerm.split(' ').map(tag => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ');
        } else {
            searchTerm = `(${searchTerm})`;
        }

        if (row.caseInput.checked) {
            searchTerm = `match-case:${searchTerm}`;
        }

        return `(${typePrefix}${searchTerm})`;
    }

    public buildContainerQuery(groups: SearchGroup[], lineBreak = false): string {
        const queryParts: string[] = [];
        let hasEffectiveGroup = false;

        groups.forEach(group => {
            const rowParts: string[] = [];
            let hasEffectiveRow = false;
            let hasAndOrCombination = false;

            group.rows.forEach(row => {
                const rowQuery = this.buildRowQuery(row);
                if (!rowQuery) return;

                const rowOperator = row.operatorSelect.value;
                let part = '';
                if (!hasEffectiveRow) {
                    part = rowOperator === 'NOT' ? `-${rowQuery}` : rowQuery;
                } else {
                    switch (rowOperator) {
                        case 'AND':
                            part = rowQuery;
                            hasAndOrCombination = true;
                            break;
                        case 'OR':
                            part = `OR ${rowQuery}`;
                            hasAndOrCombination = true;
                            break;
                        case 'NOT':
                            part = `-${rowQuery}`;
                            break;
                    }
                }
                rowParts.push(part);
                hasEffectiveRow = true;
            });

            if (!rowParts.length) return;

            const combinedRows = rowParts.join(' ');
            const grouped = hasAndOrCombination ? `(${combinedRows})` : combinedRows;
            let groupPart: string;
            if (!hasEffectiveGroup) {
                groupPart = group.operatorSelect.value === 'NOT' ? `-${grouped}` : grouped;
            } else {
                switch (group.operatorSelect.value) {
                    case 'AND':
                        groupPart = grouped;
                        break;
                    case 'OR':
                        groupPart = `OR ${grouped}`;
                        break;
                    case 'NOT':
                        groupPart = `-${grouped}`;
                        break;
                    default:
                        groupPart = grouped;
                        break;
                }
            }

            queryParts.push(groupPart);
            hasEffectiveGroup = true;
        });

        return lineBreak ? queryParts.join('\n') : queryParts.join(' ');
    }
}
