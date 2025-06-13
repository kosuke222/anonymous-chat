// frontend/src/socket.ts
import { io } from 'socket.io-client';

// バックエンドが動いているURLを指定。通常はlocalhost:3000
const SOCKET_URL = 'http://localhost:3000';

const socket = io(SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: false // 自動接続を無効にし、必要に応じて接続する
});

export default socket;