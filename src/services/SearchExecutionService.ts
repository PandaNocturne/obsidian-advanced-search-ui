import { App, Notice } from 'obsidian';
import { SearchGroup } from '../components/SearchGroup';
import { t } from '../lang/helpers';
import { SearchQueryBuilder } from './SearchQueryBuilder';

export class SearchExecutionService {
    constructor(
        private app: App,
        private queryBuilder: SearchQueryBuilder,
        private getGroupsForContainer: (container: HTMLElement) => SearchGroup[],
        private getSearchAlsoGraphEnabled: () => boolean,
        private getAdaptToFloatSearchEnabled: () => boolean
    ) {}

    public executeSearch(uiContainer?: HTMLElement) {
        const containers = this.getAdaptToFloatSearchEnabled()
            ? Array.from(document.querySelectorAll('.search-params')).map(el => el.parentElement).filter(el => el)
            : this.app.workspace.getLeavesOfType('search').map(leaf => leaf.view.containerEl);

        const uniqueContainers = Array.from(new Set(containers as HTMLElement[]));
        uniqueContainers.forEach(containerEl => {
            const currentUI = containerEl.querySelector('.asui-search-form-container') as HTMLElement;
            if (!currentUI) return;
            if (uiContainer && currentUI !== uiContainer) return;

            const queryValue = this.queryBuilder.buildContainerQuery(this.getGroupsForContainer(currentUI));
            const isModal = containerEl.closest('.modal-container') || containerEl.closest('.modal');
            if (this.getSearchAlsoGraphEnabled() && !isModal) {
                this.openGraphView(currentUI, false);
            }

            const searchInput = containerEl.querySelector('.search-input-container > input') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = queryValue;
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.focus();
                if (!containerEl.closest('.modal-container') && !containerEl.closest('.modal')) {
                    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }
            }
        });
    }

    public openGraphView(uiContainer: HTMLElement, forceOpen = false) {
        const queryValue = this.queryBuilder.buildContainerQuery(this.getGroupsForContainer(uiContainer));
        let graphLeaves = this.app.workspace.getLeavesOfType('graph');
        if (graphLeaves.length === 0 && !forceOpen) return;

        if (forceOpen) {
            let targetLeaf = graphLeaves[0];

            if (!targetLeaf) {
                const workspaceLeaf = this.app.workspace.getLeaf(false);
                if (workspaceLeaf) {
                    void workspaceLeaf.setViewState({ type: 'graph', active: true });
                    targetLeaf = workspaceLeaf;
                }
            }

            if (targetLeaf) {
                this.app.workspace.revealLeaf(targetLeaf);
            }

            graphLeaves = this.app.workspace.getLeavesOfType('graph');
        }

        setTimeout(() => {
            this.app.workspace.getLeavesOfType('graph').forEach(leaf => {
                const graphSearch = leaf.view.containerEl.querySelector('.graph-control-section .search-input-container input') as HTMLInputElement;
                if (graphSearch) {
                    graphSearch.value = queryValue;
                    graphSearch.dispatchEvent(new Event('input', { bubbles: true }));
                    graphSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    graphSearch.blur();
                }
            });
        }, 100);
    }

    public async copySearchQuery(uiContainer: HTMLElement) {
        const query = this.queryBuilder.buildContainerQuery(this.getGroupsForContainer(uiContainer), true);
        try {
            await navigator.clipboard.writeText(query);
            new Notice(t('COPIED_TO_CLIPBOARD'));
        } catch {
            new Notice(t('FAILED_TO_COPY'));
        }
    }
}
