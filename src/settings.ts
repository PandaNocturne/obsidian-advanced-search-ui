export interface AdvancedSearchSettings {
    searchAlsoGraph: boolean;
    defaultCollapsed: boolean;
    adaptToFloatSearch: boolean;
    autoScaleUI: boolean; // 窄屏自动缩放UI
    autoSearchAfterImport: boolean;
    autoSearchOnOperatorChange: boolean;
    enableExperimentalGrouping: boolean;
    enableExperimentalGroupDragAndDrop: boolean;
    enableExperimentalRowDragAndDrop: boolean;
    importMode: 'append' | 'replace';
}

export const DEFAULT_SETTINGS: AdvancedSearchSettings = {
    searchAlsoGraph: true,
    defaultCollapsed: false,
    adaptToFloatSearch: true,
    autoScaleUI: false,
    autoSearchAfterImport: true,
    autoSearchOnOperatorChange: false,
    enableExperimentalGrouping: false,
    enableExperimentalGroupDragAndDrop: true,
    enableExperimentalRowDragAndDrop: false,
    importMode: 'append'
};
