/**
 * POST /backend/bench/approve   body: { runId, seq: number | 'all', decision }
 *
 * Answers a pending review-mode approval request (see the chat endpoint).
 * `seq: 'all'` with `decision: 'approved'` also auto-approves the rest of
 * the run — the "always allow" escape hatch every MCP host ends up needing.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitDecision } from '$lib/server/approvals';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as
    | { runId?: string; seq?: number | 'all'; decision?: 'approved' | 'declined' }
    | null;
  const runId = body?.runId;
  const seq = body?.seq;
  const decision = body?.decision;
  if (!runId || seq === undefined || (decision !== 'approved' && decision !== 'declined')) {
    throw error(400, 'runId, seq and decision are required');
  }
  return json({ ok: submitDecision(runId, seq, decision) });
};
