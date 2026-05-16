import type { App, Workspace } from 'obsidian';
import { TFile, Workspace as WorkspaceClass, WorkspaceLeaf } from 'obsidian';
import { around } from 'monkey-around';
import type {
    WorkspaceEnsureSideLeafOptions,
    WorkspaceLeafOpenFileArgs,
    WorkspaceOpenLinkTextArgs,
    WorkspaceSetActiveLeafArgs,
    WorkspaceSetActiveLeafParams
} from './plugin-types';

export type WorkspaceSearchRoutingHost = {
    register: (callback: () => void) => void;
    getRoutableFloatingSearchLeaf: () => WorkspaceLeaf | null;
    getSidebarSearchLeaf: () => WorkspaceLeaf | null;
    activateFloatingSearchLeaf: (options?: WorkspaceEnsureSideLeafOptions) => void;
};

export type FloatingResultRoutingHost = {
    register: (callback: () => void) => void;
    app: App;
    shouldRouteToFloatingNotePanel: () => boolean;
    getFloatingNoteLeaf: () => WorkspaceLeaf | null;
    openFileInFloatingNoteWindow: (file: TFile) => Promise<void>;
};

export function installWorkspaceSearchRoutingPatches(host: WorkspaceSearchRoutingHost): () => void {
    let ensureSideLeafUninstall: (() => void) | null = null;
    let setActiveLeafUninstall: (() => void) | null = null;
    let revealLeafUninstall: (() => void) | null = null;

    const getRoutableFloatingSearchLeaf = () => host.getRoutableFloatingSearchLeaf();
    const getSidebarSearchLeaf = () => host.getSidebarSearchLeaf();
    const activateFloatingSearchLeaf = (options?: WorkspaceEnsureSideLeafOptions) =>
        host.activateFloatingSearchLeaf(options);

    ensureSideLeafUninstall = around(WorkspaceClass.prototype, {
        ensureSideLeaf: (oldEnsureSideLeaf: Workspace['ensureSideLeaf']) => {
            return async function (
                this: Workspace,
                type: string,
                side: Parameters<Workspace['ensureSideLeaf']>[1],
                options?: WorkspaceEnsureSideLeafOptions
            ) {
                const floatingLeaf = getRoutableFloatingSearchLeaf();
                if (type !== 'search' || !floatingLeaf) {
                    return oldEnsureSideLeaf.call(this, type, side, options);
                }

                activateFloatingSearchLeaf(options);
                return floatingLeaf;
            };
        }
    });

    setActiveLeafUninstall = around(WorkspaceClass.prototype, {
        setActiveLeaf: (oldSetActiveLeaf: Workspace['setActiveLeaf']) => {
            const getFloatingLeaf = () => getRoutableFloatingSearchLeaf();
            const getSidebarLeaf = () => getSidebarSearchLeaf();
            const activateFloatingLeafActive = () => activateFloatingSearchLeaf({ active: true });

            function patchedSetActiveLeaf(this: Workspace, leaf: WorkspaceLeaf, params?: WorkspaceSetActiveLeafParams): void;
            function patchedSetActiveLeaf(this: Workspace, leaf: WorkspaceLeaf, pushHistory: boolean, focus: boolean): void;
            function patchedSetActiveLeaf(this: Workspace, leaf: WorkspaceLeaf, ...args: WorkspaceSetActiveLeafArgs) {
                const floatingLeaf = getFloatingLeaf();
                const sidebarLeaf = getSidebarLeaf();
                if (!floatingLeaf || !sidebarLeaf || leaf !== sidebarLeaf) {
                    return oldSetActiveLeaf.call(this, leaf, ...(args as [WorkspaceSetActiveLeafParams?] | [boolean, boolean]));
                }

                activateFloatingLeafActive();
                return;
            }

            return patchedSetActiveLeaf;
        }
    });

    revealLeafUninstall = around(WorkspaceClass.prototype, {
        revealLeaf: (oldRevealLeaf: Workspace['revealLeaf']) => {
            return async function (this: Workspace, leaf: WorkspaceLeaf) {
                const floatingLeaf = getRoutableFloatingSearchLeaf();
                const sidebarLeaf = getSidebarSearchLeaf();
                if (!floatingLeaf || !sidebarLeaf || leaf !== sidebarLeaf) {
                    return oldRevealLeaf.call(this, leaf);
                }

                activateFloatingSearchLeaf({ reveal: true });
            };
        }
    });

    const dispose = () => {
        ensureSideLeafUninstall?.();
        ensureSideLeafUninstall = null;
        setActiveLeafUninstall?.();
        setActiveLeafUninstall = null;
        revealLeafUninstall?.();
        revealLeafUninstall = null;
    };

    host.register(dispose);
    return dispose;
}

export function installFloatingResultOpenRoutingPatches(host: FloatingResultRoutingHost): () => void {
    let leafOpenFileUninstall: (() => void) | null = null;
    let openLinkTextUninstall: (() => void) | null = null;

    const shouldHandle = () => host.shouldRouteToFloatingNotePanel();
    const getFloatingNoteLeaf = () => host.getFloatingNoteLeaf();
    const openFileInNoteWindow = (file: TFile) => host.openFileInFloatingNoteWindow(file);
    const app = host.app;

    leafOpenFileUninstall = around(WorkspaceLeaf.prototype, {
        openFile: oldOpenFile => {
            return async function (this: WorkspaceLeaf, file: TFile, ...rest: WorkspaceLeafOpenFileArgs extends [TFile, ...infer R] ? R : never) {
                if (!shouldHandle()) {
                    return oldOpenFile.call(this, file, ...rest);
                }

                const noteLeaf = getFloatingNoteLeaf();
                if (noteLeaf && this === noteLeaf) {
                    return oldOpenFile.call(this, file, ...rest);
                }

                await openFileInNoteWindow(file);
            };
        }
    });

    openLinkTextUninstall = around(WorkspaceClass.prototype, {
        openLinkText: oldOpenLinkText => {
            return async function (this: Workspace, ...args: WorkspaceOpenLinkTextArgs) {
                const [linktext, sourcePath, newLeaf, openViewState] = args;
                if (!shouldHandle()) {
                    return oldOpenLinkText.call(this, ...args);
                }

                const destination = app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
                if (destination instanceof TFile) {
                    await openFileInNoteWindow(destination);
                    return;
                }

                return oldOpenLinkText.call(this, linktext, sourcePath, newLeaf, openViewState);
            };
        }
    });

    const dispose = () => {
        leafOpenFileUninstall?.();
        leafOpenFileUninstall = null;
        openLinkTextUninstall?.();
        openLinkTextUninstall = null;
    };

    host.register(dispose);
    return dispose;
}
