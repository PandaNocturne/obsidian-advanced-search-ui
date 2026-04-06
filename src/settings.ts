export interface AdvancedSearchSettings {
    searchAlsoGraph: boolean;
    defaultCollapsed: boolean;
    adaptToFloatSearch: boolean;
}

export const DEFAULT_SETTINGS: AdvancedSearchSettings = {
    searchAlsoGraph: true,
    defaultCollapsed: false,
    adaptToFloatSearch: true,
};
