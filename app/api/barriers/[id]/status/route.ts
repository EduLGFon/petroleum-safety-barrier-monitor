import { NextRequest, NextResponse } from 'next/server';
import { transitionBarrierStatus } from '@/lib/server/sql/barriers';

/**
 * PATCH /api/barriers/:id/status
 * body: { statusId: number; authorId: number; note?: string }
 *
 * The one supported write path for this API. Moves a barrier to a new
 * disponibilidade, stamping status_since to today and appending a
 * barrier_status_history row atomically via the record_status_change()
 * stored procedure (db/schema.sql) — never done via a raw UPDATE.
 *
 * Bonus endpoint, not yet called by the dashboard: SettingsContext already
 * models admin/viewer roles for exactly this purpose ("admins can edit
 * contingenciamento"), so this exists ahead of that UI landing.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const barrierId = Number(id);

  if (!Number.isInteger(barrierId) || barrierId <= 0) {
    return NextResponse.json({ error: 'Invalid barrier id' }, { status: 400 });
  }

  let body: { statusId?: number; authorId?: number; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { statusId, authorId, note } = body;
  if (!Number.isInteger(statusId) || !Number.isInteger(authorId)) {
    return NextResponse.json(
      { error: 'statusId and authorId are required integers' },
      { status: 400 }
    );
  }

  try {
    const updated = await transitionBarrierStatus(barrierId, statusId!, authorId!, note ?? '');
    if (!updated) {
      return NextResponse.json({ error: 'Barrier not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error(`[PATCH /api/barriers/${id}/status]`, err);
    return NextResponse.json({ error: 'Failed to update barrier status' }, { status: 500 });
  }
}
