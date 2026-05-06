import { DEFAULT_SETTINGS, type AdvancedSearchSettings } from '../settings';
import type { LegacyAdvancedSearchSettings } from './plugin-types';

export function migrateLegacyAdvancedSearchSettings(raw: LegacyAdvancedSearchSettings): AdvancedSearchSettings {
    const settings = Object.assign({}, DEFAULT_SETTINGS, raw);

    if (
        raw.floatingSearchNotePreviewDefaultOn === undefined &&
        raw.floatingSearchNotePreviewEnabled !== undefined
    ) {
        settings.floatingSearchNotePreviewDefaultOn = !!raw.floatingSearchNotePreviewEnabled;
    }
    delete (settings as unknown as { floatingSearchNotePreviewEnabled?: unknown }).floatingSearchNotePreviewEnabled;

    if (raw.enableExperimentalDragAndDrop !== undefined) {
        if (raw.enableExperimentalGroupDragAndDrop === undefined) {
            settings.enableExperimentalGroupDragAndDrop = raw.enableExperimentalDragAndDrop;
        }
        if (raw.enableExperimentalRowDragAndDrop === undefined) {
            settings.enableExperimentalRowDragAndDrop = false;
        }
    }

    const scale = settings.floatingSearchNotePreviewScale;
    if (typeof scale !== 'number' || Number.isNaN(scale)) {
        settings.floatingSearchNotePreviewScale = DEFAULT_SETTINGS.floatingSearchNotePreviewScale;
    } else {
        settings.floatingSearchNotePreviewScale = Math.round(Math.max(0.5, Math.min(1, scale)) * 10) / 10;
    }
    if (settings.floatingSearchNotePreviewBindSide !== 'left' && settings.floatingSearchNotePreviewBindSide !== 'right') {
        settings.floatingSearchNotePreviewBindSide = 'left';
    }
    if (
        settings.floatingSearchNotePreviewDefaultMarkdownMode !== 'preview' &&
        settings.floatingSearchNotePreviewDefaultMarkdownMode !== 'source'
    ) {
        settings.floatingSearchNotePreviewDefaultMarkdownMode = 'preview';
    }

    if (raw.floatingSearchNotePreviewYamlHiddenByDefault === undefined) {
        const r = raw.floatingSearchNotePreviewMetadataShowReading;
        const l = raw.floatingSearchNotePreviewMetadataShowLivePreview;
        const s = raw.floatingSearchNotePreviewMetadataShowSource;
        if (r === true && l === true && s === true) {
            settings.floatingSearchNotePreviewYamlHiddenByDefault = false;
        } else {
            settings.floatingSearchNotePreviewYamlHiddenByDefault = true;
        }
    }

    const st = settings as unknown as Record<string, unknown>;
    delete st.floatingSearchNotePreviewMetadataShowReading;
    delete st.floatingSearchNotePreviewMetadataShowLivePreview;
    delete st.floatingSearchNotePreviewMetadataShowSource;

    return settings;
}
