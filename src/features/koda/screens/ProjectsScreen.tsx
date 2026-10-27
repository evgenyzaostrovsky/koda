import { RightPanel, useRightPanel } from '../components/RightPanel';
import { Archive, Check, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SectionTitle } from '../components';
import { BentoCard, BentoGrid } from '../components/Bento';
import { accent, accentBorder, activeBg, activeText, faint, line, muted, panel, panelSoft, readingWidths, text } from '../theme';
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
  const archivedProjects = projects.filter(project => project.status === 'archived')
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  const { setOpen: setRightPanelOpen } = useRightPanel();
  const [detailOpen,setDetailOpen]=useState(false);
  const [projectListMode, setProjectListMode] = useState<'active' | 'archived'>('active');
  const [showAllProjects, setShowAllProjects] = useState(false);
  const displayedProjects = projectListMode === 'archived' ? archivedProjects : sortedProjects;
  const previewLimit = isDesktop ? 3 : 1;
  const previewProjects = showAllProjects ? displayedProjects : displayedProjects.slice(0, previewLimit);
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
    setDetailOpen(true);
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
    setDetailOpen(false);
    const now = new Date().toISOString();
    onProjectsChange((items) => items.map((project) => (project.id === projectId ? { ...project, status: 'archived', updatedAt: now } : project)));
    setSelectedProjectId((current) => (current === projectId ? null : current));
    setProjectListMode('archived');
    if (isDesktop) setRightPanelOpen(true);
  }

  function showArchive() {
    setDetailOpen(false);
    setProjectListMode('archived');
    if (isDesktop) setRightPanelOpen(true);
  }

  function restoreProject(projectId: string) {
    const now = new Date().toISOString();
    onProjectsChange(items => items.map(project => project.id === projectId && project.status === 'archived'
      ? { ...project, status: 'active', completedAt: null, updatedAt: now }
      : project));
    setSelectedProjectId(projectId);
    setProjectListMode('active');
  }

  return (
    <View style={local.screen}>
      <ScrollView contentContainerStyle={[local.scroll, isDesktop && local.desktopScroll, { alignSelf: 'center', flexGrow: 1, justifyContent: detailOpen?'flex-start':'center', maxWidth: 1040, width: '100%', paddingVertical:16,paddingBottom:16 }]} showsVerticalScrollIndicator={false}>
        <View style={local.header}>
          <SectionTitle title="Проекты" subtitle="Вещи, которые состоят из нескольких дел" />
          <View style={local.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Открыть архив проектов (${archivedProjects.length})`} onPress={showArchive} style={local.archiveButton}>
            <Archive color={accent} size={17} />
            <Text style={local.ghostText}>Архив · {archivedProjects.length}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Создать проект" onPress={openProjectModal} style={local.addButton}>
            <Plus color={activeText} size={19} strokeWidth={3} />
          </Pressable>
          </View>
        </View>

        {!detailOpen?<View style={{gap:14}}>
          <Text style={local.meta}>{sortedProjects.length} активных проектов · {sortedProjects.reduce((n,p)=>n+p.tasks.filter(t=>!t.deletedAt&&t.status!=='done').length,0)} задач впереди</Text>
          <View style={local.listTabs}><Pressable accessibilityRole="button" accessibilityState={{selected:projectListMode==='active'}} aria-pressed={projectListMode==='active'} onPress={()=>{setProjectListMode('active');setShowAllProjects(false)}} style={[local.listTab,projectListMode==='active'&&local.projectCardActive]}><Text style={local.ghostText}>Активные</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{selected:projectListMode==='archived'}} aria-pressed={projectListMode==='archived'} onPress={()=>{setProjectListMode('archived');setShowAllProjects(false)}} style={[local.listTab,projectListMode==='archived'&&local.projectCardActive]}><Text style={local.ghostText}>Архив</Text></Pressable></View>
          <BentoGrid columns={2} style={local.projectLibraryGrid}>{previewProjects.map((project,index)=>{const tasks=project.tasks.filter(task=>!task.deletedAt),done=tasks.filter(task=>task.status==='done').length,pending=tasks.filter(task=>task.status!=='done').sort((a,b)=>(a.plannedDate||'9999').localeCompare(b.plannedDate||'9999'));const nextTask=pending[0];return <BentoCard key={project.id} tone={index===0&&projectListMode==='active'?'soft':'light'} style={[local.projectLibraryCard,previewProjects.length===1&&isDesktop&&local.singleProjectCard]}><Text style={local.projectTitle}>{project.title}</Text>{project.description&&<Text numberOfLines={2} style={local.meta}>{project.description}</Text>}{tasks.length?<><View style={local.progressTrack}><View style={[local.progressFill,{width:`${done/tasks.length*100}%`}]}/></View><Text style={local.meta}>{done} из {tasks.length} задач закрыто</Text></>:<Text style={local.meta}>Задачи пока не добавлены.</Text>}{projectListMode==='active'&&nextTask?<View style={local.projectNextTask}><Text style={local.meta}>Следующее действие</Text><Text style={local.nextTaskTitle}>{nextTask.title}</Text>{nextTask.plannedDate?<Text style={local.meta}>{nextTask.plannedDate}{nextTask.plannedTime?` · ${nextTask.plannedTime}`:''}</Text>:null}</View>:null}<Pressable accessibilityRole="button" accessibilityLabel={projectListMode==='archived'?`Вернуть проект «${project.title}»`:`Открыть проект «${project.title}»`} onPress={()=>{if(projectListMode==='archived')restoreProject(project.id);else{setSelectedProjectId(project.id);setDetailOpen(true)}}} style={local.inlineAdd}><Text style={local.inlineAddText}>{projectListMode==='archived'?'Вернуть в активные':'Открыть проект'}</Text></Pressable></BentoCard>})}</BentoGrid>
          {displayedProjects.length>previewLimit?<Pressable accessibilityRole="button" accessibilityState={{expanded:showAllProjects}} aria-expanded={showAllProjects} onPress={()=>setShowAllProjects(value=>!value)} style={local.showAllButton}><Text style={local.showAllText}>{showAllProjects?'Свернуть список':`Все ${projectListMode==='archived'?'архивные':'активные'} проекты · ${displayedProjects.length}`}</Text></Pressable>:null}
          {displayedProjects.length===0&&<BentoCard><Text style={local.meta}>{projectListMode==='archived'?'Архив пока пуст.':'Пока нет активных проектов. Начни с одного понятного результата.'}</Text></BentoCard>}
        </View>:<View><Pressable accessibilityRole="button" accessibilityLabel="К списку проектов" onPress={()=>setDetailOpen(false)} style={local.inlineAdd}><Text style={local.inlineAddText}>Все проекты</Text></Pressable>
        <View style={isDesktop ? local.desktopLayout : local.mobileLayout} testID={isDesktop ? 'desktop-page-columns' : undefined}>
          <RightPanel enabled={isDesktop}><View style={[isDesktop ? local.projectColumn : undefined, !isDesktop && { display: 'none' }]} testID={isDesktop ? 'desktop-right-column' : undefined}>
            {isDesktop ? (
              <View style={local.rightHeader}>
                <View>
                  <Text style={local.rightTitle}>Проекты</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Создать проект" onPress={openProjectModal} style={local.rightAddButton}><Plus color={accent} size={18} strokeWidth={3} /></Pressable>
              </View>
            ) : null}
            <View style={local.listTabs}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: projectListMode === 'active' }} onPress={() => setProjectListMode('active')} style={[local.listTab, projectListMode === 'active' && local.projectCardActive]}>
                <Text style={local.ghostText}>Активные · {sortedProjects.length}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: projectListMode === 'archived' }} onPress={() => setProjectListMode('archived')} style={[local.listTab, projectListMode === 'archived' && local.projectCardActive]}>
                <Text style={local.ghostText}>Архив · {archivedProjects.length}</Text>
              </Pressable>
            </View>
            {projectListMode === 'archived' ? (
              <View style={local.archiveList}>
                {archivedProjects.length ? archivedProjects.map(project => (
                  <BentoCard key={project.id} tone="light" style={local.projectCard}>
                    <Text style={local.projectTitle}>{project.title}</Text>
                    {project.description ? <Text numberOfLines={2} style={local.meta}>{project.description}</Text> : null}
                    <Text style={local.meta}>Задач: {project.tasks.filter(task => !task.deletedAt).length}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Вернуть проект «${project.title}»`} onPress={() => restoreProject(project.id)} style={local.archiveButton}>
                      <RotateCcw color={accent} size={16} />
                      <Text style={local.ghostText}>Вернуть в активные</Text>
                    </Pressable>
                  </BentoCard>
                )) : <Text style={local.meta}>Архивных проектов пока нет.</Text>}
              </View>
            ) : sortedProjects.length ? (
              sortedProjects.map((project) => {
                const active = selectedProject?.id === project.id;
                const visibleTasks = project.tasks.filter((task) => !task.deletedAt);
                const done = visibleTasks.filter((task) => task.status === 'done').length;
                const projectProgress = visibleTasks.length ? Math.round((done / visibleTasks.length) * 100) : 0;

                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Открыть проект: ${project.title}`}
                    accessibilityState={{ selected: active }}
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
          </View></RightPanel>

          <View style={isDesktop ? local.taskColumn : undefined} testID={isDesktop ? 'desktop-main-column' : undefined}>
            {selectedProject ? (
              <>
                <View style={local.detailHeader}>
                  <View style={local.flexText}>
                    <Text style={local.detailTitle}>{selectedProject.title}</Text>
                    {selectedProject.description ? <Text style={local.meta}>{selectedProject.description}</Text> : null}
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Архивировать проект «${selectedProject.title}»`} onPress={() => archiveProject(selectedProject.id)} style={local.ghostButton}>
                    <Text style={local.ghostText}>Архив</Text>
                  </Pressable>
                </View>

                <BentoCard tone="soft" style={local.projectProgressCard}>
                  <View style={local.projectProgressTop}><Text style={local.projectProgressTitle}>Ход проекта</Text><Text style={local.projectProgressValue}>{progress}%</Text></View>
                  <View style={local.progressTrack}><View style={[local.progressFill, { width: `${progress}%` }]} /></View>
                  <Text style={local.meta}>{doneTasks} из {totalTasks} задач закрыто · {Math.max(0, totalTasks - doneTasks)} впереди</Text>
                </BentoCard>

                <Pressable accessibilityRole="button" accessibilityLabel="Добавить задачу" onPress={() => openTaskModal()} style={local.inlineAdd}>
                  <Plus color={accent} size={15} />
                  <Text style={local.inlineAddText}>Добавить задачу</Text>
                </Pressable>

                {activeTasks.length ? (
                  <View style={local.taskGroups}>
                    {(['todo', 'done'] as const).map((status) => {
                      const tasks = activeTasks.filter((task) => task.status === status);
                      if (!tasks.length) return null;
                      return <View key={status} style={local.taskGroup}>
                        <View style={local.taskGroupHeader}><Text style={local.taskGroupTitle}>{status === 'todo' ? 'Впереди' : 'Готово'}</Text><Text style={local.taskGroupCount}>{tasks.length}</Text></View>
                        <BentoCard tone="light" style={[local.taskList, { padding: 0 }]}>{tasks.map((task) => {
                          const done = task.status === 'done';
                          return (
                            <View key={task.id} style={[local.taskRow, done && local.taskRowDone]}>
                              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(done) }} aria-checked={Boolean(done)} accessibilityLabel={`Отметить «${task.title}» ${done ? 'незавершённой' : 'готовой'}`} onPress={() => toggleTask(task.id)} style={local.taskCheckHitArea}><View style={[local.taskCheck, done && local.taskCheckDone]}>{done ? <Check color={activeText} size={13} strokeWidth={3} /> : null}</View></Pressable>
                              <View style={local.flexText}>
                                <Text style={[local.taskTitle, done && local.doneText]}>{task.title}</Text>
                                {task.description ? <Text style={local.taskDescription}>{task.description}</Text> : null}
                                {task.cost ? <Text style={local.costText}>{task.cost}</Text> : null}
                                {task.plannedDate ? <Text style={local.taskDescription}>В планнере: {formatProjectTaskSchedule(task)}</Text> : null}
                              </View>
                              <View style={local.taskActions}>
                                <Pressable accessibilityRole="button" accessibilityLabel={`Изменить задачу «${task.title}»`} onPress={() => openTaskModal(task)} style={local.iconButton}><Pencil color={muted} size={15} /></Pressable>
                                <Pressable accessibilityRole="button" accessibilityLabel={`Удалить задачу «${task.title}»`} onPress={() => setDeleteTaskId(task.id)} style={local.iconButton}><Trash2 color={muted} size={15} /></Pressable>
                              </View>
                            </View>
                          );
                        })}</BentoCard>
                      </View>;
                    })}
                  </View>
                ) : <View style={local.projectEmptyTasks}><Text style={local.projectEmptyTitle}>Начни с первого шага</Text><Text style={local.meta}>Добавь задачи, чтобы видеть движение проекта.</Text><Pressable accessibilityRole="button" accessibilityLabel="Добавить первую задачу" onPress={() => openTaskModal()} style={local.inlineAdd}><Plus color={accent} size={15} /><Text style={local.inlineAddText}>Добавить первую задачу</Text></Pressable></View>}
              </>
            ) : (
              <View style={local.mainEmptyState}>
                <Text style={local.emptyTitle}>Пока нет активных проектов</Text>
                <Text style={local.meta}>Создайте проект и соберите связанные задачи в одном месте.</Text>
                <Pressable accessibilityRole="button" onPress={openProjectModal} style={local.primaryButton}>
                  <Text style={local.primaryText}>Новый проект</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View></View>}
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
            accessibilityLabel="Название проекта"
            onChangeText={(title) => onChange({ ...draft, title })}
            placeholder="Например, мой авто"
            placeholderTextColor={faint}
            style={local.input}
            value={draft.title}
          />
          <TextInput
            accessibilityLabel="Описание проекта"
            multiline
            onChangeText={(description) => onChange({ ...draft, description })}
            placeholder="Короткое описание"
            placeholderTextColor={faint}
            style={[local.input, local.textArea]}
            value={draft.description}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Создать проект" disabled={!draft.title.trim()} onPress={onSave} style={[local.primaryButton, !draft.title.trim() && local.disabled]}>
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
            accessibilityLabel="Название задачи"
            onChangeText={(title) => onChange({ ...draft, title })}
            placeholder="Поменять лобовое стекло"
            placeholderTextColor={faint}
            style={local.input}
            value={draft.title}
          />
          <TextInput
            accessibilityLabel="Описание задачи"
            multiline
            onChangeText={(description) => onChange({ ...draft, description })}
            placeholder="Описание, детали, контакты"
            placeholderTextColor={faint}
            style={[local.input, local.textArea]}
            value={draft.description}
          />
          <TextInput
            accessibilityLabel="Стоимость задачи"
            onChangeText={(cost) => onChange({ ...draft, cost })}
            placeholder="Стоимость, например 25 000 ₽"
            placeholderTextColor={faint}
            style={local.input}
            value={draft.cost}
          />
          <View style={local.taskScheduleRow}>
            <TextInput
              accessibilityLabel="Дата задачи в планнере"
              onChangeText={(plannedDate) => onChange({ ...draft, plannedDate })}
              placeholder="Дата в планнере: 2026-08-10"
              placeholderTextColor={faint}
              style={[local.input, local.scheduleInput]}
              value={draft.plannedDate}
            />
            <TextInput
              accessibilityLabel="Время задачи"
              onChangeText={(plannedTime) => onChange({ ...draft, plannedTime })}
              placeholder="Время"
              placeholderTextColor={faint}
              style={[local.input, local.timeInput]}
              value={draft.plannedTime}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={editing ? 'Сохранить задачу' : 'Добавить задачу'} disabled={!draft.title.trim()} onPress={onSave} style={[local.primaryButton, !draft.title.trim() && local.disabled]}>
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
            <Pressable accessibilityRole="button" onPress={onCancel} style={local.secondaryButton}><Text style={local.secondaryText}>Отмена</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={onConfirm} style={local.dangerButton}><Text style={local.primaryText}>Удалить</Text></Pressable>
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
      <Pressable accessibilityRole="button" accessibilityLabel={`Закрыть окно: ${title}`} onPress={onClose} style={local.closeButton}>
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
  desktopScroll: { alignSelf: 'center', maxWidth: readingWidths.projects, paddingBottom: 36, width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', width: '100%' },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  archiveButton: { alignItems: 'center', flexDirection: 'row', gap: 7, borderColor: line, borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12 },
  listTabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  listTab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderColor: line, borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 6 },
  archiveList: { gap: 10 },
  addButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 999, height: 46, justifyContent: 'center', width: 46 },
  desktopLayout: { alignItems: 'flex-start', alignSelf: 'center', flexDirection: 'row-reverse', gap: 24, maxWidth: readingWidths.projects, width: '100%' },
  mobileLayout: { gap: 14 },
  projectLibraryGrid: { alignItems: 'flex-start' },
  showAllButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  showAllText: { color: accent, fontSize: 13, fontWeight: '700' },
  projectLibraryCard: { alignSelf: 'flex-start', gap: 7, maxWidth: '100%', padding: 16, width: '100%' },
  singleProjectCard: { maxWidth: 520 },
  projectNextTask: { borderTopColor: line, borderTopWidth: 1, gap: 3, marginTop: 2, paddingTop: 8 },
  nextTaskTitle: { color: text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  projectColumn: { borderLeftColor: line, borderLeftWidth: 1, flexShrink: 0, gap: 10, paddingLeft: 20, width: 282 },
  taskColumn: { flex: 1, gap: 12, minWidth: 0 },
  rightHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 52 },
  rightTitle: { color: text, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  rightAddButton: { alignItems: 'center', backgroundColor: panelSoft, borderRadius: 12, height: 44, justifyContent: 'center', width: 44 },
  mainEmptyState: { gap: 8, justifyContent: 'center', minHeight: 220 },
  projectCard: { backgroundColor: panel, borderColor: line, borderRadius: 22, borderWidth: 1, gap: 8, padding: 14 },
  projectCardActive: { backgroundColor: activeBg, borderColor: activeBg },
  projectTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  flexText: { flex: 1, gap: 3, minWidth: 0 },
  projectTitle: { color: text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  detailTitle: { color: text, fontSize: 22, fontWeight: '800', lineHeight: 28 },
  meta: { color: muted, fontSize: 12, lineHeight: 17 },
  percent: { color: text, fontSize: 18, lineHeight: 24 },
  progressTrack: { backgroundColor: line, borderRadius: 999, height: 6, width: '100%' },
  progressFill: { backgroundColor: accent, borderRadius: 999, height: 6 },
  emptyState: { borderColor: line, borderRadius: 12, borderWidth: 1, gap: 10, padding: 16 },
  emptyTitle: { color: text, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  primaryButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  primaryText: { color: activeText, fontSize: 13, fontWeight: '800' },
  detailHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', width: '100%' },
  ghostButton: { borderBottomColor: accent, borderBottomWidth: 1, minHeight: 44, justifyContent: 'center' },
  ghostText: { color: accent, fontSize: 12, fontWeight: '700' },
  summaryRow: { alignItems: 'center', borderColor: line, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 14, padding: 14 },
  summaryValue: { color: text, fontSize: 30, lineHeight: 36 },
  inlineAdd: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 7, minHeight: 44 },
  inlineAddText: { color: accent, fontSize: 13, fontWeight: '700' },
  projectProgressCard: { backgroundColor: panel, borderColor: line, borderRadius: 22, borderWidth: 1, gap: 8, padding: 14 },
  projectProgressTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  projectProgressTitle: { color: text, fontSize: 15, fontWeight: '700' },
  projectProgressValue: { color: text, fontSize: 21, fontWeight: '700' },
  taskGroups: { gap: 14 },
  taskGroup: { gap: 9 },
  taskGroupHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  taskGroupTitle: { color: text, fontSize: 16, fontWeight: '700' },
  taskGroupCount: { backgroundColor: panelSoft, borderRadius: 99, color: muted, fontSize: 12, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  projectEmptyTasks: { alignItems: 'flex-start', backgroundColor: panel, borderColor: line, borderRadius: 22, borderWidth: 1, gap: 8, padding: 18 },
  projectEmptyTitle: { color: text, fontSize: 17, fontWeight: '700' },
  taskList: { backgroundColor: panel, borderColor: line, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  taskRow: { alignItems: 'flex-start', borderBottomColor: line, borderBottomWidth: 1, flexDirection: 'row', gap: 8, minHeight: 54, paddingHorizontal: 8, paddingVertical: 8 },
  taskRowDone: { opacity: 0.66 },
  taskCheckHitArea: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  taskCheck: { alignItems: 'center', borderColor: muted, borderRadius: 5, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  taskCheckDone: { backgroundColor: activeBg, borderColor: activeBg },
  taskTitle: { color: text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  taskDescription: { color: muted, fontSize: 12, lineHeight: 17 },
  costText: { color: accent, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  doneText: { color: muted, textDecorationLine: 'line-through' },
  taskActions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  iconButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  modalOverlay: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.72)', flex: 1, justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 12, borderWidth: 1, gap: 12, maxWidth: 430, padding: 16, width: '100%' },
  confirmCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 12, borderWidth: 1, gap: 12, maxWidth: 360, padding: 16, width: '100%' },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  modalTitle: { color: text, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  closeButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  input: { borderColor: line, borderRadius: 12, borderWidth: 1, color: text, fontSize: 14, minHeight: 44, paddingHorizontal: 12 },
  taskScheduleRow: { flexDirection: 'row', gap: 8 },
  scheduleInput: { flex: 1 },
  timeInput: { width: 104 },
  textArea: { minHeight: 86, paddingTop: 12, textAlignVertical: 'top' },
  disabled: { opacity: 0.35 },
  confirmActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  secondaryButton: { alignItems: 'center', borderColor: line, borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  secondaryText: { color: text, fontSize: 13, fontWeight: '700' },
  dangerButton: { alignItems: 'center', backgroundColor: '#ff4d4d', borderRadius: 12, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
});
