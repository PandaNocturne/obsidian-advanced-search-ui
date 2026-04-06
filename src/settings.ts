export interface AdvancedSearchSettings {
    searchAlsoGraph: boolean;
    defaultCollapsed: boolean;
    adaptToFloatSearch: boolean;
    autoScaleUI: boolean; // 窄屏自动缩放UI
}

export const DEFAULT_SETTINGS: AdvancedSearchSettings = {
    searchAlsoGraph: true,
    defaultCollapsed: false,
    adaptToFloatSearch: true,
    autoScaleUI: false
};
