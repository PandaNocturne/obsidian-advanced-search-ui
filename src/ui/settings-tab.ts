import { App, PluginSettingTab, Setting } from 'obsidian';
import AdvancedSearchPlugin from '../main';
import { t } from '../lang/helpers';

export class AdvancedSearchSettingTab extends PluginSettingTab {
    plugin: AdvancedSearchPlugin;

    constructor(app: App, plugin: AdvancedSearchPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private createSettingGroup(containerEl: HTMLElement, title: string, description: string): HTMLElement {
        const group = containerEl.createDiv({ cls: 'setting-item setting-item-heading' });
        const info = group.createDiv({ cls: 'setting-item-info' });
        info.createDiv({ cls: 'setting-item-name', text: title });
        info.createDiv({ cls: 'setting-item-description', text: description });

        return containerEl.createDiv({ cls: 'advanced-search-settings-group' });
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        const searchGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_SEARCH') || 'Search behavior',
            t('SETTING_GROUP_SEARCH_DESC') || 'Controls import, logical operator changes, and graph-linked search behavior.'
        );

        new Setting(searchGroup)
            .setName(t('SEARCH_ALSO_GRAPH') || 'SEARCH_ALSO_GRAPH')
            .setDesc(t('SEARCH_ALSO_GRAPH_DESC') || 'SEARCH_ALSO_GRAPH_DESC')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.searchAlsoGraph)
                .onChange(async (value) => {
                    this.plugin.settings.searchAlsoGraph = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(searchGroup)
            .setName(t('IMPORT_MODE') || 'Import mode')
            .setDesc(t('IMPORT_MODE_DESC') || 'Choose whether importing query conditions appends to existing conditions or clears them first and replaces them.')
            .addDropdown(dropdown => dropdown
                .addOption('append', t('IMPORT_MODE_APPEND') || 'Append')
                .addOption('replace', t('IMPORT_MODE_REPLACE') || 'Replace')
                .setValue(this.plugin.settings.importMode)
                .onChange(async (value: 'append' | 'replace') => {
                    this.plugin.settings.importMode = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(searchGroup)
            .setName(t('AUTO_SEARCH_AFTER_IMPORT') || 'Auto search after import')
            .setDesc(t('AUTO_SEARCH_AFTER_IMPORT_DESC') || 'Automatically execute search after importing query conditions.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSearchAfterImport)
                .onChange(async (value) => {
                    this.plugin.settings.autoSearchAfterImport = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(searchGroup)
            .setName(t('AUTO_SEARCH_ON_OPERATOR_CHANGE') || 'Auto search on operator change')
            .setDesc(t('AUTO_SEARCH_ON_OPERATOR_CHANGE_DESC') || 'Automatically execute search when switching AND / OR / NOT.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSearchOnOperatorChange)
                .onChange(async (value) => {
                    this.plugin.settings.autoSearchOnOperatorChange = value;
                    await this.plugin.saveSettings();
                }));

        const uiGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_UI') || 'UI & compatibility',
            t('SETTING_GROUP_UI_DESC') || 'Controls panel presentation, compatibility modes, and responsive UI scaling.'
        );

        new Setting(uiGroup)
            .setName(t('DEFAULT_COLLAPSED') || 'Default collapsed')
            .setDesc(t('DEFAULT_COLLAPSED_DESC') || 'Whether the advanced search UI is collapsed by default.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.defaultCollapsed)
                .onChange(async (value) => {
                    this.plugin.settings.defaultCollapsed = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(uiGroup)
            .setName(t('ADAPT_FLOAT_SEARCH') || 'Adapt to Float Search plugin')
            .setDesc(t('ADAPT_FLOAT_SEARCH_DESC') || 'Enable compatibility with modal and other modes of Float Search plugin.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.adaptToFloatSearch)
                .onChange(async (value) => {
                    this.plugin.settings.adaptToFloatSearch = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateInterval();
                }));

        new Setting(uiGroup)
            .setName(t('AUTO_SCALE_UI') || 'Auto scale UI')
            .setDesc(t('AUTO_SCALE_UI_DESC') || 'Auto scale UI elements when sidebar is narrow.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoScaleUI)
                .onChange(async (value) => {
                    this.plugin.settings.autoScaleUI = value;
                    await this.plugin.saveSettings();
                    if (value) {
                        document.body.classList.add('advanced-search-auto-scale');
                    } else {
                        document.body.classList.remove('advanced-search-auto-scale');
                    }
                }));

        const experimentalGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_EXPERIMENTAL') || 'Experimental features',
            t('SETTING_GROUP_EXPERIMENTAL_DESC') || 'The following features are experimental and disabled by default.'
        );

        new Setting(experimentalGroup)
            .setName(t('ENABLE_EXPERIMENTAL_GROUPING') || 'Grouping')
            .setDesc(t('ENABLE_EXPERIMENTAL_GROUPING_DESC') || 'Enable grouped search controls.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExperimentalGrouping)
                .onChange(async (value) => {
                    this.plugin.settings.enableExperimentalGrouping = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshSearchUI();
                }));

        new Setting(experimentalGroup)
            .setName(t('ENABLE_EXPERIMENTAL_DRAG_AND_DROP') || 'Drag and drop')
            .setDesc(t('ENABLE_EXPERIMENTAL_DRAG_AND_DROP_DESC') || 'Enable reordering groups by dragging their headers.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExperimentalDragAndDrop)
                .onChange(async (value) => {
                    this.plugin.settings.enableExperimentalDragAndDrop = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshSearchUI();
                }));
    }
}
