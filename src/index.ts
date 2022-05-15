import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { Message } from '@Base/src/domain/message';
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

function run(port: number = 3000): void {
    const app = express();
    let server: http.Server = http.createServer(app);
    let io: any = new Server(server);

    const pubClient = createClient({ url: "redis://localhost:6379" });
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    io.listen(3001);

    server.listen(port, () => {
        console.log('Listening port %s', port);
    });

    app.get('/', (req: any, res: { sendFile: (arg0: string, arg1: { root: string; }) => void; }) => {
        res.sendFile('index.html', { root: __dirname + '/html/'});
    });

    io.on('connection', (socket: any) => {
        console.log('소켓 접속 : ' + socket.id);
        socket.emit('message', socket.id);

        socket.on('message', (message: Message) => {
            console.log(message);
            io.emit('message', '서버에서 받은 정보: ' + message);
        });

        socket.on('disconnect', () => {
            io.emit('message', socket.id + ' disconnect');
        });
    });
}

run(3000);