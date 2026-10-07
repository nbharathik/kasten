// The Task board section of a project's home: the project's #task notes by
// status (TaskBoard); "+ New" in a column makes the task in this project.

import { DashCard } from "../dashboard/DashCard";
import { TaskBoard, useTaskNotes } from "../tasks/TaskBoard";

export function ProjectKanban({ folder }: { folder: string }) {
  const where = `project:${folder}`;
  const tasks = useTaskNotes(where);
  return (
    <DashCard title="Task board" icon="kanban" count={tasks.length}>
      <TaskBoard where={where} bare />
    </DashCard>
  );
}
