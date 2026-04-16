import { Menu } from 'obsidian';
import { t } from '../lang/helpers';

export interface ToggleContextMenuActions {
    openPluginSettings: () => void;
    openFloatingSearchPanel: () => void;
    closeFloatingSearchPanel: () => void;
}

export interface ToggleContextMenuState {
    isFloatingPanelOpen: boolean;
}

export function buildToggleContextMenu(
    menu: Menu,
    state: ToggleContextMenuState,
    actions: ToggleContextMenuActions
) {
    menu.addItem(item => {
        item.setTitle(t('OPEN_PLUGIN_SETTINGS'));
        item.setIcon('settings');
        item.onClick(actions.openPluginSettings);
    });

    menu.addSeparator();
    menu.addItem(item => {
        item.setTitle(state.isFloatingPanelOpen ? t('CLOSE_FLOATING_SEARCH_PANEL') : t('OPEN_FLOATING_SEARCH_PANEL'));
        item.setIcon(state.isFloatingPanelOpen ? 'panel-top-close' : 'panel-top-open');
        item.onClick(() => {
            if (state.isFloatingPanelOpen) {
                actions.closeFloatingSearchPanel();
                return;
            }

            actions.openFloatingSearchPanel();
        });
    });
}