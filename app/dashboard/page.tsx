import { connection } from 'next/server';
import { HomeView } from '@/components/app/HomeView';
import { listTasks } from '@/lib/tasks';

export default async function HomePage({ searchParams }: PageProps<'/dashboard'>) {
  await connection();
  const [{ task }, tasks] = await Promise.all([searchParams, listTasks()]);
  return <HomeView tasks={tasks} renderedAt={Date.now()} focusId={typeof task === 'string' ? task : null} />;
}
