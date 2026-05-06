import type { SearchGroup } from '../components/SearchGroup';

/** Remove injected advanced-search UI nodes from the document and drop their entries from `containerGroups`. */
export function removeDetachedSearchUiFromDocument(containerGroups: Map<HTMLElement, SearchGroup[]>): void {
    document.querySelectorAll('.asui-search-form-container').forEach(container => {
        containerGroups.delete(container as HTMLElement);
        container.remove();
    });
    document.querySelectorAll('.advanced-search-ui-toggle-wrapper').forEach(btn => btn.remove());
}
