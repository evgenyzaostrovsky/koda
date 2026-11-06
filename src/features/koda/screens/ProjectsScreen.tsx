import { changedDraftFields } from '../entitySync';
import { RightPanel, useRightPanel } from '../components/RightPanel';
import { ArrowLeft, Check, ChevronRight, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
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
  onOpenWorkspace,
  projects,
}: {
  isDesktop?: boolean;
  onProjectsChange: ProjectsChange;
  onOpenWorkspace?: () => void;
  projects: Project[];
}) {
  const sortedProjects = useMemo(() => projects.filter(project => project.status !== 'archived')
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)), [projects]);
  const archivedProjects = useMemo(() => projects.filter(project => project.status === 'archived')
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)), [projects]);
  const { setOpen: setRightPanelOpen } = useRightPanel();
  const [detailOpen,setDetailOpen]=useState(false);
  const [projectListMode, setProjectListMode] = useState<'active' | 'archived'>('active');
  const [showAllProjects, setShowAllProjects] = useState(false);
  const displayedProjects = projectListMode === 'archived' ? archivedProjects : sortedProjects;
  const previewLimit = 3;
  const previewProjects = showAllProjects ? displayedProjects : displayedProjects.slice(0, previewLimit);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(sortedProjects[0]?.id ?? null);
  const selectedProject = sortedProjects.find((project) => project.id === selectedProjectId) ?? sortedProjects[0] ?? null;
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const visibleSelectedTasks = useMemo(
    () => selectedProject?.tasks.filter((task) => !task.deletedAt) ?? [],
    [selectedProject?.tasks],
  );
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
        const currentTask = editingTask ? project.tasks.find(task => task.id === editingTask.id) : undefined;
        if (editingTask && (!currentTask || currentTask.deletedAt)) return project;
        const fields = { title, description: taskDraft.description.trim(), cost: taskDraft.cost.trim(), plannedDate: taskDraft.plannedDate.trim(), plannedTime: taskDraft.plannedTime.trim() };
        const edited = editingTask && currentTask ? { ...currentTask, ...changedDraftFields(editingTask, fields) } : fields;
        const nextTask: ProjectTask = {
          ...currentTask,
          id: editingTask?.id ?? uid('project-task'),
          ...edited,
          status: currentTask?.status ?? 'todo',
          createdAt: currentTask?.createdAt ?? now,
          updatedAt: now,
          completedAt: currentTask?.completedAt ?? null,
          deletedAt: currentTask?.deletedAt ?? null,
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
      <ScrollView contentContainerStyle={[local.scroll, isDesktop && local.desktopScroll, { alignSelf: 'center', flexGrow: 1, justifyContent: detailOpen?'flex-start':'center', maxWidth: 1100, width: '100%', paddingVertical:16,paddingBottom:16 }]} showsVerticalScrollIndicator={false}>
        {onOpenWorkspace ? <Pressable accessibilityRole="button" onPress={onOpenWorkspace} style={local.workspaceBack}><ArrowLeft size={16} color={muted} /><Text style={local.workspaceBackText}>Рабочий стол</Text></Pressable> : null}
        <View style={local.header}>
          <SectionTitle title="Проекты" subtitle="Вещи, которые состоят из нескольких дел" />
          <View style={local.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Создать проект" onPress={openProjectModal} style={local.addButton}>
            <Plus color={activeText} size={19} strokeWidth={3} />
          </Pressable>
          </View>
        </View>

        {!detailOpen?<View style={{gap:14}}>
          <Text style={local.meta}>{projectListMode === 'active' ? `${sortedProjects.length} активных проектов · ${sortedProjects.reduce((n,p)=>n+p.tasks.filter(t=>!t.deletedAt&&t.status!=='done').length,0)} задач впереди` : `${archivedProjects.length} архивных проектов`}</Text>
          <View style={local.listTabs}><Pressable accessibilityRole="button" accessibilityState={{selected:projectListMode==='active'}} aria-pressed={projectListMode==='active'} onPress={()=>{setProjectListMode('active');setShowAllProjects(false)}} style={[local.listTab,projectListMode==='active'&&local.projectCardActive]}><Text style={[local.ghostText,projectListMode==='active'&&local.projectTabSelectedText]}>Активные</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{selected:projectListMode==='archived'}} aria-pressed={projectListMode==='archived'} onPress={()=>{setProjectListMode('archived');setShowAllProjects(false)}} style={[local.listTab,projectListMode==='archived'&&local.projectCardActive]}><Text style={[local.ghostText,projectListMode==='archived'&&local.projectTabSelectedText]}>Архив · {archivedProjects.length}</Text></Pressable></View>
          {projectListMode === 'active' ? <ActiveProjectsOverview
            projects={previewProjects}
            totalCount={sortedProjects.length}
            onCreate={openProjectModal}
            onOpen={(project) => { setSelectedProjectId(project.id); setDetailOpen(true); }}
          /> : <BentoGrid columns={2} style={local.projectLibraryGrid}>{previewProjects.map((project) => {const tasks=project.tasks.filter(task=>!task.deletedAt),done=tasks.filter(task=>task.status==='done').length;return <BentoCard key={project.id} tone="light" style={local.projectLibraryCard}><Text style={local.projectTitle}>{project.title}</Text>{project.description&&<Text numberOfLines={2} style={local.meta}>{project.description}</Text>}{tasks.length?<><View style={local.progressTrack}><View style={[local.progressFill,{width:`${done/tasks.length*100}%`}]}/></View><Text style={local.meta}>{done} из {tasks.length} задач закрыто</Text></>:<Text style={local.meta}>Задачи пока не добавлены.</Text>}<Pressable accessibilityRole="button" accessibilityLabel={`Вернуть проект «${project.title}»`} onPress={()=>restoreProject(project.id)} style={local.inlineAdd}><Text style={local.inlineAddText}>Вернуть в активные</Text></Pressable></BentoCard>})}</BentoGrid>}
          {displayedProjects.length>previewLimit?<Pressable accessibilityRole="button" accessibilityState={{expanded:showAllProjects}} aria-expanded={showAllProjects} onPress={()=>setShowAllProjects(value=>!value)} style={local.showAllButton}><Text style={local.showAllText}>{showAllProjects?'Свернуть список':`Все ${projectListMode==='archived'?'архивные':'активные'} проекты · ${displayedProjects.length}`}</Text></Pressable>:null}
          {projectListMode === 'archived' && displayedProjects.length === 0 && <BentoCard><Text style={local.meta}>Архив пока пуст.</Text></BentoCard>}
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

function ActiveProjectsOverview({ projects, totalCount, onCreate, onOpen }: { projects: Project[]; totalCount: number; onCreate: () => void; onOpen: (project: Project) => void }) {
  const compact = useWindowDimensions().width < 760;
  const [featured, ...others] = projects;
  if (!featured) return <BentoCard style={local.projectEmptyOverview}>
    <Text style={local.projectTitle}>Пока нет активных проектов</Text>
    <Text style={local.meta}>Собери связанные дела в одном месте и выбери ближайший следующий шаг.</Text>
    <Pressable accessibilityRole="button" onPress={onCreate} style={local.inlineAdd}><Plus size={16} color={accent} /><Text style={local.inlineAddText}>Создать проект</Text></Pressable>
  </BentoCard>;
  const tasks = featured.tasks.filter((task) => !task.deletedAt);
  const doneTasks = tasks.filter((task) => task.status === 'done');
  const pendingTasks = tasks.filter((task) => task.status !== 'done').sort((a, b) => (a.plannedDate || '9999').localeCompare(b.plannedDate || '9999') || (a.plannedTime || '99:99').localeCompare(b.plannedTime || '99:99'));
  const nextTask = pendingTasks[0];
  const completion = tasks.length ? Math.round(doneTasks.length / tasks.length * 100) : 0;
  return <View style={[local.activeOverview, compact && local.activeOverviewCompact]}>
    <BentoCard tone="lime" style={[local.featuredProjectCard, compact && local.featuredProjectCardCompact]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Открыть проект «${featured.title}»`} onPress={() => onOpen(featured)} style={[local.featuredProjectPress, compact && local.featuredProjectPressCompact]}>
        <View style={local.featuredProjectContent}>
          <Text style={local.featuredProjectLabel}>В ФОКУСЕ · {doneTasks.length} ИЗ {tasks.length} ЗАДАЧ</Text>
          <Text style={local.featuredProjectTitle}>{featured.title}</Text>
          {featured.description ? <Text numberOfLines={2} style={local.featuredProjectMeta}>{featured.description}</Text> : null}
          {tasks.length ? <><View style={local.featuredProgressTrack}><View style={[local.featuredProgressFill, { width: `${completion}%` }]} /></View><Text style={local.featuredProjectLabel}>{completion}% · закрыто {doneTasks.length} из {tasks.length} задач</Text></> : <Text style={local.featuredProjectMeta}>Задачи пока не добавлены.</Text>}
          {doneTasks[0] || nextTask ? <View style={local.featuredTaskList}>
            {doneTasks[0] ? <View style={local.featuredTaskRow}><View style={[local.featuredTaskMark, local.featuredTaskMarkDone]}><Check size={12} color={activeText} /></View><View style={local.featuredTaskCopy}><Text numberOfLines={1} style={local.featuredTaskTitle}>{doneTasks[0].title}</Text><Text style={local.featuredProjectMeta}>Задача завершена</Text></View></View> : null}
            {nextTask ? <View style={local.featuredTaskRow}><View style={local.featuredTaskMark} /><View style={local.featuredTaskCopy}><Text numberOfLines={1} style={local.featuredTaskTitle}>{nextTask.title}</Text><Text style={local.featuredProjectMeta}>{nextTask.plannedDate ? `${nextTask.plannedDate}${nextTask.plannedTime ? ` · ${nextTask.plannedTime}` : ''}` : 'Ближайшее дело · срок не задан'}</Text></View></View> : null}
          </View> : null}
        </View>
        <View style={local.featuredProjectOpen}><Text style={local.featuredProjectOpenText}>Открыть проект и все задачи</Text><ChevronRight size={17} color={activeText} /></View>
      </Pressable>
    </BentoCard>
    <View style={[local.otherProjects, compact && local.otherProjectsCompact]}>
      {others.map((project) => {
        const projectTasks = project.tasks.filter((task) => !task.deletedAt);
        const completed = projectTasks.filter((task) => task.status === 'done').length;
        const next = projectTasks.filter((task) => task.status !== 'done').sort((a, b) => (a.plannedDate || '9999').localeCompare(b.plannedDate || '9999'))[0];
        const percent = projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0;
        return <BentoCard key={project.id} tone="light" style={[local.otherProjectCard, compact && local.otherProjectCardCompact]}>
          <Text style={local.otherProjectLabel}>ПРОЕКТ · {completed}/{projectTasks.length} ДЕЛ</Text>
          <Text numberOfLines={1} style={local.projectTitle}>{project.title}</Text>
          <Text numberOfLines={1} style={local.meta}>{next ? `Ближайшее · ${next.title}` : projectTasks.length ? 'Все дела завершены' : 'Дела пока не добавлены'}</Text>
          <View style={local.projectProgressTrack}><View style={[local.progressFill, { width: `${percent}%` }]} /></View>
          <Text style={local.meta}>{percent}% готово</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Открыть проект «${project.title}»`} onPress={() => onOpen(project)} style={local.inlineAdd}><Text style={local.inlineAddText}>Открыть проект</Text></Pressable>
        </BentoCard>;
      })}
      {totalCount > projects.length ? null : <BentoCard tone="light" style={[local.createProjectCard, compact && local.createProjectCardCompact]}>
        <Text style={local.otherProjectLabel}>ЕСТЬ НОВАЯ ИДЕЯ?</Text><Text style={local.projectTitle}>Добавить проект</Text><Text style={local.meta}>Создать новый список связанных дел</Text>
        <Pressable accessibilityRole="button" onPress={onCreate} style={local.inlineAdd}><Plus size={16} color={accent} /><Text style={local.inlineAddText}>Создать проект</Text></Pressable>
      </BentoCard>}
    </View>
  </View>;
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
  scroll: { gap: 12, paddingBottom: 96 },
  desktopScroll: { alignSelf: 'center', maxWidth: 1100, paddingBottom: 36, width: '100%' },
  workspaceBack: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 6, minHeight: 36, paddingHorizontal: 4 },
  workspaceBackText: { color: muted, fontSize: 13, fontWeight: '600' },
  header: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', width: '100%' },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  archiveButton: { alignItems: 'center', flexDirection: 'row', gap: 7, borderColor: line, borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12 },
  listTabs: { alignSelf: 'flex-start', flexDirection: 'row', gap: 8, marginBottom: 10 },
  listTab: { alignItems: 'center', justifyContent: 'center', borderColor: line, borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 14 },
  archiveList: { gap: 10 },
  addButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 999, height: 46, justifyContent: 'center', width: 46 },
  desktopLayout: { alignItems: 'flex-start', alignSelf: 'center', flexDirection: 'row-reverse', gap: 24, maxWidth: readingWidths.projects, width: '100%' },
  mobileLayout: { gap: 14 },
  projectLibraryGrid: { alignItems: 'flex-start' },
  activeOverview: { alignItems: 'stretch', flexDirection: 'row', gap: 14, width: '100%' },
  activeOverviewCompact: { flexDirection: 'column' },
  featuredProjectCard: { flex: 0.92, minHeight: 360, minWidth: 0, padding: 22 },
  featuredProjectCardCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minHeight: 0 },
  featuredProjectPress: { flex: 1, gap: 14, justifyContent: 'space-between' },
  featuredProjectPressCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', justifyContent: 'flex-start' },
  featuredProjectContent: { gap: 8 },
  featuredProjectLabel: { color: '#435b31', fontSize: 11, fontWeight: '700', letterSpacing: 0.4, lineHeight: 15 },
  featuredProjectMeta: { color: '#435b31', fontSize: 12, lineHeight: 17 },
  featuredProjectTitle: { color: activeText, fontSize: 25, fontWeight: '600', lineHeight: 31 },
  featuredProgressTrack: { backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 999, height: 8, marginTop: 6, overflow: 'hidden' },
  featuredProgressFill: { backgroundColor: '#435b31', borderRadius: 999, height: 8 },
  featuredTaskList: { gap: 0, marginTop: 4 },
  featuredTaskRow: { alignItems: 'flex-start', borderTopColor: 'rgba(70,90,42,0.24)', borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 10 },
  featuredTaskMark: { alignItems: 'center', backgroundColor: panel, borderColor: accentBorder, borderRadius: 6, borderWidth: 1, height: 19, justifyContent: 'center', marginTop: 1, width: 19 },
  featuredTaskMarkDone: { backgroundColor: accent, borderColor: accent },
  featuredTaskCopy: { flex: 1, gap: 2, minWidth: 0 },
  featuredTaskTitle: { color: activeText, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  featuredProjectOpen: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.58)', borderRadius: 15, flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 13 },
  featuredProjectOpenText: { color: activeText, fontSize: 12, fontWeight: '700' },
  otherProjects: { flex: 1.08, flexDirection: 'row', flexWrap: 'wrap', gap: 12, minWidth: 0 },
  otherProjectsCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', flexDirection: 'column', width: '100%' },
  otherProjectCard: { flexBasis: '47%', flexGrow: 1, gap: 7, minHeight: 180, minWidth: 0, padding: 17 },
  otherProjectCardCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%' },
  otherProjectLabel: { color: muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.35, lineHeight: 15 },
  projectProgressTrack: { backgroundColor: line, borderRadius: 999, height: 6, overflow: 'hidden', width: '100%' },
  createProjectCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 22, borderStyle: 'dashed', borderWidth: 1, gap: 8, justifyContent: 'center', minHeight: 180, padding: 17 },
  createProjectCardCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%' },
  projectEmptyOverview: { alignItems: 'flex-start', gap: 9, maxWidth: 600, padding: 20 },
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
  projectTabSelectedText: { color: activeText },
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
