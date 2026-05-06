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
    /** Default Markdown view for newly opened notes in the preview window. */
    floatingSearchNotePreviewDefaultMarkdownMode: 'preview' | 'source';
    /** Bind (link) control: dock preview position to the floating search panel edge. */
    floatingSearchNotePreviewDefaultBind: boolean;
    /** Preferred side when docking next to the floating panel. */
    floatingSearchNotePreviewBindSide: 'left' | 'right';
    /** Content zoom for `.view-content` in the preview window (0.5–1). */
    floatingSearchNotePreviewScale: number;
    /** Show Properties (metadata) in PiP reading view (`.markdown-preview-view`). Default hidden. */
    floatingSearchNotePreviewMetadataShowReading: boolean;
    /** Show Properties in PiP live preview (`.markdown-source-view.is-live-preview`). Default hidden. */
    floatingSearchNotePreviewMetadataShowLivePreview: boolean;
    /** Show Properties in PiP source editor (non-live `.markdown-source-view`). Default hidden. */
    floatingSearchNotePreviewMetadataShowSource: boolean;
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
    floatingSearchNotePreviewDefaultMarkdownMode: 'preview',
    floatingSearchNotePreviewDefaultBind: true,
    floatingSearchNotePreviewBindSide: 'left',
    floatingSearchNotePreviewScale: 0.6,
    floatingSearchNotePreviewMetadataShowReading: false,
    floatingSearchNotePreviewMetadataShowLivePreview: false,
    floatingSearchNotePreviewMetadataShowSource: false
};