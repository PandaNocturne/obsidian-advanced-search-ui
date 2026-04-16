export interface FloatingPanelBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface AdvancedSearchSettings {
    searchAlsoGraph: boolean;
    graphColorGroupsEnabled: boolean;
    clearGraphColorGroupsOnReset: boolean;
    graphColorGroupPalette: string[];
    defaultCollapsed: boolean;
    adaptToFloatSearch: boolean;
    autoScaleUI: boolean; // 窄屏自动缩放UI
    autoSearchAfterImport: boolean;
    autoSearchOnOperatorChange: boolean;
    enableExperimentalGrouping: boolean;
    enableExperimentalGroupDragAndDrop: boolean;
    enableExperimentalRowDragAndDrop: boolean;
    importMode: 'append' | 'replace';
    floatingPanelBounds: FloatingPanelBounds | null;
    floatingPanelOpacity: number;
    floatingPanelDefaultCompact: boolean;
}

export const DEFAULT_SETTINGS: AdvancedSearchSettings = {
    searchAlsoGraph: true,
    graphColorGroupsEnabled: true,
    clearGraphColorGroupsOnReset: false,
    graphColorGroupPalette: ['#7C3AED', '#2563EB', '#0891B2', '#059669', '#65A30D', '#CA8A04', '#EA580C', '#DC2626'],
    defaultCollapsed: false,
    adaptToFloatSearch: true,
    autoScaleUI: true,
    autoSearchAfterImport: true,
    autoSearchOnOperatorChange: false,
    enableExperimentalGrouping: false,
    enableExperimentalGroupDragAndDrop: true,
    enableExperimentalRowDragAndDrop: false,
    importMode: 'append',
    floatingPanelBounds: null,
    floatingPanelOpacity: 1,
    floatingPanelDefaultCompact: true
};