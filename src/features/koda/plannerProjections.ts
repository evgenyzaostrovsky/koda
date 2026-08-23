import type { PlannerItem, Project } from './types';

export function buildProjectPlannerItems(projects: Project[]): PlannerItem[] {
  return projects
    .filter((project) => project.status !== 'archived')
    .flatMap((project) =>
      project.tasks
        .filter((task) => !task.deletedAt && task.plannedDate)
        .map((task) => ({
          id: projectPlannerItemId(project.id, task.id),
          date: task.plannedDate,
          time: task.plannedTime,
          title: task.title,
          done: task.status === 'done',
          subtasks: [],
          sourceType: 'project' as const,
          sourceId: task.id,
          ownerId: project.id,
          updatedAt: task.updatedAt,
          deletedAt: task.deletedAt,
        })),
    );
}

export function isProjectedPlannerItem(item: PlannerItem) {
  return Boolean(item.sourceType && item.sourceType !== 'planner');
}

function projectPlannerItemId(projectId: string, taskId: string) {
  return `project:${projectId}:${taskId}`;
}
