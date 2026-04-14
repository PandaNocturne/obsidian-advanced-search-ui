import { App, Notice, WorkspaceLeaf } from 'obsidian';
import { SearchGroup } from '../components/SearchGroup';
import { t } from '../lang/helpers';
import { GraphColorGroupService } from './GraphColorGroupService';
import { SearchQueryBuilder } from './SearchQueryBuilder';

export class SearchExecutionService {
    constructor(
        private app: App,
        private queryBuilder: SearchQueryBuilder,
        private graphColorGroupService: GraphColorGroupService,
        private getGroupsForContainer: (container: HTMLElement) => SearchGroup[],
        private getSearchAlsoGraphEnabled: () => boolean,
        private getAdaptToFloatSearchEnabled: () => boolean,
        private getGroupingEnabled: () => boolean,
        private getClearGraphColorGroupsOnResetEnabled: () => boolean
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
                void this.openGraphView(currentUI, false);
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

    public async openGraphView(uiContainer: HTMLElement, forceOpen = false) {
        const groups = this.getGroupsForContainer(uiContainer);
        const queryValue = this.queryBuilder.buildContainerQuery(groups);
        let targetLeaf = this.getPreferredGraphLeaf();
        if (!targetLeaf && !forceOpen) return;

        if (forceOpen) {
            if (!targetLeaf) {
                const workspaceLeaf = this.app.workspace.getLeaf(false);
                if (workspaceLeaf) {
                    await workspaceLeaf.setViewState({ type: 'graph', active: true });
                    targetLeaf = workspaceLeaf;
                }
            }

            if (targetLeaf) {
                this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
                void this.app.workspace.revealLeaf(targetLeaf);
            }
        }

        window.setTimeout(() => {
            const resolvedLeaf = targetLeaf || this.getPreferredGraphLeaf();
            if (!resolvedLeaf) return;

            const graphSearch = resolvedLeaf.view.containerEl.querySelector('.graph-control-section .search-input-container input') as HTMLInputElement;
            if (graphSearch) {
                graphSearch.value = queryValue;
                graphSearch.dispatchEvent(new Event('input', { bubbles: true }));
                graphSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                graphSearch.blur();
            }

            this.syncGraphColorGroups(resolvedLeaf, groups);
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

    public clearGraphColorGroups() {
        if (!this.getClearGraphColorGroupsOnResetEnabled()) return;

        const targetLeaf = this.getPreferredGraphLeaf();
        if (!targetLeaf) return;

        this.graphColorGroupService.clearColorGroups(targetLeaf);
    }

    private syncGraphColorGroups(targetLeaf: WorkspaceLeaf, groups: SearchGroup[]) {
        if (!this.getGroupingEnabled()) return;

        const groupQueries = groups
            .map(group => this.queryBuilder.buildGroupQuery(group))
            .filter(query => query.length > 0);

        if (groupQueries.length === 0) return;

        this.graphColorGroupService.syncToLeaf(targetLeaf, groupQueries);
    }

    private getPreferredGraphLeaf(): WorkspaceLeaf | null {
        const graphLeaves = this.app.workspace.getLeavesOfType('graph');
        if (!graphLeaves.length) return null;

        const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
        if (mostRecentLeaf && graphLeaves.includes(mostRecentLeaf)) {
            return mostRecentLeaf;
        }

        return graphLeaves[0] ?? null;
    }
}