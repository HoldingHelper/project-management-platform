import TaskDetailClient from "./TaskDetailClient";

export function generateStaticParams() {
  return [{ taskId: "_" }];
}

export default function TaskDetailPage() {
  return <TaskDetailClient />;
}
