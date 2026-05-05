import { setIcon, TFile } from 'obsidian';
import { t } from '../lang/helpers';

export type FloatingNoteMode = 'edit' | 'preview';

export interface FloatingNotePanelOptions {
    onClose: () => void;
    onModeChange: (mode: FloatingNoteMode) => void;
    onSave: (content: string) => void | Promise<void>;
}

export class FloatingNotePanel {
    public readonly rootEl: HTMLElement;
    public readonly previewEl: HTMLElement;

    private readonly titleEl: HTMLElement;
    private readonly subtitleEl: HTMLElement;
    private readonly editBtn: HTMLButtonElement;
    private readonly previewBtn: HTMLButtonElement;
    private readonly saveBtn: HTMLButtonElement;
    private readonly closeBtn: HTMLButtonElement;
    private readonly emptyEl: HTMLElement;
    private readonly editorEl: HTMLTextAreaElement;
    private readonly options: FloatingNotePanelOptions;
    private currentFile: TFile | null = null;
    private mode: FloatingNoteMode = 'edit';
    private dirty = false;

    constructor(container: HTMLElement, options: FloatingNotePanelOptions) {
        this.options = options;
        this.rootEl = container.createDiv({ cls: 'asui-floating-note-panel' });

        const toolbarEl = this.rootEl.createDiv({ cls: 'asui-floating-note-toolbar' });
        const metaEl = toolbarEl.createDiv({ cls: 'asui-floating-note-meta' });
        this.titleEl = metaEl.createDiv({ cls: 'asui-floating-note-title', text: t('FLOATING_NOTE_WINDOW_TITLE') });
        this.subtitleEl = metaEl.createDiv({ cls: 'asui-floating-note-subtitle', text: '' });

        const actionsEl = toolbarEl.createDiv({ cls: 'asui-floating-note-actions' });
        this.editBtn = this.createIconButton(actionsEl, 'pencil', t('FLOATING_NOTE_EDIT'));
        this.previewBtn = this.createIconButton(actionsEl, 'book-open', t('FLOATING_NOTE_PREVIEW'));
        this.saveBtn = this.createIconButton(actionsEl, 'save', t('FLOATING_NOTE_SAVE'));
        this.closeBtn = this.createIconButton(actionsEl, 'x', t('FLOATING_NOTE_CLOSE'));

        this.emptyEl = this.rootEl.createDiv({
            cls: 'asui-floating-note-empty',
            text: t('FLOATING_NOTE_EMPTY')
        });

        this.editorEl = this.rootEl.createEl('textarea', {
            cls: 'asui-floating-note-editor',
            attr: { spellcheck: 'false' }
        });
        this.previewEl = this.rootEl.createDiv({ cls: 'asui-floating-note-preview markdown-rendered' });

        this.editBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            this.setMode('edit');
        };
        this.previewBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            this.setMode('preview');
        };
        this.saveBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            void this.options.onSave(this.editorEl.value);
        };
        this.closeBtn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            this.options.onClose();
        };

        this.editorEl.addEventListener('input', () => {
            this.dirty = true;
            this.updateActionState();
        });

        this.setEmpty();
        this.setMode('edit', false);
    }

    public destroy() {
        this.rootEl.remove();
    }

    public setFile(file: TFile, content: string) {
        this.currentFile = file;
        this.titleEl.setText(file.basename);
        this.subtitleEl.setText(file.path);
        this.editorEl.value = content;
        this.previewEl.empty();
        this.emptyEl.addClass('is-hidden');
        this.editorEl.removeClass('is-hidden');
        this.previewEl.removeClass('is-hidden');
        this.dirty = false;
        this.updateActionState();
    }

    public setEmpty() {
        this.currentFile = null;
        this.titleEl.setText(t('FLOATING_NOTE_WINDOW_TITLE'));
        this.subtitleEl.setText('');
        this.editorEl.value = '';
        this.previewEl.empty();
        this.emptyEl.removeClass('is-hidden');
        this.editorEl.addClass('is-hidden');
        this.previewEl.addClass('is-hidden');
        this.dirty = false;
        this.updateActionState();
    }

    public setMode(mode: FloatingNoteMode, notify = true) {
        this.mode = mode;
        this.editBtn.classList.toggle('is-active', mode === 'edit');
        this.previewBtn.classList.toggle('is-active', mode === 'preview');
        this.editorEl.classList.toggle('is-hidden', mode !== 'edit' || !this.currentFile);
        this.previewEl.classList.toggle('is-hidden', mode !== 'preview' || !this.currentFile);
        if (notify) {
            this.options.onModeChange(mode);
        }
    }

    public getMode() {
        return this.mode;
    }

    public getFile() {
        return this.currentFile;
    }

    public getValue() {
        return this.editorEl.value;
    }

    public isDirty() {
        return this.dirty;
    }

    public markSaved(content?: string) {
        if (typeof content === 'string') {
            this.editorEl.value = content;
        }
        this.dirty = false;
        this.updateActionState();
    }

    public focusEditor() {
        if (this.currentFile && this.mode === 'edit') {
            this.editorEl.focus();
        }
    }

    private updateActionState() {
        this.saveBtn.classList.toggle('is-active', this.dirty);
        this.saveBtn.disabled = !this.currentFile;
        this.editBtn.disabled = !this.currentFile;
        this.previewBtn.disabled = !this.currentFile;
    }

    private createIconButton(container: HTMLElement, icon: string, label: string) {
        const button = container.createEl('button', {
            cls: 'clickable-icon asui-floating-note-action',
            attr: { type: 'button', 'aria-label': label, title: label }
        });
        setIcon(button, icon);
        return button;
    }
}