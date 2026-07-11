// Transport for reviewing a pending automation-evolution proposal.
export async function reviewAutomationProposal(
  id: string,
  action: 'apply' | 'reject',
  reason: string,
): Promise<void> {
  const res = await fetch(`/api/automation-proposals/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: action === 'reject' ? JSON.stringify({ reason }) : '{}',
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `${action} failed: ${res.status}`);
  }
}
