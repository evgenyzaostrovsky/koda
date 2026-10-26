import type { Habit, PlannerItem, Project } from './types';
import { habitDoneOn, habitIsDue } from './habitModel';

export function buildHabitPlannerItems(habits: Habit[], date: string): PlannerItem[] {
  return habits.filter(habit => habitIsDue(habit, date)).map(habit => ({ id: `habit:${habit.id}:${date}`, date, time: '', title: habit.title,
    done: habitDoneOn(habit, date), sourceType: 'recurring' as const, sourceId: habit.id }));
}

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
