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
    autoScaleUI: boolean;
    autoSearchAfterImport: boolean;
    autoSearchOnOperatorChange: boolean;
    enableExperimentalGrouping: boolean;
    enableExperimentalGroupDragAndDrop: boolean;
    enableExperimentalRowDragAndDrop: boolean;
    importMode: 'append' | 'replace';
    floatingPanelBounds: FloatingPanelBounds | null;
    floatingNotePanelBounds: FloatingPanelBounds | null;
    floatingPanelDefaultCompact: boolean;
    /** When true, opening the floating search panel starts with note preview (PiP) mode on. */
    floatingSearchNotePreviewDefaultOn: boolean;
    /** Title pin: when true, preview stays visible even when the floating search leaf is not active. */
    floatingSearchNotePreviewDefaultPinned: boolean;
    /** Bind (link) control: dock preview position to the floating search panel edge. */
    floatingSearchNotePreviewDefaultBind: boolean;
    /** Preferred side when docking next to the floating panel. */
    floatingSearchNotePreviewBindSide: 'left' | 'right';
    /** UI scale for the preview window shell (0.5–1). */
    floatingSearchNotePreviewScale: number;
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
    floatingNotePanelBounds: null,
    floatingPanelDefaultCompact: true,
    floatingSearchNotePreviewDefaultOn: true,
    floatingSearchNotePreviewDefaultPinned: false,
    floatingSearchNotePreviewDefaultBind: true,
    floatingSearchNotePreviewBindSide: 'left',
    floatingSearchNotePreviewScale: 0.6
};