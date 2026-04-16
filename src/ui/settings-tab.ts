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

        const panelGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_UI'),
            t('SETTING_GROUP_UI_DESC')
        );

        new Setting(panelGroup)
            .setName(t('DEFAULT_COLLAPSED') || 'Default collapsed')
            .setDesc(t('DEFAULT_COLLAPSED_DESC') || 'Whether the advanced search UI is collapsed by default.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.defaultCollapsed)
                .onChange(async (value) => {
                    this.plugin.settings.defaultCollapsed = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(panelGroup)
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

        new Setting(panelGroup)
            .setName(t('ADAPT_FLOAT_SEARCH') || 'Adapt to Float Search plugin')
            .setDesc(t('ADAPT_FLOAT_SEARCH_DESC') || 'Enable compatibility with modal and other modes of Float Search plugin.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.adaptToFloatSearch)
                .onChange(async (value) => {
                    this.plugin.settings.adaptToFloatSearch = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateInterval();
                }));

        new Setting(panelGroup)
            .setName(t('FLOATING_PANEL_OPACITY') || 'Floating panel opacity')
            .setDesc(t('FLOATING_PANEL_OPACITY_DESC') || 'Adjust the opacity of the floating search panel.')
            .addSlider(slider => slider
                .setLimits(20, 100, 5)
                .setValue(Math.round(this.plugin.settings.floatingPanelOpacity * 100))
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.floatingPanelOpacity = value / 100;
                    await this.plugin.saveSettings();
                    this.plugin.updateFloatingPanelOpacity();
                }));

        new Setting(panelGroup)
            .setName(t('FLOATING_PANEL_DEFAULT_COMPACT') || 'Default compact mode')
            .setDesc(t('FLOATING_PANEL_DEFAULT_COMPACT_DESC') || 'When enabled, the floating search panel hides the search result area by default.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.floatingPanelDefaultCompact)
                .onChange(async (value) => {
                    this.plugin.settings.floatingPanelDefaultCompact = value;
                    await this.plugin.saveSettings();
                }));

        const importGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_SEARCH'),
            t('SETTING_GROUP_SEARCH_DESC')
        );

        new Setting(importGroup)
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

        new Setting(importGroup)
            .setName(t('AUTO_SEARCH_AFTER_IMPORT') || 'Auto search after import')
            .setDesc(t('AUTO_SEARCH_AFTER_IMPORT_DESC') || 'Automatically execute search after importing query conditions.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSearchAfterImport)
                .onChange(async (value) => {
                    this.plugin.settings.autoSearchAfterImport = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(importGroup)
            .setName(t('AUTO_SEARCH_ON_OPERATOR_CHANGE') || 'Auto search on operator change')
            .setDesc(t('AUTO_SEARCH_ON_OPERATOR_CHANGE_DESC') || 'Automatically execute search when switching AND / OR / NOT.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSearchOnOperatorChange)
                .onChange(async (value) => {
                    this.plugin.settings.autoSearchOnOperatorChange = value;
                    await this.plugin.saveSettings();
                }));

        const graphGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_GRAPH'),
            t('SETTING_GROUP_GRAPH_DESC')
        );

        new Setting(graphGroup)
            .setName(t('SEARCH_ALSO_GRAPH') || 'SEARCH_ALSO_GRAPH')
            .setDesc(t('SEARCH_ALSO_GRAPH_DESC') || 'SEARCH_ALSO_GRAPH_DESC')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.searchAlsoGraph)
                .onChange(async (value) => {
                    this.plugin.settings.searchAlsoGraph = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(graphGroup)
            .setName(t('GRAPH_COLOR_GROUPS') || 'Graph color groups')
            .setDesc(t('GRAPH_COLOR_GROUPS_DESC') || 'When grouping is enabled, sync each non-empty group to a separate graph color group when opening graph view.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.graphColorGroupsEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.graphColorGroupsEnabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(graphGroup)
            .setName(t('CLEAR_GRAPH_COLOR_GROUPS_ON_RESET') || 'Clear graph color groups on reset')
            .setDesc(t('CLEAR_GRAPH_COLOR_GROUPS_ON_RESET_DESC') || 'When enabled, clicking Reset in the advanced search panel also clears color groups in the current graph view. Disabled by default.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.clearGraphColorGroupsOnReset)
                .onChange(async (value) => {
                    this.plugin.settings.clearGraphColorGroupsOnReset = value;
                    await this.plugin.saveSettings();
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
            .setName(t('ENABLE_EXPERIMENTAL_GROUP_DRAG_AND_DROP') || 'Group drag and drop')
            .setDesc(t('ENABLE_EXPERIMENTAL_GROUP_DRAG_AND_DROP_DESC') || 'Enable reordering groups by dragging their headers.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExperimentalGroupDragAndDrop)
                .onChange(async (value) => {
                    this.plugin.settings.enableExperimentalGroupDragAndDrop = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshSearchUI();
                }));

        new Setting(experimentalGroup)
            .setName(t('ENABLE_EXPERIMENTAL_ROW_DRAG_AND_DROP') || 'Row drag and drop')
            .setDesc(t('ENABLE_EXPERIMENTAL_ROW_DRAG_AND_DROP_DESC') || 'Enable reordering and moving rows between existing groups by dragging row handles.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExperimentalRowDragAndDrop)
                .onChange(async (value) => {
                    this.plugin.settings.enableExperimentalRowDragAndDrop = value;
                    await this.plugin.saveSettings();
                    this.plugin.refreshSearchUI();
                }));
    }
}