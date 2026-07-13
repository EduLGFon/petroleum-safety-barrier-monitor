import { getBarriers } from '@/lib/data';
import { Dashboard }   from '@/components/Dashboard';

export default function Page() {
  const barriers = getBarriers();
  return <Dashboard barriers={barriers} />;
}
