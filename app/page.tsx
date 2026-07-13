import { getBarriers } from '@/lib/data';
import { Dashboard }   from '@/components/Dashboard';

// Data is generated once on the server (seeded, deterministic)
export default function Page() {
  const barriers = getBarriers();
  return <Dashboard barriers={barriers} />;
}
