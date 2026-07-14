import { mockApi } from '@/lib/api';
import { Dashboard } from '@/components/Dashboard';

// Server Component: fetches the full unfiltered dataset once at request time
// through the SAME api client the rest of the app uses (see lib/api.ts).
// Swapping NEXT_PUBLIC_API_MODE=http later requires zero changes here —
// `mockApi` is used explicitly on the server render because Next.js server
// components can't read client-side env selection the same way; the client
// dashboard re-fetches through `api` (mock or http) for all filtered views.
export default async function Page() {
  const barriers = await mockApi.getAllBarriers({});
  return <Dashboard initialBarriers={barriers} />;
}
