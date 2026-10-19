// Shared identity for the explicit local mock and its fail-closed development proxy.
export const NOTE_RADAR_MOCK_PORT = 18084;
export const NOTE_RADAR_MOCK_ORIGIN = 'http://127.0.0.1:18084';
export const NOTE_RADAR_MOCK_IDENTITY = Object.freeze({ service: 'iidx-note-radar-mock', version: 1 });
export const NOTE_RADAR_MOCK_HEADER = 'x-note-radar-mock';
export const NOTE_RADAR_MOCK_API_CONTEXT = '^/api(?:/|\\?|$)';
