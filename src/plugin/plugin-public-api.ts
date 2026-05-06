import type { AdvancedSearchSettings } from '../settings';

/** Settings UI depends on this shape; root `main.ts` delegates these calls to `AdvancedSearchCoordinator`. */
export interface AdvancedSearchPluginFacade {
    readonly settings: AdvancedSearchSettings;
    saveSettings(): Promise<void>;
    refreshSearchUI(): void;
    updateInterval(): void;
    applyFloatingSearchNotePreviewDefaultSetting(): void;
    applyPreviewMetadataVisibility(): void;
    refreshOpenFloatingNotePreviewChrome(): void;
    applyPreviewWindowScale(): void;
}
