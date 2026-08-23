import { Check, ChevronDown, ChevronLeft, ChevronRight, Italic, MoreHorizontal, Pin, PinOff, Plus, Search, Strikethrough, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SectionTitle } from '../components';
import { DesktopPageLayout } from '../components/DesktopShell';
import { accent, accentFaint, accentSoft, faint, line, muted, panel, panelSoft, surfaceElevated, text } from '../theme';
import type { Note, NoteBlock, NoteBlockType, NoteDocument } from '../types';
import { uid } from '../utils';

type NotesChange = (updater: (notes: Note[]) => Note[]) => void;
type SaveState = 'idle' | 'saving' | 'saved';
type InlineMark = (typeof inlineTools)[number]['mark'];
type TextSelection = { start: number; end: number };

const blockOptions: Array<{ icon: string; label: string; type: NoteBlockType }> = [
  { icon: 'T', label: 'Текст', type: 'paragraph' },
  { icon: 'H1', label: 'Заголовок 1', type: 'heading1' },
  { icon: 'H2', label: 'Заголовок 2', type: 'heading2' },
  { icon: 'H3', label: 'Заголовок 3', type: 'heading3' },
  { icon: '•', label: 'Список', type: 'bullet' },
  { icon: '1.', label: 'Нумерованный', type: 'numbered' },
  { icon: '☑', label: 'Чек-лист', type: 'checklist' },
  { icon: '▸', label: 'Toggle', type: 'toggle' },
  { icon: '“', label: 'Цитата', type: 'quote' },
  { icon: '</>', label: 'Код', type: 'code' },
  { icon: '—', label: 'Разделитель', type: 'divider' },
];

const inlineTools = [
  { label: 'B', mark: 'bold' },
  { label: 'I', mark: 'italic' },
  { label: 'S', mark: 'strike' },
  { label: 'Code', mark: 'code' },
  { label: 'Link', mark: 'link' },
] as const;

export function NotesScreen({
  isDesktop = false,
  notes,
  onNotesChange,
  saveState = 'idle',
  userId = null,
}: {
  isDesktop?: boolean;
  notes: Note[];
  onNotesChange: NotesChange;
  saveState?: SaveState;
  userId?: string | null;
}) {
  const visibleNotes = notes.filter((note) => !note.deletedAt);
  const sortedNotes = useMemo(() => [...visibleNotes].sort(compareNotes), [visibleNotes]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(sortedNotes[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [blockMenu, setBlockMenu] = useState<{ blockId: string; childOf?: string | null } | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const selectedNote = sortedNotes.find((note) => note.id === selectedNoteId) ?? sortedNotes[0] ?? null;
  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sortedNotes.filter((note) => !normalizedQuery || `${note.title} ${notePlainText(note)}`.toLowerCase().includes(normalizedQuery));
  }, [query, sortedNotes]);
  const pinnedNotes = filteredNotes.filter((note) => note.pinned);
  const regularNotes = filteredNotes.filter((note) => !note.pinned);

  useEffect(() => {
    if (selectedNoteId && sortedNotes.some((note) => note.id === selectedNoteId)) return;
    setSelectedNoteId(sortedNotes[0]?.id ?? null);
  }, [selectedNoteId, sortedNotes]);

  function createNote() {
    const now = new Date().toISOString();
    const note: Note = {
      id: uid('note'),
      userId,
      title: 'Без названия',
      content: createEmptyDocument(),
      pinned: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    onNotesChange((items) => [note, ...items]);
    setSelectedNoteId(note.id);
    setMobileEditorOpen(true);
  }

  function patchNote(noteId: string, patch: Partial<Pick<Note, 'content' | 'pinned' | 'title'>>) {
    const now = new Date().toISOString();
    onNotesChange((items) => items.map((note) => (note.id === noteId ? { ...note, ...patch, updatedAt: now } : note)));
  }

  function softDeleteNote(noteId: string) {
    const now = new Date().toISOString();
    onNotesChange((items) => items.map((note) => (note.id === noteId ? { ...note, deletedAt: now, updatedAt: now } : note)));
    setDeleteNoteId(null);
    if (selectedNoteId === noteId) {
      const nextNote = sortedNotes.find((note) => note.id !== noteId);
      setSelectedNoteId(nextNote?.id ?? null);
      setMobileEditorOpen(false);
    }
  }

  function updateTitle(value: string) {
    if (!selectedNote) return;
    patchNote(selectedNote.id, { title: value });
  }

  function updateContent(content: NoteDocument) {
    if (!selectedNote) return;
    patchNote(selectedNote.id, { content });
  }

  function updateBlock(blockId: string, patch: Partial<NoteBlock>) {
    if (!selectedNote) return;
    updateContent({ ...selectedNote.content, content: updateBlocks(selectedNote.content.content, blockId, patch) });
  }

  function addBlock(afterBlockId?: string, type: NoteBlockType = 'paragraph', childOf?: string | null) {
    if (!selectedNote) return;
    const nextBlock = createBlock(type);
    const content = childOf
      ? updateBlocks(selectedNote.content.content, childOf, {}, (block) => ({ ...block, collapsed: false, children: [...(block.children ?? []), nextBlock] }))
      : insertBlockAfter(selectedNote.content.content, nextBlock, afterBlockId);
    updateContent({ ...selectedNote.content, content });
    setBlockMenu(null);
  }

  function deleteBlock(blockId: string) {
    if (!selectedNote || selectedNote.content.content.length <= 1) return;
    updateContent({ ...selectedNote.content, content: removeBlock(selectedNote.content.content, blockId) });
  }

  function applyInlineMark(block: NoteBlock, mark: InlineMark, selection?: TextSelection) {
    const value = block.text;
    const wrappers = {
      bold: ['**', '**'],
      code: ['`', '`'],
      italic: ['_', '_'],
      link: ['[', '](https://)'],
      strike: ['~~', '~~'],
    } as const;
    const [left, right] = wrappers[mark];
    const start = Math.max(0, Math.min(selection?.start ?? 0, value.length));
    const end = Math.max(start, Math.min(selection?.end ?? value.length, value.length));
    if (start === end) {
      updateBlock(block.id, { text: `${left}${value || 'текст'}${right}` });
      return;
    }
    updateBlock(block.id, { text: `${value.slice(0, start)}${left}${value.slice(start, end)}${right}${value.slice(end)}` });
  }

  function openNote(note: Note) {
    setSelectedNoteId(note.id);
    setMobileEditorOpen(true);
  }

  const listPanel = (
    <View style={[local.notesListPanel, isDesktop && local.desktopNotesListPanel]}>
      <View style={local.notesListHeader}>
        {isDesktop ? <Text style={local.desktopContextTitle}>Заметки</Text> : <SectionTitle title="Заметки" subtitle="Сохрани и найди потом" />}
        <Pressable accessibilityLabel="Создать заметку" accessibilityRole="button" onPress={createNote} style={[local.roundAddButton, isDesktop && local.desktopAddButton]}>
          <Plus color={isDesktop ? text : panel} size={isDesktop ? 17 : 19} strokeWidth={3} />
        </Pressable>
      </View>

      <View style={local.searchBox}>
        <Search color={muted} size={16} />
        <TextInput
          onChangeText={setQuery}
          placeholder="Поиск..."
          placeholderTextColor={faint}
          style={local.searchInput}
          value={query}
        />
      </View>

      <ScrollView contentContainerStyle={local.noteListContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!filteredNotes.length ? (
          <View style={[local.emptyState, isDesktop && local.desktopEmptyState]}>
            <Text style={local.emptyTitle}>Заметок пока нет</Text>
            <Text style={local.meta}>Сохраняй здесь любую информацию, которую не хочешь потерять.</Text>
            {!isDesktop ? <Pressable onPress={createNote} style={local.primaryButton}><Text style={local.primaryButtonText}>Создать заметку</Text></Pressable> : null}
          </View>
        ) : (
          <>
            {pinnedNotes.length ? <NoteGroup compact={isDesktop} title="Закреплённые" notes={pinnedNotes} selectedNoteId={selectedNote?.id ?? null} onOpen={openNote} /> : null}
            <NoteGroup compact={isDesktop} title={pinnedNotes.length ? 'Все заметки' : 'Недавние'} notes={regularNotes} selectedNoteId={selectedNote?.id ?? null} onOpen={openNote} />
          </>
        )}
      </ScrollView>
    </View>
  );

  const editorPanel = selectedNote ? (
    <View style={[local.editorPanel, isDesktop && local.desktopEditorPanel]}>
      {!isDesktop ? (
        <View style={local.mobileEditorHeader}>
          <Pressable onPress={() => setMobileEditorOpen(false)} style={local.iconButton}>
            <ChevronLeft color={text} size={21} />
          </Pressable>
          <Text style={local.saveStateText}>{saveStateLabel(saveState)}</Text>
          <Pressable onPress={() => setDeleteNoteId(selectedNote.id)} style={local.iconButton}>
            <Trash2 color={muted} size={17} />
          </Pressable>
        </View>
      ) : null}

      <View style={local.editorToolbar}>
        <Text style={local.saveStateText}>{saveStateLabel(saveState)}</Text>
        <View style={local.editorToolbarActions}>
          <Pressable onPress={() => patchNote(selectedNote.id, { pinned: !selectedNote.pinned })} style={local.inlineAction}>
            {selectedNote.pinned ? <PinOff color={accent} size={14} /> : <Pin color={muted} size={14} />}
            <Text style={local.inlineActionText}>{selectedNote.pinned ? 'Открепить' : 'Закрепить'}</Text>
          </Pressable>
          <Pressable onPress={() => setDeleteNoteId(selectedNote.id)} style={local.inlineAction}>
            <Trash2 color={muted} size={14} />
            <Text style={local.inlineActionText}>Удалить</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={local.editorScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={local.document}>
          <TextInput
            autoFocus={isDesktop}
            multiline
            onChangeText={updateTitle}
            placeholder="Без названия"
            placeholderTextColor={faint}
            style={local.titleInput}
            value={selectedNote.title === 'Без названия' ? '' : selectedNote.title}
          />
          <View style={local.blockList}>
            {selectedNote.content.content.map((block, index) => (
              <NoteBlockEditor
                block={block}
                index={index}
                key={block.id}
                onAddChild={() => addBlock(undefined, 'paragraph', block.id)}
                onAddNext={() => addBlock(block.id)}
                onApplyInlineMark={applyInlineMark}
                onChange={updateBlock}
                onDelete={deleteBlock}
                onOpenBlockMenu={(childOf) => setBlockMenu({ blockId: block.id, childOf })}
              />
            ))}
          </View>
          <Pressable onPress={() => addBlock(selectedNote.content.content[selectedNote.content.content.length - 1]?.id)} style={local.addBlockButton}>
            <Plus color={accent} size={15} />
            <Text style={local.addBlockText}>Добавить блок</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  ) : (
    <View style={[local.editorPanel, local.editorEmpty, isDesktop && local.desktopEditorPanel]}>
      <Text style={local.emptyTitle}>Выбери заметку</Text>
      <Text style={local.meta}>Или создай новую, чтобы сразу начать писать.</Text>
      {!isDesktop ? <Pressable onPress={createNote} style={local.primaryButton}><Text style={local.primaryButtonText}>Создать заметку</Text></Pressable> : null}
    </View>
  );

  return (
    <View style={local.screen}>
      {isDesktop ? (
        <DesktopPageLayout main={editorPanel} right={listPanel} />
      ) : mobileEditorOpen && selectedNote ? (
        editorPanel
      ) : (
        listPanel
      )}

      <Modal animationType="fade" transparent visible={Boolean(blockMenu)} onRequestClose={() => setBlockMenu(null)}>
        <View style={local.modalOverlay}>
          <View style={local.blockMenuCard}>
            <View style={local.modalHeader}>
              <Text style={local.modalTitle}>Тип блока</Text>
              <Pressable onPress={() => setBlockMenu(null)} style={local.iconButton}>
                <X color={muted} size={18} />
              </Pressable>
            </View>
            <View style={local.blockMenuGrid}>
              {blockOptions.map((option) => {
                return (
                  <Pressable
                    key={option.type}
                    onPress={() => {
                      if (!selectedNote || !blockMenu) return;
                      if (blockMenu.childOf) {
                        addBlock(undefined, option.type, blockMenu.childOf);
                      } else {
                        updateBlock(blockMenu.blockId, { type: option.type, checked: option.type === 'checklist' ? false : undefined });
                        setBlockMenu(null);
                      }
                    }}
                    style={local.blockMenuItem}
                  >
                    <Text style={local.blockMenuIcon}>{option.icon}</Text>
                    <Text style={local.blockMenuText}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={Boolean(deleteNoteId)} onRequestClose={() => setDeleteNoteId(null)}>
        <View style={local.modalOverlay}>
          <View style={local.confirmCard}>
            <Text style={local.modalTitle}>Удалить заметку?</Text>
            <Text style={local.meta}>Заметка исчезнет из списка и не восстановится после синхронизации.</Text>
            <View style={local.confirmActions}>
              <Pressable onPress={() => setDeleteNoteId(null)} style={local.secondaryButton}>
                <Text style={local.secondaryButtonText}>Отмена</Text>
              </Pressable>
              <Pressable onPress={() => deleteNoteId && softDeleteNote(deleteNoteId)} style={local.dangerButton}>
                <Text style={local.dangerButtonText}>Удалить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function NoteGroup({ compact, notes, onOpen, selectedNoteId, title }: { compact: boolean; notes: Note[]; onOpen: (note: Note) => void; selectedNoteId: string | null; title: string }) {
  if (!notes.length) return null;

  return (
    <View style={local.noteGroup}>
      <Text style={local.groupTitle}>{title}</Text>
      {notes.map((note) => (
        <Pressable key={note.id} onPress={() => onOpen(note)} style={[local.noteRow, compact && local.desktopNoteRow, selectedNoteId === note.id && local.noteRowActive, compact && selectedNoteId === note.id && local.desktopNoteRowActive]}>
          <View style={local.noteRowTop}>
            <Text numberOfLines={1} style={local.noteTitle}>{note.title.trim() || 'Без названия'}</Text>
            {note.pinned ? <Pin color={accent} size={12} /> : null}
          </View>
          <Text numberOfLines={2} style={local.notePreview}>{notePlainText(note) || 'Пустая заметка'}</Text>
          <Text style={local.noteTime}>{formatNoteTime(note.updatedAt)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function NoteBlockEditor({
  block,
  index,
  onAddChild,
  onAddNext,
  onApplyInlineMark,
  onChange,
  onDelete,
  onOpenBlockMenu,
}: {
  block: NoteBlock;
  index: number;
  onAddChild: () => void;
  onAddNext: () => void;
  onApplyInlineMark: (block: NoteBlock, mark: InlineMark, selection?: TextSelection) => void;
  onChange: (blockId: string, patch: Partial<NoteBlock>) => void;
  onDelete: (blockId: string) => void;
  onOpenBlockMenu: (childOf?: string | null) => void;
}) {
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });

  if (block.type === 'divider') {
    return (
      <View style={local.dividerBlock}>
        <View style={local.dividerLine} />
        <Pressable onPress={() => onOpenBlockMenu(null)} style={local.blockIconButton}>
          <MoreHorizontal color={muted} size={15} />
        </Pressable>
      </View>
    );
  }

  const inputStyle = [
    local.blockInput,
    block.type === 'heading1' && local.heading1,
    block.type === 'heading2' && local.heading2,
    block.type === 'heading3' && local.heading3,
    block.type === 'quote' && local.quoteInput,
    block.type === 'code' && local.codeInput,
  ];
  const prefix = blockPrefix(block, index);

  return (
    <View style={[local.blockEditor, block.type === 'quote' && local.quoteBlock, block.type === 'code' && local.codeBlock]}>
      <View style={local.blockRow}>
        <Pressable onPress={() => onOpenBlockMenu(null)} style={local.blockHandle}>
          {block.type === 'checklist' ? (
            <Pressable onPress={() => onChange(block.id, { checked: !block.checked })} style={[local.checkBox, block.checked && local.checkBoxDone]}>
              {block.checked ? <Check color={panel} size={12} strokeWidth={3} /> : null}
            </Pressable>
          ) : block.type === 'toggle' ? (
            <Pressable onPress={() => onChange(block.id, { collapsed: !block.collapsed })} style={local.blockIconButton}>
              {block.collapsed ? <ChevronRight color={muted} size={15} /> : <ChevronDown color={muted} size={15} />}
            </Pressable>
          ) : (
            <Text style={local.blockPrefix}>{prefix}</Text>
          )}
        </Pressable>
        <TextInput
          multiline
          onChangeText={(value) => onChange(block.id, { text: value })}
          onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
          onSubmitEditing={onAddNext}
          placeholder={block.type === 'toggle' ? 'Toggle' : 'Напиши что-нибудь'}
          placeholderTextColor={faint}
          style={inputStyle}
          value={block.text}
        />
        <Pressable onPress={() => onDelete(block.id)} style={local.blockIconButton}>
          <Trash2 color={muted} size={14} />
        </Pressable>
      </View>
      <View style={local.inlineToolbar}>
        {inlineTools.map((tool) => (
          <Pressable key={tool.mark} onPress={() => onApplyInlineMark(block, tool.mark, selection)} style={local.inlineToolButton}>
            {tool.mark === 'italic' ? <Italic color={muted} size={12} /> : tool.mark === 'strike' ? <Strikethrough color={muted} size={12} /> : <Text style={local.inlineToolText}>{tool.label}</Text>}
          </Pressable>
        ))}
        <Pressable onPress={onAddNext} style={local.inlineToolButton}>
          <Plus color={muted} size={12} />
        </Pressable>
      </View>
      {block.type === 'toggle' && !block.collapsed ? (
        <View style={local.toggleChildren}>
          {(block.children ?? []).map((child, childIndex) => (
            <ChildNoteBlockEditor
              block={child}
              index={childIndex}
              key={child.id}
              onAddNext={onAddChild}
              onApplyInlineMark={onApplyInlineMark}
              onChange={onChange}
              onDelete={onDelete}
              onOpenBlockMenu={() => onOpenBlockMenu(block.id)}
            />
          ))}
          <Pressable onPress={onAddChild} style={local.addChildButton}>
            <Plus color={accent} size={13} />
            <Text style={local.addBlockText}>Добавить внутрь</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ChildNoteBlockEditor({
  block,
  index,
  onAddNext,
  onApplyInlineMark,
  onChange,
  onDelete,
  onOpenBlockMenu,
}: {
  block: NoteBlock;
  index: number;
  onAddNext: () => void;
  onApplyInlineMark: (block: NoteBlock, mark: InlineMark, selection?: TextSelection) => void;
  onChange: (blockId: string, patch: Partial<NoteBlock>) => void;
  onDelete: (blockId: string) => void;
  onOpenBlockMenu: () => void;
}) {
  const [selection, setSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const prefix = blockPrefix(block, index);
  const inputStyle = [
    local.blockInput,
    block.type === 'heading1' && local.heading2,
    block.type === 'heading2' && local.heading3,
    block.type === 'quote' && local.quoteInput,
    block.type === 'code' && local.codeInput,
  ];

  if (block.type === 'divider') {
    return (
      <View style={local.dividerBlock}>
        <View style={local.dividerLine} />
        <Pressable onPress={onOpenBlockMenu} style={local.blockIconButton}>
          <MoreHorizontal color={muted} size={15} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[local.blockEditor, block.type === 'quote' && local.quoteBlock, block.type === 'code' && local.codeBlock]}>
      <View style={local.blockRow}>
        <Pressable onPress={onOpenBlockMenu} style={local.blockHandle}>
          {block.type === 'checklist' ? (
            <Pressable onPress={() => onChange(block.id, { checked: !block.checked })} style={[local.checkBox, block.checked && local.checkBoxDone]}>
              {block.checked ? <Check color={panel} size={12} strokeWidth={3} /> : null}
            </Pressable>
          ) : (
            <Text style={local.blockPrefix}>{prefix}</Text>
          )}
        </Pressable>
        <TextInput
          multiline
          onChangeText={(value) => onChange(block.id, { text: value })}
          onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
          onSubmitEditing={onAddNext}
          placeholder="Напиши что-нибудь"
          placeholderTextColor={faint}
          style={inputStyle}
          value={block.text}
        />
        <Pressable onPress={() => onDelete(block.id)} style={local.blockIconButton}>
          <Trash2 color={muted} size={14} />
        </Pressable>
      </View>
      <View style={local.inlineToolbar}>
        {inlineTools.map((tool) => (
          <Pressable key={tool.mark} onPress={() => onApplyInlineMark(block, tool.mark, selection)} style={local.inlineToolButton}>
            {tool.mark === 'italic' ? <Italic color={muted} size={12} /> : tool.mark === 'strike' ? <Strikethrough color={muted} size={12} /> : <Text style={local.inlineToolText}>{tool.label}</Text>}
          </Pressable>
        ))}
        <Pressable onPress={onAddNext} style={local.inlineToolButton}>
          <Plus color={muted} size={12} />
        </Pressable>
      </View>
    </View>
  );
}

function createEmptyDocument(): NoteDocument {
  return { type: 'doc', content: [createBlock('paragraph')] };
}

function createBlock(type: NoteBlockType): NoteBlock {
  return {
    id: uid('note-block'),
    text: '',
    type,
    ...(type === 'checklist' ? { checked: false } : {}),
    ...(type === 'toggle' ? { children: [], collapsed: false } : {}),
  };
}

function insertBlockAfter(blocks: NoteBlock[], block: NoteBlock, afterBlockId?: string): NoteBlock[] {
  if (!afterBlockId) return [...blocks, block];
  const index = blocks.findIndex((item) => item.id === afterBlockId);
  if (index < 0) return [...blocks, block];
  return [...blocks.slice(0, index + 1), block, ...blocks.slice(index + 1)];
}

function updateBlocks(blocks: NoteBlock[], blockId: string, patch: Partial<NoteBlock>, transform?: (block: NoteBlock) => NoteBlock): NoteBlock[] {
  return blocks.map((block) => {
    if (block.id === blockId) return transform ? transform({ ...block, ...patch }) : { ...block, ...patch };
    if (!block.children?.length) return block;
    return { ...block, children: updateBlocks(block.children, blockId, patch, transform) };
  });
}

function removeBlock(blocks: NoteBlock[], blockId: string): NoteBlock[] {
  return blocks
    .filter((block) => block.id !== blockId)
    .map((block) => (block.children?.length ? { ...block, children: removeBlock(block.children, blockId) } : block));
}

function notePlainText(note: Note): string {
  return flattenBlocks(note.content.content).join(' ').trim();
}

function flattenBlocks(blocks: NoteBlock[]): string[] {
  const values: string[] = [];
  blocks.forEach((block) => {
    if (block.text) values.push(block.text);
    if (block.children?.length) values.push(...flattenBlocks(block.children));
  });
  return values;
}

function blockPrefix(block: NoteBlock, index: number): string {
  if (block.type === 'bullet') return '•';
  if (block.type === 'numbered') return `${index + 1}.`;
  if (block.type === 'quote') return '“';
  if (block.type === 'code') return '</>';
  return '';
}

function compareNotes(first: Note, second: Note): number {
  if (first.pinned !== second.pinned) return first.pinned ? -1 : 1;
  return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
}

function formatNoteTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', hour: '2-digit', minute: '2-digit', month: '2-digit' }).format(date);
}

function saveStateLabel(value: SaveState): string {
  if (value === 'saving') return 'Сохраняется...';
  if (value === 'saved') return 'Сохранено';
  return '';
}

const local: Record<string, any> = {
  addBlockButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row' as const,
    gap: 7,
    minHeight: 34,
    outlineStyle: 'none' as const,
    paddingHorizontal: 2,
  },
  addBlockText: { color: accent, fontSize: 12, lineHeight: 16 },
  addChildButton: {
    alignItems: 'center',
    flexDirection: 'row' as const,
    gap: 6,
    minHeight: 30,
    outlineStyle: 'none' as const,
  },
  blockEditor: { gap: 5 },
  blockHandle: { alignItems: 'center', minHeight: 36, justifyContent: 'center', width: 28 },
  blockIconButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    outlineStyle: 'none' as const,
    width: 30,
  },
  blockInput: {
    color: text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 36,
    outlineStyle: 'none' as const,
    paddingVertical: 5,
  },
  blockList: { gap: 9 },
  blockMenuCard: {
    backgroundColor: panelSoft,
    borderColor: line,
    borderRadius: 10,
    borderWidth: 1,
    gap: 14,
    maxWidth: 460,
    padding: 16,
    width: '92%' as const,
  },
  blockMenuGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  blockMenuIcon: {
    color: accent,
    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 16,
    minWidth: 22,
  },
  blockMenuItem: {
    alignItems: 'center',
    borderColor: line,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 7,
    minHeight: 34,
    outlineStyle: 'none' as const,
    paddingHorizontal: 11,
  },
  blockMenuText: { color: text, fontSize: 13, lineHeight: 17 },
  blockPrefix: { color: muted, fontSize: 14, lineHeight: 19, textAlign: 'center' as const },
  blockRow: { alignItems: 'flex-start', flexDirection: 'row' as const, gap: 6 },
  checkBox: {
    alignItems: 'center',
    borderColor: muted,
    borderRadius: 5,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  checkBoxDone: { backgroundColor: accent, borderColor: accent },
  codeBlock: {
    backgroundColor: surfaceElevated,
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  codeInput: { fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 13, lineHeight: 19 },
  confirmActions: { flexDirection: 'row' as const, gap: 10, justifyContent: 'flex-end' as const },
  confirmCard: {
    backgroundColor: panelSoft,
    borderColor: line,
    borderRadius: 10,
    borderWidth: 1,
    gap: 14,
    maxWidth: 420,
    padding: 16,
    width: '92%' as const,
  },
  dangerButton: {
    backgroundColor: 'var(--koda-error-soft, #2b1919)',
    borderColor: 'var(--koda-error, #d97875)',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    outlineStyle: 'none' as const,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  dangerButtonText: { color: 'var(--koda-error, #d97875)', fontSize: 13, fontWeight: '700' as const },
  desktopContextTitle: { color: text, fontSize: 18, fontWeight: '800' as const, lineHeight: 24 },
  desktopAddButton: { backgroundColor: accentSoft, borderRadius: 6, height: 30, width: 30 },
  desktopEmptyState: { borderWidth: 0, paddingHorizontal: 0 },
  desktopEditorPanel: { borderRadius: 0, borderWidth: 0, width: '100%' as const },
  desktopNoteRow: { borderLeftColor: 'transparent', borderLeftWidth: 2, borderRadius: 5, minHeight: 64, paddingHorizontal: 10, paddingVertical: 8 },
  desktopNoteRowActive: { borderLeftColor: accent },
  desktopNotesListPanel: { backgroundColor: panel, borderRadius: 0, borderWidth: 0, padding: 0, width: '100%' as const },
  dividerBlock: { alignItems: 'center', flexDirection: 'row' as const, gap: 10, minHeight: 34 },
  dividerLine: { backgroundColor: line, flex: 1, height: 1 },
  document: { gap: 16, maxWidth: 860, width: '100%' as const },
  editorEmpty: { alignItems: 'flex-start', gap: 10, justifyContent: 'center' },
  editorPanel: {
    backgroundColor: panel,
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden' as const,
  },
  editorScroll: { alignItems: 'center', padding: 22, paddingBottom: 96 },
  editorToolbar: {
    alignItems: 'center',
    borderBottomColor: line,
    borderBottomWidth: 1,
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 16,
  },
  editorToolbarActions: { alignItems: 'center', flexDirection: 'row' as const, gap: 8 },
  emptyState: {
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  emptyTitle: { color: text, fontSize: 18, fontWeight: '700' as const, lineHeight: 23 },
  groupTitle: { color: muted, fontSize: 11, fontWeight: '700' as const, letterSpacing: 3, lineHeight: 15, textTransform: 'uppercase' as const },
  heading1: { fontSize: 26, fontWeight: '800' as const, lineHeight: 32 },
  heading2: { fontSize: 21, fontWeight: '800' as const, lineHeight: 27 },
  heading3: { fontSize: 18, fontWeight: '750' as const, lineHeight: 24 },
  iconButton: {
    alignItems: 'center',
    borderColor: line,
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    outlineStyle: 'none' as const,
    width: 36,
  },
  inlineAction: {
    alignItems: 'center',
    flexDirection: 'row' as const,
    gap: 6,
    minHeight: 30,
    outlineStyle: 'none' as const,
  },
  inlineActionText: { color: muted, fontSize: 12, lineHeight: 16 },
  inlineToolbar: { flexDirection: 'row' as const, gap: 6, paddingLeft: 34 },
  inlineToolButton: {
    alignItems: 'center',
    borderColor: line,
    borderRadius: 999,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    minWidth: 26,
    outlineStyle: 'none' as const,
    paddingHorizontal: 8,
  },
  inlineToolText: { color: muted, fontSize: 11, fontWeight: '700' as const, lineHeight: 14 },
  meta: { color: muted, fontSize: 13, lineHeight: 18 },
  mobileEditorHeader: {
    alignItems: 'center',
    borderBottomColor: line,
    borderBottomWidth: 1,
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  modalHeader: { alignItems: 'center', flexDirection: 'row' as const, justifyContent: 'space-between' },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalTitle: { color: text, fontSize: 18, fontWeight: '700' as const, lineHeight: 23 },
  noteGroup: { gap: 8 },
  noteListContent: { gap: 16, paddingBottom: 90 },
  notePreview: { color: muted, fontSize: 12, lineHeight: 17 },
  noteRow: {
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    minHeight: 86,
    outlineStyle: 'none' as const,
    padding: 12,
  },
  noteRowActive: { backgroundColor: accentFaint, borderColor: accent },
  noteRowTop: { alignItems: 'center', flexDirection: 'row' as const, gap: 8 },
  noteTime: { color: faint, fontSize: 11, lineHeight: 14 },
  noteTitle: { color: text, flex: 1, fontSize: 15, fontWeight: '700' as const, lineHeight: 20 },
  notesListHeader: { alignItems: 'flex-start', flexDirection: 'row' as const, justifyContent: 'space-between', gap: 12 },
  notesListPanel: {
    backgroundColor: panel,
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    gap: 14,
    minHeight: 0,
    padding: 16,
    width: '100%' as const,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: accent,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
    outlineStyle: 'none' as const,
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: panel, fontSize: 13, fontWeight: '800' as const, lineHeight: 17 },
  quoteBlock: { borderLeftColor: accent, borderLeftWidth: 2, paddingLeft: 8 },
  quoteInput: { color: text, fontStyle: 'italic' as const },
  roundAddButton: {
    alignItems: 'center',
    backgroundColor: accent,
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    outlineStyle: 'none' as const,
    width: 42,
  },
  saveStateText: { color: faint, fontSize: 11, lineHeight: 14 },
  screen: { flex: 1, minHeight: 0 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: panelSoft,
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 11,
  },
  searchInput: {
    color: text,
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    minHeight: 40,
    outlineStyle: 'none' as const,
    paddingVertical: 0,
  },
  secondaryButton: {
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    outlineStyle: 'none' as const,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  secondaryButtonText: { color: text, fontSize: 13, fontWeight: '700' as const },
  titleInput: {
    color: text,
    fontSize: 32,
    fontWeight: '850' as const,
    lineHeight: 39,
    minHeight: 48,
    outlineStyle: 'none' as const,
    paddingVertical: 0,
  },
  toggleChildren: {
    borderLeftColor: line,
    borderLeftWidth: 1,
    gap: 8,
    marginLeft: 42,
    paddingLeft: 12,
  },
};
