import http from 'http';
import express from 'express';
import {Server, Socket} from 'socket.io';

import { Message, OnMessage, ServiceMessage, RefreshMessage, clientsByRoomType, EventMessage } from "@Base/src/domain/message";

import ChannelServiceManager from "./channelService";
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

function run(port: number = 3000): void {
    const app = express();
    let server: http.Server = http.createServer(app);
    let io: any = new Server(server);

    server.listen(port, () => {
        console.log('Listening port %s', port);
    });

    const pubClient = createClient({ url: "redis://localhost:6379" });
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient, { requestsTimeout: 10000 }));

    const channelServiceManager = new ChannelServiceManager(app);

    app.get('/', (req: any, res: { sendFile: (arg0: string, arg1: { root: string; }) => void; }) => {
        res.sendFile('index.html', { root: __dirname + '/html/'});
    });

    io.on('onCreateService', (serviceMessage: ServiceMessage) => {
        channelServiceManager.CreateService(serviceMessage.name, serviceMessage.nsp);
        io.emit('onCreateServiceClient', serviceMessage.name);
    });

    io.on('onRemoveService', (serviceMessage: ServiceMessage) => {
        channelServiceManager.RemoveService(serviceMessage.name);
        io.emit('onRemoveServiceClient', serviceMessage.name);
    });

    io.on('connection', (socket: any) => {
        socket.on('ready', async () => {
            socket.emit('onReady', {
                id: socket.id
            });

            socket.emit('onRefreshClient', await refresh(io));
        });

        socket.on('messageSend', (message: Message) => {
            if (message.rooms.length == 0) {
                return;
            }

            for(const room of message.rooms) {
                const onMessage:OnMessage = { room: room, client: socket.id, text: message.text, date: new Date() }
                io.to(room).emit('onMessage', onMessage);
            }
        });

        socket.on('createService', (serviceMessage: ServiceMessage) => {
            const isCreate = channelServiceManager.CreateService(serviceMessage.name, serviceMessage.nsp);
            if (isCreate) {
                io.serverSideEmit('onCreateService', serviceMessage);
            }
        });

        socket.on('removeService', (serviceMessage: ServiceMessage) => {
            const isRemove = channelServiceManager.RemoveService(serviceMessage.name);
            if (isRemove) {
                io.serverSideEmit('onRemoveService', serviceMessage)
            }
        });

        socket.on('refresh', async () => {
            socket.emit('onRefreshClient', await refresh(io));
        });

        socket.on('joinRoom', async (roomName: string) => {
            await joinSocket(socket, roomName);
            io.emit('onRefreshClient', await refresh(io));
        });

        socket.on('leaveRoom', async (roomName: string) =>  {
            await leaveSocket(socket, roomName);
            io.emit('onRefreshClient', await refresh(io));
        });

        socket.on('disconnect', async () => {
            io.emit('onRefreshClient', await refresh(io));
        });
    });
}

async function joinSocket(socket: Socket, roomName: string) {
    await socket.join('Room:' + roomName);
}

async function leaveSocket(socket: Socket, roomName: string) {
    await socket.leave(roomName);
}

async function refresh(io: any): Promise<RefreshMessage> {
    const clientsByRoom: clientsByRoomType[] = [];
    const allRooms:string[] = Array.from(await io.of('/').adapter.allRooms());
    const rooms = allRooms.filter((room: string) => { return room.indexOf("Room:") > -1 });

    if (rooms.length > 0) {
        for (const room of rooms) {
            const clientList = await io.of('/').adapter.sockets(new Set([room]));
            const clients:string[] = Array.from(clientList);
            clientsByRoom.push({
                key: room,
                clients: clients
            });
        }
    }

    const message = `allRooms: ${[...rooms].join(', ')}`;
    const refreshMessage: RefreshMessage = {
        rooms: rooms,
        clientsByRoom: clientsByRoom,
        message: message
    }
    return refreshMessage;
}

run(3000);