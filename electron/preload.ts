// electron/preload.ts

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('api', {
  ping: () => 'pong',
});
