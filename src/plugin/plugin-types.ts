import type { Plugin, Workspace, WorkspaceLeaf } from 'obsidian';
import type { AdvancedSearchSettings } from '../settings';

export type LegacyAdvancedSearchSettings = Partial<AdvancedSearchSettings> & {
    enableExperimentalDragAndDrop?: boolean;
    /** Pre-1.x: treated as default-on when `floatingSearchNotePreviewDefaultOn` was absent */
    floatingSearchNotePreviewEnabled?: boolean;
    /** Replaced by `floatingSearchNotePreviewYamlHiddenByDefault` */
    floatingSearchNotePreviewMetadataShowReading?: boolean;
    floatingSearchNotePreviewMetadataShowLivePreview?: boolean;
    floatingSearchNotePreviewMetadataShowSource?: boolean;
};

export type WorkspaceWithDetachedLeaf = Plugin['app']['workspace'] & {
    createDetachedLeaf?: () => WorkspaceLeaf;
    createLeafInParent?: (parent: unknown, index?: number) => WorkspaceLeaf;
    floatingSplit?: unknown;
};

export type WorkspaceEnsureSideLeafOptions = {
    active?: boolean;
    split?: boolean;
    reveal?: boolean;
    state?: Record<string, unknown>;
};

export type WorkspaceSetActiveLeafParams = {
    focus?: boolean;
};

export type WorkspaceSetActiveLeafArgs =
    | [params?: WorkspaceSetActiveLeafParams]
    | [pushHistory: boolean, focus: boolean];

export type WorkspaceLeafOpenFileArgs = Parameters<WorkspaceLeaf['openFile']>;
export type WorkspaceOpenLinkTextArgs = Parameters<Workspace['openLinkText']>;

export type AppWithInternalSettings = Plugin['app'] & {
    setting?: {
        open: () => void;
        openTabById?: (id: string) => void;
        activeTab?: { id?: string };
        tabContentContainer?: HTMLElement;
        pluginTabs?: Record<string, { id: string }>;
    };
};
