import {
    App,
    PluginSettingTab,
    Setting,
    type Plugin,
    type SettingDefinitionItem
} from 'obsidian';
import type { AdvancedSearchPluginFacade } from '../plugin/plugin-public-api';
import { t } from '../lang/helpers';
import { DEFAULT_SETTINGS, type AdvancedSearchSettings } from '../settings';

const FLOAT_SEARCH_PLUGIN_URI = 'obsidian://show-plugin?id=float-search';

type SettingKey = keyof AdvancedSearchSettings;

export class AdvancedSearchSettingTab extends PluginSettingTab {
    /** Facade-only so lint does not treat reads as Obsidian 1.13 `Plugin.settings`. */
    plugin: AdvancedSearchPluginFacade;

    constructor(app: App, plugin: Plugin & AdvancedSearchPluginFacade) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
        return [
            {
                type: 'group',
                heading: t('SETTING_GROUP_UI'),
                items: [
                    {
                        name: t('DEFAULT_COLLAPSED') || 'Default collapsed',
                        desc: t('DEFAULT_COLLAPSED_DESC') || 'Whether the advanced search UI is collapsed by default.',
                        control: { type: 'toggle', key: 'defaultCollapsed' }
                    },
                    {
                        name: t('AUTO_SCALE_UI') || 'Auto scale UI',
                        desc: t('AUTO_SCALE_UI_DESC') || 'Auto scale UI elements when sidebar is narrow.',
                        control: { type: 'toggle', key: 'autoScaleUI' }
                    },
                    {
                        name: t('FLOATING_PANEL_DEFAULT_COMPACT') || 'Default compact mode',
                        desc: t('FLOATING_PANEL_DEFAULT_COMPACT_DESC') || 'When enabled, the floating search panel hides the search result area by default.',
                        control: { type: 'toggle', key: 'floatingPanelDefaultCompact' }
                    }
                ]
            },
            {
                type: 'group',
                heading: t('SETTING_GROUP_PREVIEW_WINDOW') || 'Preview window',
                items: [
                    {
                        name: t('FLOATING_SEARCH_NOTE_PREVIEW') || 'Default preview on',
                        desc: t('FLOATING_SEARCH_NOTE_PREVIEW_DESC') || '',
                        control: { type: 'toggle', key: 'floatingSearchNotePreviewDefaultOn' }
                    },
                    {
                        name: t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_PINNED') || 'Default pin preview window',
                        desc: t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_PINNED_DESC') || '',
                        control: { type: 'toggle', key: 'floatingSearchNotePreviewDefaultPinned' }
                    },
                    {
                        name: t('FLOATING_SEARCH_NOTE_PREVIEW_YAML_HIDDEN_BY_DEFAULT') || 'Hide YAML by default',
                        desc: t('FLOATING_SEARCH_NOTE_PREVIEW_YAML_HIDDEN_BY_DEFAULT_DESC') || '',
                        control: { type: 'toggle', key: 'floatingSearchNotePreviewYamlHiddenByDefault' }
                    },
                    {
                        name: t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_BIND') || 'Default bind to floating panel',
                        desc: t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_BIND_DESC') || '',
                        control: { type: 'toggle', key: 'floatingSearchNotePreviewDefaultBind' }
                    },
                    {
                        name: t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_VIEW') || 'Default view',
                        desc: t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_VIEW_DESC') || '',
                        control: {
                            type: 'dropdown',
                            key: 'floatingSearchNotePreviewDefaultMarkdownMode',
                            options: {
                                preview: t('FLOATING_SEARCH_NOTE_PREVIEW_VIEW_READING') || 'Reading',
                                source: t('FLOATING_SEARCH_NOTE_PREVIEW_VIEW_EDITING') || 'Editing'
                            }
                        }
                    },
                    {
                        name: t('FLOATING_SEARCH_NOTE_PREVIEW_BIND_SIDE') || 'Preferred bind side',
                        desc: t('FLOATING_SEARCH_NOTE_PREVIEW_BIND_SIDE_DESC') || '',
                        control: {
                            type: 'dropdown',
                            key: 'floatingSearchNotePreviewBindSide',
                            options: {
                                left: t('FLOATING_SEARCH_NOTE_PREVIEW_BIND_LEFT') || 'Left',
                                right: t('FLOATING_SEARCH_NOTE_PREVIEW_BIND_RIGHT') || 'Right'
                            }
                        }
                    },
                    {
                        name: t('FLOATING_SEARCH_NOTE_PREVIEW_SCALE') || 'Preview window scale',
                        desc: t('FLOATING_SEARCH_NOTE_PREVIEW_SCALE_DESC') || '',
                        render: setting => {
                            setting
                                .addSlider(slider =>
                                    slider
                                        .setLimits(0.5, 1, 0.1)
                                        .setValue(this.plugin.settings.floatingSearchNotePreviewScale)
                                        .onChange(async value => {
                                            await this.setControlValue('floatingSearchNotePreviewScale', value);
                                        })
                                )
                                .addExtraButton(button =>
                                    button
                                        .setIcon('rotate-ccw')
                                        .setTooltip(t('FLOATING_SEARCH_NOTE_PREVIEW_SCALE_RESET') || 'Reset to default')
                                        .onClick(async () => {
                                            const reset = DEFAULT_SETTINGS.floatingSearchNotePreviewScale;
                                            await this.setControlValue('floatingSearchNotePreviewScale', reset);
                                            const sliderEl = setting.controlEl.querySelector('input[type="range"]');
                                            if (sliderEl instanceof HTMLInputElement) {
                                                sliderEl.value = String(reset);
                                                sliderEl.dispatchEvent(new Event('input', { bubbles: true }));
                                            }
                                        })
                                );
                        }
                    }
                ]
            },
            {
                type: 'group',
                heading: t('SETTING_GROUP_SEARCH'),
                items: [
                    {
                        name: t('ENABLE_GROUPING') || 'Grouping',
                        desc: t('ENABLE_GROUPING_DESC') || 'Enable grouped search controls.',
                        control: { type: 'toggle', key: 'enableExperimentalGrouping' }
                    },
                    {
                        name: t('IMPORT_MODE') || 'Import mode',
                        desc: t('IMPORT_MODE_DESC') || 'Choose whether importing query conditions appends to existing conditions or clears them first and replaces them.',
                        control: {
                            type: 'dropdown',
                            key: 'importMode',
                            options: {
                                append: t('IMPORT_MODE_APPEND') || 'Append',
                                replace: t('IMPORT_MODE_REPLACE') || 'Replace'
                            }
                        }
                    },
                    {
                        name: t('AUTO_SEARCH_AFTER_IMPORT') || 'Auto search after import',
                        desc: t('AUTO_SEARCH_AFTER_IMPORT_DESC') || 'Automatically execute search after importing query conditions.',
                        control: { type: 'toggle', key: 'autoSearchAfterImport' }
                    },
                    {
                        name: t('AUTO_SEARCH_ON_OPERATOR_CHANGE') || 'Auto search on operator change',
                        desc: t('AUTO_SEARCH_ON_OPERATOR_CHANGE_DESC') || 'Automatically execute search when switching AND / OR / NOT.',
                        control: { type: 'toggle', key: 'autoSearchOnOperatorChange' }
                    }
                ]
            },
            {
                type: 'group',
                heading: t('SETTING_GROUP_INTERACTION'),
                items: [
                    {
                        name: t('ENABLE_GROUP_DRAG_AND_DROP') || 'Group drag and drop',
                        desc: t('ENABLE_GROUP_DRAG_AND_DROP_DESC') || 'Enable reordering groups by dragging their headers.',
                        control: { type: 'toggle', key: 'enableExperimentalGroupDragAndDrop' }
                    },
                    {
                        name: t('ENABLE_ROW_DRAG_AND_DROP') || 'Row drag and drop',
                        desc: t('ENABLE_ROW_DRAG_AND_DROP_DESC') || 'Enable reordering and moving rows between existing groups by dragging row handles.',
                        control: { type: 'toggle', key: 'enableExperimentalRowDragAndDrop' }
                    }
                ]
            },
            {
                type: 'group',
                heading: t('SETTING_GROUP_GRAPH'),
                items: [
                    {
                        name: t('SEARCH_ALSO_GRAPH') || 'SEARCH_ALSO_GRAPH',
                        desc: t('SEARCH_ALSO_GRAPH_DESC') || 'SEARCH_ALSO_GRAPH_DESC',
                        control: { type: 'toggle', key: 'searchAlsoGraph' }
                    },
                    {
                        name: t('GRAPH_COLOR_GROUPS') || 'Graph color groups',
                        desc: t('GRAPH_COLOR_GROUPS_DESC') || 'When grouping is enabled, sync each non-empty group to a separate graph color group when opening graph view.',
                        control: { type: 'toggle', key: 'graphColorGroupsEnabled' }
                    },
                    {
                        name: t('CLEAR_GRAPH_COLOR_GROUPS_ON_RESET') || 'Clear graph color groups on reset',
                        desc: t('CLEAR_GRAPH_COLOR_GROUPS_ON_RESET_DESC') || 'When enabled, clicking Reset in the advanced search panel also clears color groups in the current graph view. Disabled by default.',
                        control: { type: 'toggle', key: 'clearGraphColorGroupsOnReset' }
                    }
                ]
            },
            {
                type: 'group',
                heading: t('SETTING_GROUP_INTEGRATION'),
                items: [
                    {
                        name: t('ADAPT_FLOAT_SEARCH') || 'Adapt to Float Search',
                        desc: this.createAdaptFloatSearchDescription(),
                        control: { type: 'toggle', key: 'adaptToFloatSearch' }
                    }
                ]
            }
        ];
    }

    getControlValue(key: string): unknown {
        return this.plugin.settings[key as SettingKey];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const settingKey = key as SettingKey;
        let nextValue = value;

        if (settingKey === 'floatingSearchNotePreviewScale' && typeof value === 'number') {
            nextValue = Math.round(Math.max(0.5, Math.min(1, value)) * 10) / 10;
        }

        (this.plugin.settings as Record<SettingKey, unknown>)[settingKey] = nextValue;
        await this.plugin.saveSettings();
        this.applySettingSideEffects(settingKey);
    }

    private applySettingSideEffects(key: SettingKey): void {
        switch (key) {
            case 'autoScaleUI':
                activeDocument.body.classList.toggle('advanced-search-auto-scale', this.plugin.settings.autoScaleUI);
                break;
            case 'floatingSearchNotePreviewDefaultOn':
                this.plugin.applyFloatingSearchNotePreviewDefaultSetting();
                break;
            case 'floatingSearchNotePreviewYamlHiddenByDefault':
                this.plugin.applyPreviewMetadataVisibility();
                break;
            case 'floatingSearchNotePreviewBindSide':
                this.plugin.refreshOpenFloatingNotePreviewChrome();
                break;
            case 'floatingSearchNotePreviewScale':
                this.plugin.applyPreviewWindowScale();
                break;
            case 'enableExperimentalGrouping':
            case 'enableExperimentalGroupDragAndDrop':
            case 'enableExperimentalRowDragAndDrop':
                this.plugin.refreshSearchUI();
                break;
            case 'adaptToFloatSearch':
                this.plugin.updateInterval();
                break;
            default:
                break;
        }
    }

    private createAdaptFloatSearchDescription(): DocumentFragment {
        return createFragment(el => {
            el.appendText(t('ADAPT_FLOAT_SEARCH_DESC_PREFIX') || 'Enable compatibility with ');
            el.createEl('a', {
                text: t('FLOAT_SEARCH_PLUGIN_NAME') || 'Float Search',
                href: FLOAT_SEARCH_PLUGIN_URI
            });
            el.appendText(t('ADAPT_FLOAT_SEARCH_DESC_SUFFIX') || ' modal and other search views.');
        });
    }

    private createSettingGroup(containerEl: HTMLElement, title: string, description: string): HTMLElement {
        const group = containerEl.createDiv({ cls: 'setting-item setting-item-heading' });
        const info = group.createDiv({ cls: 'setting-item-info' });
        info.createDiv({ cls: 'setting-item-name', text: title });
        info.createDiv({ cls: 'setting-item-description', text: description });

        return containerEl.createDiv({ cls: 'advanced-search-settings-group' });
    }

    private setRichDescription(setting: Setting, fragments: Array<string | { text: string; href: string }>) {
        const descEl = setting.descEl;
        descEl.empty();

        fragments.forEach(fragment => {
            if (typeof fragment === 'string') {
                descEl.appendText(fragment);
                return;
            }

            descEl.createEl('a', {
                text: fragment.text,
                href: fragment.href
            });
        });
    }

    /** Fallback for Obsidian versions before 1.13.0. */
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
                    await this.setControlValue('defaultCollapsed', value);
                }));

        new Setting(panelGroup)
            .setName(t('AUTO_SCALE_UI') || 'Auto scale UI')
            .setDesc(t('AUTO_SCALE_UI_DESC') || 'Auto scale UI elements when sidebar is narrow.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoScaleUI)
                .onChange(async (value) => {
                    await this.setControlValue('autoScaleUI', value);
                }));

        new Setting(panelGroup)
            .setName(t('FLOATING_PANEL_DEFAULT_COMPACT') || 'Default compact mode')
            .setDesc(t('FLOATING_PANEL_DEFAULT_COMPACT_DESC') || 'When enabled, the floating search panel hides the search result area by default.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.floatingPanelDefaultCompact)
                .onChange(async (value) => {
                    await this.setControlValue('floatingPanelDefaultCompact', value);
                }));

        const previewGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_PREVIEW_WINDOW') || 'Preview window',
            t('SETTING_GROUP_PREVIEW_WINDOW_DESC') || 'Defaults for the floating note preview (PiP) window.'
        );

        new Setting(previewGroup)
            .setName(t('FLOATING_SEARCH_NOTE_PREVIEW') || 'Default preview on')
            .setDesc(t('FLOATING_SEARCH_NOTE_PREVIEW_DESC') || '')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.floatingSearchNotePreviewDefaultOn)
                .onChange(async (value) => {
                    await this.setControlValue('floatingSearchNotePreviewDefaultOn', value);
                }));

        new Setting(previewGroup)
            .setName(t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_PINNED') || 'Default pin preview window')
            .setDesc(t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_PINNED_DESC') || '')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.floatingSearchNotePreviewDefaultPinned)
                .onChange(async (value) => {
                    await this.setControlValue('floatingSearchNotePreviewDefaultPinned', value);
                }));

        new Setting(previewGroup)
            .setName(t('FLOATING_SEARCH_NOTE_PREVIEW_YAML_HIDDEN_BY_DEFAULT') || 'Hide YAML by default')
            .setDesc(t('FLOATING_SEARCH_NOTE_PREVIEW_YAML_HIDDEN_BY_DEFAULT_DESC') || '')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.floatingSearchNotePreviewYamlHiddenByDefault)
                .onChange(async (value) => {
                    await this.setControlValue('floatingSearchNotePreviewYamlHiddenByDefault', value);
                }));

        new Setting(previewGroup)
            .setName(t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_BIND') || 'Default bind to floating panel')
            .setDesc(t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_BIND_DESC') || '')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.floatingSearchNotePreviewDefaultBind)
                .onChange(async (value) => {
                    await this.setControlValue('floatingSearchNotePreviewDefaultBind', value);
                }));

        new Setting(previewGroup)
            .setName(t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_VIEW') || 'Default view')
            .setDesc(t('FLOATING_SEARCH_NOTE_PREVIEW_DEFAULT_VIEW_DESC') || '')
            .addDropdown(dropdown => dropdown
                .addOption('preview', t('FLOATING_SEARCH_NOTE_PREVIEW_VIEW_READING') || 'Reading')
                .addOption('source', t('FLOATING_SEARCH_NOTE_PREVIEW_VIEW_EDITING') || 'Editing')
                .setValue(this.plugin.settings.floatingSearchNotePreviewDefaultMarkdownMode)
                .onChange(async (value: 'preview' | 'source') => {
                    await this.setControlValue('floatingSearchNotePreviewDefaultMarkdownMode', value);
                }));

        new Setting(previewGroup)
            .setName(t('FLOATING_SEARCH_NOTE_PREVIEW_BIND_SIDE') || 'Preferred bind side')
            .setDesc(t('FLOATING_SEARCH_NOTE_PREVIEW_BIND_SIDE_DESC') || '')
            .addDropdown(dropdown => dropdown
                .addOption('left', t('FLOATING_SEARCH_NOTE_PREVIEW_BIND_LEFT') || 'Left')
                .addOption('right', t('FLOATING_SEARCH_NOTE_PREVIEW_BIND_RIGHT') || 'Right')
                .setValue(this.plugin.settings.floatingSearchNotePreviewBindSide)
                .onChange(async (value: 'left' | 'right') => {
                    await this.setControlValue('floatingSearchNotePreviewBindSide', value);
                }));

        new Setting(previewGroup)
            .setName(t('FLOATING_SEARCH_NOTE_PREVIEW_SCALE') || 'Preview window scale')
            .setDesc(t('FLOATING_SEARCH_NOTE_PREVIEW_SCALE_DESC') || '')
            .addSlider(slider => slider
                .setLimits(0.5, 1, 0.1)
                .setValue(this.plugin.settings.floatingSearchNotePreviewScale)
                .onChange(async (value) => {
                    await this.setControlValue('floatingSearchNotePreviewScale', value);
                }))
            .addExtraButton(button =>
                button
                    .setIcon('rotate-ccw')
                    .setTooltip(t('FLOATING_SEARCH_NOTE_PREVIEW_SCALE_RESET') || 'Reset to default')
                    .onClick(async () => {
                        const reset = DEFAULT_SETTINGS.floatingSearchNotePreviewScale;
                        await this.setControlValue('floatingSearchNotePreviewScale', reset);
                        const sliderEl = previewGroup.querySelector('input[type="range"]');
                        if (sliderEl instanceof HTMLInputElement) {
                            sliderEl.value = String(reset);
                            sliderEl.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    })
            );

        const searchGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_SEARCH'),
            t('SETTING_GROUP_SEARCH_DESC')
        );

        new Setting(searchGroup)
            .setName(t('ENABLE_GROUPING') || 'Grouping')
            .setDesc(t('ENABLE_GROUPING_DESC') || 'Enable grouped search controls.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExperimentalGrouping)
                .onChange(async (value) => {
                    await this.setControlValue('enableExperimentalGrouping', value);
                }));

        new Setting(searchGroup)
            .setName(t('IMPORT_MODE') || 'Import mode')
            .setDesc(t('IMPORT_MODE_DESC') || 'Choose whether importing query conditions appends to existing conditions or clears them first and replaces them.')
            .addDropdown(dropdown => dropdown
                .addOption('append', t('IMPORT_MODE_APPEND') || 'Append')
                .addOption('replace', t('IMPORT_MODE_REPLACE') || 'Replace')
                .setValue(this.plugin.settings.importMode)
                .onChange(async (value: 'append' | 'replace') => {
                    await this.setControlValue('importMode', value);
                }));

        new Setting(searchGroup)
            .setName(t('AUTO_SEARCH_AFTER_IMPORT') || 'Auto search after import')
            .setDesc(t('AUTO_SEARCH_AFTER_IMPORT_DESC') || 'Automatically execute search after importing query conditions.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSearchAfterImport)
                .onChange(async (value) => {
                    await this.setControlValue('autoSearchAfterImport', value);
                }));

        new Setting(searchGroup)
            .setName(t('AUTO_SEARCH_ON_OPERATOR_CHANGE') || 'Auto search on operator change')
            .setDesc(t('AUTO_SEARCH_ON_OPERATOR_CHANGE_DESC') || 'Automatically execute search when switching AND / OR / NOT.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSearchOnOperatorChange)
                .onChange(async (value) => {
                    await this.setControlValue('autoSearchOnOperatorChange', value);
                }));

        const interactionGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_INTERACTION'),
            t('SETTING_GROUP_INTERACTION_DESC')
        );

        new Setting(interactionGroup)
            .setName(t('ENABLE_GROUP_DRAG_AND_DROP') || 'Group drag and drop')
            .setDesc(t('ENABLE_GROUP_DRAG_AND_DROP_DESC') || 'Enable reordering groups by dragging their headers.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExperimentalGroupDragAndDrop)
                .onChange(async (value) => {
                    await this.setControlValue('enableExperimentalGroupDragAndDrop', value);
                }));

        new Setting(interactionGroup)
            .setName(t('ENABLE_ROW_DRAG_AND_DROP') || 'Row drag and drop')
            .setDesc(t('ENABLE_ROW_DRAG_AND_DROP_DESC') || 'Enable reordering and moving rows between existing groups by dragging row handles.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExperimentalRowDragAndDrop)
                .onChange(async (value) => {
                    await this.setControlValue('enableExperimentalRowDragAndDrop', value);
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
                    await this.setControlValue('searchAlsoGraph', value);
                }));

        new Setting(graphGroup)
            .setName(t('GRAPH_COLOR_GROUPS') || 'Graph color groups')
            .setDesc(t('GRAPH_COLOR_GROUPS_DESC') || 'When grouping is enabled, sync each non-empty group to a separate graph color group when opening graph view.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.graphColorGroupsEnabled)
                .onChange(async (value) => {
                    await this.setControlValue('graphColorGroupsEnabled', value);
                }));

        new Setting(graphGroup)
            .setName(t('CLEAR_GRAPH_COLOR_GROUPS_ON_RESET') || 'Clear graph color groups on reset')
            .setDesc(t('CLEAR_GRAPH_COLOR_GROUPS_ON_RESET_DESC') || 'When enabled, clicking Reset in the advanced search panel also clears color groups in the current graph view. Disabled by default.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.clearGraphColorGroupsOnReset)
                .onChange(async (value) => {
                    await this.setControlValue('clearGraphColorGroupsOnReset', value);
                }));

        const integrationGroup = this.createSettingGroup(
            containerEl,
            t('SETTING_GROUP_INTEGRATION'),
            t('SETTING_GROUP_INTEGRATION_DESC')
        );

        const adaptFloatSearchSetting = new Setting(integrationGroup)
            .setName(t('ADAPT_FLOAT_SEARCH') || 'Adapt to Float Search')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.adaptToFloatSearch)
                .onChange(async (value) => {
                    await this.setControlValue('adaptToFloatSearch', value);
                }));

        this.setRichDescription(adaptFloatSearchSetting, [
            t('ADAPT_FLOAT_SEARCH_DESC_PREFIX') || 'Enable compatibility with ',
            {
                text: t('FLOAT_SEARCH_PLUGIN_NAME') || 'Float Search',
                href: FLOAT_SEARCH_PLUGIN_URI
            },
            t('ADAPT_FLOAT_SEARCH_DESC_SUFFIX') || ' modal and other search views.'
        ]);
    }
}
