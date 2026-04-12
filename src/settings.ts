export interface AdvancedSearchSettings {
    searchAlsoGraph: boolean;
    defaultCollapsed: boolean;
    adaptToFloatSearch: boolean;
    autoScaleUI: boolean; // 窄屏自动缩放UI
    autoSearchAfterImport: boolean;
    autoSearchOnOperatorChange: boolean;
    importMode: 'append' | 'replace';
}

export const DEFAULT_SETTINGS: AdvancedSearchSettings = {
    searchAlsoGraph: true,
    defaultCollapsed: false,
    adaptToFloatSearch: true,
    autoScaleUI: false,
    autoSearchAfterImport: true,
    autoSearchOnOperatorChange: false,
    importMode: 'append'
};
