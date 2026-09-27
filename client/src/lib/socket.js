// lib/socket.js
// Single shared Socket.io connection. We export the connected socket
// so any component can subscribe to events.
//
// Why a single connection? Socket.io recommends one connection per
// browser tab. Multiple connections from the same tab is wasteful
// and the server will see them as separate clients.
//
// Why lazily connect (and not on import)? If we connect on import, the
// socket starts up before the user is logged in, and we'd have no JWT
// to authenticate. The `connectSocket()` function is called from the
// AppLayout after auth is confirmed.

import { io } from 'socket.io-client';

let socket = null;

export const connectSocket = () => {
  if (socket && socket.connected) return socket;

  // Vite proxies /socket.io to the backend in dev. In production,
  // the same path will resolve to whatever origin is serving the API.
  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: localStorage.getItem('netguard_token') || '' },
  });

  socket.on('connect', () => {
    console.log('[socket] connected:', socket.id);
  });
  socket.on('disconnect', (reason) => {
    console.log('[socket] disconnected:', reason);
  });
  socket.on('connect_error', (err) => {
    console.warn('[socket] connect_error:', err.message);
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
