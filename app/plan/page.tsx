import { redirect } from 'next/navigation';
import { todayInTz } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default function PlanToday() {
  redirect(`/plan/${todayInTz()}`);
}
