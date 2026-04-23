import { TaskChatView } from '../admin/TaskDetail';
export default function StaffTaskDetail() {
  return <TaskChatView basePath="/app/tareas" isAdmin={false} />;
}
