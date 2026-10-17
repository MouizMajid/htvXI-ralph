import { io, type Socket } from 'socket.io-client';

let staffSocket: Socket | null = null;

/** Only the staff dashboard connects; the kiosk never receives staff events. */
export function getStaffSocket(): Socket {
  staffSocket ??= io({ query: { role: 'staff' } });
  return staffSocket;
}
