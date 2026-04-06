import { App, PluginSettingTab, Setting } from 'obsidian';
import AdvancedSearchPlugin from '../main';
import { t } from '../lang/helpers';

export class AdvancedSearchSettingTab extends PluginSettingTab {
    plugin: AdvancedSearchPlugin;

    constructor(app: App, plugin: AdvancedSearchPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();



        new Setting(containerEl)
            .setName(t('SEARCH_ALSO_GRAPH') || 'SEARCH_ALSO_GRAPH')
            .setDesc(t('SEARCH_ALSO_GRAPH_DESC') || 'SEARCH_ALSO_GRAPH_DESC')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.searchAlsoGraph)
                .onChange(async (value) => {
                    this.plugin.settings.searchAlsoGraph = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('DEFAULT_COLLAPSED') || 'Default collapsed')
            .setDesc(t('DEFAULT_COLLAPSED_DESC') || 'Whether the advanced search UI is collapsed by default.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.defaultCollapsed)
                .onChange(async (value) => {
                    this.plugin.settings.defaultCollapsed = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName(t('ADAPT_FLOAT_SEARCH') || 'Adapt to Float Search plugin')
            .setDesc(t('ADAPT_FLOAT_SEARCH_DESC') || 'Enable compatibility with modal and other modes of Float Search plugin.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.adaptToFloatSearch)
                .onChange(async (value) => {
                    this.plugin.settings.adaptToFloatSearch = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateInterval();
                }));
    }
}
