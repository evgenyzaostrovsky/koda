import { Check, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SectionTitle } from '../components';
import { accent, accentBorder, faint, line, muted, panel, panelSoft, text } from '../theme';
import type { Project, ProjectTask } from '../types';
import { uid } from '../utils';

type ProjectsChange = (updater: (projects: Project[]) => Project[]) => void;

type ProjectDraft = {
  title: string;
  description: string;
};

type TaskDraft = {
  title: string;
  description: string;
  cost: string;
  plannedDate: string;
  plannedTime: string;
};

const emptyProjectDraft: ProjectDraft = { title: '', description: '' };
const emptyTaskDraft: TaskDraft = { title: '', description: '', cost: '', plannedDate: '', plannedTime: '' };

export function ProjectsScreen({
  isDesktop = false,
  onProjectsChange,
  projects,
}: {
  isDesktop?: boolean;
  onProjectsChange: ProjectsChange;
  projects: Project[];
}) {
  const visibleProjects = projects.filter((project) => project.status !== 'archived');
  const sortedProjects = [...visibleProjects].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(sortedProjects[0]?.id ?? null);
  const selectedProject = sortedProjects.find((project) => project.id === selectedProjectId) ?? sortedProjects[0] ?? null;
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const visibleSelectedTasks = selectedProject?.tasks.filter((task) => !task.deletedAt) ?? [];
  const totalTasks = visibleSelectedTasks.length;
  const doneTasks = visibleSelectedTasks.filter((task) => task.status === 'done').length;
  const progress = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const activeTasks = useMemo(
    () => [...visibleSelectedTasks].sort((first, second) => {
      if (first.status !== second.status) return first.status === 'done' ? 1 : -1;
      return second.updatedAt.localeCompare(first.updatedAt);
    }),
    [visibleSelectedTasks],
  );

  function openProjectModal() {
    setProjectDraft(emptyProjectDraft);
    setProjectModalOpen(true);
  }

  function addProject() {
    const title = projectDraft.title.trim();
    if (!title) return;

    const now = new Date().toISOString();
    const nextProject: Project = {
      id: uid('project'),
      title,
      description: projectDraft.description.trim(),
      status: 'active',
      tasks: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    onProjectsChange((items) => [nextProject, ...items]);
    setSelectedProjectId(nextProject.id);
    setProjectModalOpen(false);
    setProjectDraft(emptyProjectDraft);
  }

  function openTaskModal(task?: ProjectTask) {
    if (!selectedProject) return;
    setEditingTask(task ?? null);
    setTaskDraft(task ? { title: task.title, description: task.description, cost: task.cost, plannedDate: task.plannedDate, plannedTime: task.plannedTime } : emptyTaskDraft);
    setTaskModalOpen(true);
  }

  function saveTask() {
    if (!selectedProject) return;
    const title = taskDraft.title.trim();
    if (!title) return;

    const now = new Date().toISOString();
    onProjectsChange((items) =>
      items.map((project) => {
        if (project.id !== selectedProject.id) return project;
        const nextTask: ProjectTask = {
          id: editingTask?.id ?? uid('project-task'),
          title,
          description: taskDraft.description.trim(),
          cost: taskDraft.cost.trim(),
          plannedDate: taskDraft.plannedDate.trim(),
          plannedTime: taskDraft.plannedTime.trim(),
          status: editingTask?.status ?? 'todo',
          createdAt: editingTask?.createdAt ?? now,
          updatedAt: now,
          completedAt: editingTask?.completedAt ?? null,
          deletedAt: editingTask?.deletedAt ?? null,
        };
        const tasks = editingTask
          ? project.tasks.map((task) => (task.id === editingTask.id ? nextTask : task))
          : [nextTask, ...project.tasks];

        return { ...project, tasks, updatedAt: now };
      }),
    );
    setTaskModalOpen(false);
    setEditingTask(null);
    setTaskDraft(emptyTaskDraft);
  }

  function toggleTask(taskId: string) {
    if (!selectedProject) return;
    const now = new Date().toISOString();
    onProjectsChange((items) =>
      items.map((project) => {
        if (project.id !== selectedProject.id) return project;

        return {
          ...project,
          tasks: project.tasks.map((task) => {
            if (task.id !== taskId) return task;
            const done = task.status !== 'done';
            return { ...task, status: done ? 'done' : 'todo', completedAt: done ? now : null, updatedAt: now };
          }),
          updatedAt: now,
        };
      }),
    );
  }

  function deleteTask() {
    if (!selectedProject || !deleteTaskId) return;
    const now = new Date().toISOString();
    onProjectsChange((items) =>
      items.map((project) =>
        project.id === selectedProject.id
          ? {
              ...project,
              tasks: project.tasks.map((task) => (task.id === deleteTaskId ? { ...task, deletedAt: now, updatedAt: now } : task)),
              updatedAt: now,
            }
          : project,
      ),
    );
    setDeleteTaskId(null);
  }

  function archiveProject(projectId: string) {
    const now = new Date().toISOString();
    onProjectsChange((items) => items.map((project) => (project.id === projectId ? { ...project, status: 'archived', updatedAt: now } : project)));
    setSelectedProjectId((current) => (current === projectId ? null : current));
  }

  return (
    <View style={local.screen}>
      <ScrollView contentContainerStyle={[local.scroll, isDesktop && local.desktopScroll]} showsVerticalScrollIndicator={false}>
        {!isDesktop ? <View style={local.header}>
          <SectionTitle title="Проекты" subtitle="Вещи, которые состоят из нескольких дел" />
          <Pressable onPress={openProjectModal} style={local.addButton}>
            <Plus color={panel} size={19} strokeWidth={3} />
          </Pressable>
        </View> : null}

        <View style={isDesktop ? local.desktopLayout : local.mobileLayout} testID={isDesktop ? 'desktop-page-columns' : undefined}>
          <View style={isDesktop ? local.projectColumn : undefined} testID={isDesktop ? 'desktop-right-column' : undefined}>
            {isDesktop ? (
              <View style={local.rightHeader}>
                <View>
                  <Text style={local.rightTitle}>Проекты</Text>
                  <Text style={local.meta}>Активные</Text>
                </View>
                <Pressable onPress={openProjectModal} style={local.rightAddButton}><Plus color={accent} size={18} strokeWidth={3} /></Pressable>
              </View>
            ) : null}
            {sortedProjects.length ? (
              sortedProjects.map((project) => {
                const active = selectedProject?.id === project.id;
                const visibleTasks = project.tasks.filter((task) => !task.deletedAt);
                const done = visibleTasks.filter((task) => task.status === 'done').length;
                const projectProgress = visibleTasks.length ? Math.round((done / visibleTasks.length) * 100) : 0;

                return (
                  <Pressable
                    key={project.id}
                    onPress={() => setSelectedProjectId(project.id)}
                    style={[local.projectCard, active && local.projectCardActive]}
                  >
                    <View style={local.projectTop}>
                      <View style={local.flexText}>
                        <Text style={local.projectTitle}>{project.title}</Text>
                        {project.description ? <Text numberOfLines={2} style={local.meta}>{project.description}</Text> : null}
                      </View>
                      <Text style={local.percent}>{projectProgress}%</Text>
                    </View>
                    <View style={local.progressTrack}>
                      <View style={[local.progressFill, { width: `${projectProgress}%` }]} />
                    </View>
                    <Text style={local.meta}>{visibleTasks.length ? `${done} из ${visibleTasks.length} задач` : 'задачи пока не добавлены'}</Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={local.meta}>Активных проектов пока нет.</Text>
            )}
          </View>

          <View style={isDesktop ? local.taskColumn : undefined} testID={isDesktop ? 'desktop-main-column' : undefined}>
            {selectedProject ? (
              <>
                <View style={local.detailHeader}>
                  <View style={local.flexText}>
                    <Text style={local.detailTitle}>{selectedProject.title}</Text>
                    {selectedProject.description ? <Text style={local.meta}>{selectedProject.description}</Text> : null}
                  </View>
                  <Pressable onPress={() => archiveProject(selectedProject.id)} style={local.ghostButton}>
                    <Text style={local.ghostText}>Архив</Text>
                  </Pressable>
                </View>

                <View style={local.summaryRow}>
                  <Text style={local.summaryValue}>{progress}%</Text>
                  <View style={local.flexText}>
                    <View style={local.progressTrack}>
                      <View style={[local.progressFill, { width: `${progress}%` }]} />
                    </View>
                    <Text style={local.meta}>{doneTasks} из {totalTasks || 0} задач закрыто</Text>
                  </View>
                </View>

                <Pressable onPress={() => openTaskModal()} style={local.inlineAdd}>
                  <Plus color={accent} size={15} />
                  <Text style={local.inlineAddText}>Добавить задачу</Text>
                </Pressable>

                <View style={local.taskList}>
                  {activeTasks.length ? activeTasks.map((task) => {
                    const done = task.status === 'done';

                    return (
                      <View key={task.id} style={[local.taskRow, done && local.taskRowDone]}>
                        <Pressable onPress={() => toggleTask(task.id)} style={[local.taskCheck, done && local.taskCheckDone]}>
                          {done ? <Check color={panel} size={13} strokeWidth={3} /> : null}
                        </Pressable>
                        <View style={local.flexText}>
                          <Text style={[local.taskTitle, done && local.doneText]}>{task.title}</Text>
                          {task.description ? <Text style={local.taskDescription}>{task.description}</Text> : null}
                          {task.cost ? <Text style={local.costText}>{task.cost}</Text> : null}
                          {task.plannedDate ? <Text style={local.taskDescription}>В планнере: {formatProjectTaskSchedule(task)}</Text> : null}
                        </View>
                        <View style={local.taskActions}>
                          <Pressable onPress={() => openTaskModal(task)} style={local.iconButton}>
                            <Pencil color={muted} size={15} />
                          </Pressable>
                          <Pressable onPress={() => setDeleteTaskId(task.id)} style={local.iconButton}>
                            <Trash2 color={muted} size={15} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  }) : (
                    <Text style={local.meta}>В проекте пока нет задач.</Text>
                  )}
                </View>
              </>
            ) : (
              <View style={local.mainEmptyState}>
                <Text style={local.emptyTitle}>Выбери проект справа</Text>
                <Text style={local.meta}>Или создай новый проект кнопкой в правой колонке.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <ProjectModal
        draft={projectDraft}
        onChange={setProjectDraft}
        onClose={() => setProjectModalOpen(false)}
        onSave={addProject}
        visible={projectModalOpen}
      />
      <TaskModal
        draft={taskDraft}
        editing={Boolean(editingTask)}
        onChange={setTaskDraft}
        onClose={() => setTaskModalOpen(false)}
        onSave={saveTask}
        visible={taskModalOpen}
      />
      <ConfirmModal
        onCancel={() => setDeleteTaskId(null)}
        onConfirm={deleteTask}
        visible={Boolean(deleteTaskId)}
      />
    </View>
  );
}

function ProjectModal({ draft, onChange, onClose, onSave, visible }: {
  draft: ProjectDraft;
  onChange: (draft: ProjectDraft) => void;
  onClose: () => void;
  onSave: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={local.modalOverlay}>
        <View style={local.modalCard}>
          <ModalHeader onClose={onClose} title="Новый проект" />
          <TextInput
            onChangeText={(title) => onChange({ ...draft, title })}
            placeholder="Например, мой авто"
            placeholderTextColor={faint}
            style={local.input}
            value={draft.title}
          />
          <TextInput
            multiline
            onChangeText={(description) => onChange({ ...draft, description })}
            placeholder="Короткое описание"
            placeholderTextColor={faint}
            style={[local.input, local.textArea]}
            value={draft.description}
          />
          <Pressable disabled={!draft.title.trim()} onPress={onSave} style={[local.primaryButton, !draft.title.trim() && local.disabled]}>
            <Text style={local.primaryText}>Создать</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TaskModal({ draft, editing, onChange, onClose, onSave, visible }: {
  draft: TaskDraft;
  editing: boolean;
  onChange: (draft: TaskDraft) => void;
  onClose: () => void;
  onSave: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={local.modalOverlay}>
        <View style={local.modalCard}>
          <ModalHeader onClose={onClose} title={editing ? 'Редактировать задачу' : 'Новая задача'} />
          <TextInput
            onChangeText={(title) => onChange({ ...draft, title })}
            placeholder="Поменять лобовое стекло"
            placeholderTextColor={faint}
            style={local.input}
            value={draft.title}
          />
          <TextInput
            multiline
            onChangeText={(description) => onChange({ ...draft, description })}
            placeholder="Описание, детали, контакты"
            placeholderTextColor={faint}
            style={[local.input, local.textArea]}
            value={draft.description}
          />
          <TextInput
            onChangeText={(cost) => onChange({ ...draft, cost })}
            placeholder="Стоимость, например 25 000 ₽"
            placeholderTextColor={faint}
            style={local.input}
            value={draft.cost}
          />
          <View style={local.taskScheduleRow}>
            <TextInput
              onChangeText={(plannedDate) => onChange({ ...draft, plannedDate })}
              placeholder="Дата в планнере: 2026-08-10"
              placeholderTextColor={faint}
              style={[local.input, local.scheduleInput]}
              value={draft.plannedDate}
            />
            <TextInput
              onChangeText={(plannedTime) => onChange({ ...draft, plannedTime })}
              placeholder="Время"
              placeholderTextColor={faint}
              style={[local.input, local.timeInput]}
              value={draft.plannedTime}
            />
          </View>
          <Pressable disabled={!draft.title.trim()} onPress={onSave} style={[local.primaryButton, !draft.title.trim() && local.disabled]}>
            <Text style={local.primaryText}>{editing ? 'Сохранить' : 'Добавить'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ConfirmModal({ onCancel, onConfirm, visible }: { onCancel: () => void; onConfirm: () => void; visible: boolean }) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={local.modalOverlay}>
        <View style={local.confirmCard}>
          <Text style={local.modalTitle}>Удалить задачу?</Text>
          <Text style={local.meta}>Она исчезнет из проекта.</Text>
          <View style={local.confirmActions}>
            <Pressable onPress={onCancel} style={local.secondaryButton}><Text style={local.secondaryText}>Отмена</Text></Pressable>
            <Pressable onPress={onConfirm} style={local.dangerButton}><Text style={local.primaryText}>Удалить</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ModalHeader({ onClose, title }: { onClose: () => void; title: string }) {
  return (
    <View style={local.modalHeader}>
      <Text style={local.modalTitle}>{title}</Text>
      <Pressable onPress={onClose} style={local.closeButton}>
        <X color={muted} size={18} />
      </Pressable>
    </View>
  );
}

function formatProjectTaskSchedule(task: ProjectTask) {
  return task.plannedTime ? `${task.plannedDate}, ${task.plannedTime}` : `${task.plannedDate}, без времени`;
}

const local = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  scroll: { gap: 16, paddingBottom: 96 },
  desktopScroll: { paddingBottom: 36, width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', width: '100%' },
  addButton: { alignItems: 'center', backgroundColor: accent, borderRadius: 999, height: 44, justifyContent: 'center', width: 44 },
  desktopLayout: { alignItems: 'flex-start', flexDirection: 'row-reverse', gap: 24, width: '100%' },
  mobileLayout: { gap: 14 },
  projectColumn: { borderLeftColor: line, borderLeftWidth: 1, flexShrink: 0, gap: 10, paddingLeft: 20, width: 310 },
  taskColumn: { flex: 1, gap: 12, minWidth: 0 },
  rightHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 52 },
  rightTitle: { color: text, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  rightAddButton: { alignItems: 'center', backgroundColor: panelSoft, borderRadius: 7, height: 32, justifyContent: 'center', width: 32 },
  mainEmptyState: { gap: 8, justifyContent: 'center', minHeight: 220 },
  projectCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, gap: 9, padding: 14 },
  projectCardActive: { borderColor: accentBorder },
  projectTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  flexText: { flex: 1, gap: 3, minWidth: 0 },
  projectTitle: { color: text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  detailTitle: { color: text, fontSize: 22, fontWeight: '800', lineHeight: 28 },
  meta: { color: muted, fontSize: 12, lineHeight: 17 },
  percent: { color: text, fontSize: 18, lineHeight: 24 },
  progressTrack: { backgroundColor: '#252625', height: 2, width: '100%' },
  progressFill: { backgroundColor: accent, height: 2 },
  emptyState: { borderColor: line, borderRadius: 8, borderWidth: 1, gap: 10, padding: 16 },
  emptyTitle: { color: text, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  primaryButton: { alignItems: 'center', backgroundColor: accent, borderRadius: 8, justifyContent: 'center', minHeight: 44, paddingHorizontal: 16 },
  primaryText: { color: panel, fontSize: 13, fontWeight: '800' },
  detailHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', width: '100%' },
  ghostButton: { borderBottomColor: accent, borderBottomWidth: 1, minHeight: 30, paddingTop: 4 },
  ghostText: { color: accent, fontSize: 12, fontWeight: '700' },
  summaryRow: { alignItems: 'center', borderColor: line, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 14, padding: 14 },
  summaryValue: { color: text, fontSize: 30, lineHeight: 36 },
  inlineAdd: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 7, minHeight: 34 },
  inlineAddText: { color: accent, fontSize: 13, fontWeight: '700' },
  taskList: { borderColor: line, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  taskRow: { alignItems: 'flex-start', borderBottomColor: line, borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 54, padding: 12 },
  taskRowDone: { opacity: 0.66 },
  taskCheck: { alignItems: 'center', borderColor: muted, borderRadius: 5, borderWidth: 1, height: 20, justifyContent: 'center', marginTop: 1, width: 20 },
  taskCheckDone: { backgroundColor: accent, borderColor: accent },
  taskTitle: { color: text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  taskDescription: { color: muted, fontSize: 12, lineHeight: 17 },
  costText: { color: accent, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  doneText: { color: muted, textDecorationLine: 'line-through' },
  taskActions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  iconButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  modalOverlay: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.72)', flex: 1, justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, gap: 12, maxWidth: 430, padding: 16, width: '100%' },
  confirmCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, gap: 12, maxWidth: 360, padding: 16, width: '100%' },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  modalTitle: { color: text, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  closeButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  input: { borderColor: line, borderRadius: 7, borderWidth: 1, color: text, fontSize: 14, minHeight: 44, paddingHorizontal: 12 },
  taskScheduleRow: { flexDirection: 'row', gap: 8 },
  scheduleInput: { flex: 1 },
  timeInput: { width: 104 },
  textArea: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' },
  disabled: { opacity: 0.35 },
  confirmActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  secondaryButton: { alignItems: 'center', borderColor: line, borderRadius: 8, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 14 },
  secondaryText: { color: text, fontSize: 13, fontWeight: '700' },
  dangerButton: { alignItems: 'center', backgroundColor: '#ff4d4d', borderRadius: 8, justifyContent: 'center', minHeight: 40, paddingHorizontal: 14 },
});
