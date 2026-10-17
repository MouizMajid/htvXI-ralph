import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

/** Server → staff events. Kiosk clients never join the staff room. */
export interface StaffEvents {
  'queue:update': () => void;
  'visit:update': (visitId: string) => void;
  'flag:new': (flag: { visitId: string; kind: string; reason: string }) => void;
}

let io: Server<Record<string, never>, StaffEvents> | null = null;

export function attachRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: true } });
  io.on('connection', (socket) => {
    // TODO: real staff auth; for the demo, the dashboard asks to join.
    if (socket.handshake.query.role === 'staff') void socket.join('staff');
  });
  return io;
}

export function toStaff() {
  if (!io) throw new Error('realtime not attached');
  return io.to('staff');
}
