import { Plugin } from 'obsidian';
import { AdvancedSearchCoordinator } from './src/AdvancedSearchCoordinator';
import type { AdvancedSearchPluginFacade } from './src/plugin/plugin-public-api';
import type { AdvancedSearchSettings } from './src/settings';

/**
 * Obsidian entry — three responsibilities:
 * 1. Construct and initialize workspace/services (`AdvancedSearchCoordinator`).
 * 2. Register commands and settings UI entry points.
 * 3. Delegate the narrow API consumed by the settings tab (`AdvancedSearchPluginFacade`).
 */
export default class AdvancedSearchPlugin extends Plugin implements AdvancedSearchPluginFacade {
    private core!: AdvancedSearchCoordinator;

    public get settings(): AdvancedSearchSettings {
        return this.core.settings;
    }

    async onload(): Promise<void> {
        this.core = new AdvancedSearchCoordinator(this);
        await this.core.initWorkspaceAndServices();
        this.core.registerCommandsAndSettingsUi();
    }

    onunload(): void {
        this.core.dispose();
    }

    async saveSettings(): Promise<void> {
        await this.core.saveSettings();
    }

    refreshSearchUI(): void {
        this.core.refreshSearchUI();
    }

    updateInterval(): void {
        this.core.updateInterval();
    }

    applyFloatingSearchNotePreviewDefaultSetting(): void {
        this.core.applyFloatingSearchNotePreviewDefaultSetting();
    }

    applyPreviewMetadataVisibility(): void {
        this.core.applyPreviewMetadataVisibility();
    }

    refreshOpenFloatingNotePreviewChrome(): void {
        this.core.refreshOpenFloatingNotePreviewChrome();
    }

    applyPreviewWindowScale(): void {
        this.core.applyPreviewWindowScale();
    }
}
