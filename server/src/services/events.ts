import type { Response } from 'express';

/**
 * Minimal in-process pub/sub hub for Server-Sent Events.
 *
 * Every team/board mutation broadcasts one event; connected browsers update
 * without refresh. Single-instance by design (the free-tier deploy runs one
 * API instance). Scaling note, stated honestly in DESIGN-DOC.md: for
 * multi-instance deploys this hub is replaced by Redis pub/sub — the event
 * payloads and channel names stay identical.
 */
export interface BoardEvent {
  type: string;
  teamId?: string;
  actorId?: string;
  at: string;
  data?: Record<string, unknown>;
}

const clients = new Set<Response>();

export function addClient(res: Response): void {
  clients.add(res);
}

export function removeClient(res: Response): void {
  clients.delete(res);
}

export function broadcast(event: Omit<BoardEvent, 'at'>): void {
  const payload = JSON.stringify({ ...event, at: new Date().toISOString() });
  for (const res of clients) {
    res.write(`data: ${payload}\n\n`);
  }
}

export function clientCount(): number {
  return clients.size;
}
