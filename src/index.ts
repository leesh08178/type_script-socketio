import http from 'http';
import express from 'express';
import {Server, Socket} from 'socket.io';

import { Message, OnMessage, ServiceMessage, RefreshMessage, clientsByRoomType, EventMessage } from "@Base/src/domain/message";

import ChannelServiceManager from "./channelService";
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const channels:Map<string, Map<string, string>> = new Map<string, Map<string, string>>();
const clientRoom:Map<string, Map<string, string>> = new Map<string, Map<string, string>>();

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

    io.on('onJoinRoom', (eventMessage: EventMessage) => {
        for(const room of eventMessage.rooms) {
            joinChannel(eventMessage.id, 'Room:'+room);
        }
    });

    io.on('onLeaveRoom', (eventMessage: EventMessage) => {
        for(const room of eventMessage.rooms) {
            leaveChannel(eventMessage.id, 'Room:'+room);
        }
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
        socket.on('ready', () => {
            socket.emit('onReady', {
                id: socket.id
            });
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
            socket.emit('onRefreshClient', await refresh(io, socket));
        });

        socket.on('joinRoom', async (roomName: string) => {
            await joinSocket(socket, roomName);
            const eventMessage: EventMessage = { id: socket.id, rooms: [roomName] }
            await io.serverSideEmit('onJoinRoom', eventMessage);
            setTimeout(async () => { io.emit('onRefreshClient', await refresh(io, socket)); }, 200);
        });

        socket.on('leaveRoom', async (roomName: string) =>  {
            await leaveSocket(socket, roomName);
            const eventMessage: EventMessage = { id: socket.id, rooms: [roomName] }
            await io.serverSideEmit('onLeaveRoom', eventMessage);
            setTimeout(async () => { io.emit('onRefreshClient', await refresh(io, socket)); }, 200);
        });

        socket.on('disconnect', async () => {
            if (clientRoom.has(socket.id)) {
                let rooms:any = clientRoom.get(socket.id);
                rooms = Array.from(rooms.keys());
                for(const room of rooms) {
                    leaveChannel(socket.id, room);
                    delClient(socket.id, room);
                }

                const eventMessage: EventMessage = { id: socket.id, rooms: rooms }
                await io.serverSideEmit('onLeaveRoom', eventMessage);
                setTimeout(async () => { io.emit('onRefreshClient', await refresh(io, socket)); }, 200);
            }
        });
    });
}

async function joinSocket(socket: Socket, roomName: string) {
    await socket.join('Room:' + roomName);
    putClient(socket.id, 'Room:' + roomName);
    joinChannel(socket.id, 'Room:' + roomName);
}

async function leaveSocket(socket: Socket, roomName: string) {
    await socket.leave(roomName);
    delClient(socket.id, roomName);
    leaveChannel(socket.id, roomName);
}

function putClient(id: string, roomName: string) {
    if(!clientRoom.has(id)) {
        clientRoom.set(id, new Map<string, string>());
    }

    const rooms:Map<string, string> | undefined = clientRoom.get(id);
    if (rooms && !rooms.has(roomName)) {
        rooms.set(roomName, roomName);
    }
}

function delClient(id: string, roomName: string) {
    if(!clientRoom.has(id)) {
        return;
    }

    const rooms:Map<string, string> | undefined = clientRoom.get(id);
    if (rooms && rooms.has(roomName)) {
        rooms.delete(roomName);

        if (rooms.size == 0) {
            clientRoom.delete(id);
        }
    }
}

function joinChannel(id: string, roomName: string) {
    if(!channels.has(roomName)) {
        channels.set(roomName, new Map<string, string>());
    }

    const clients:Map<string, string> | undefined = channels.get(roomName);
    if (clients && !clients.has(id)) {
        clients.set(id, id);
    }
}

function leaveChannel(id: string, roomName: string) {
    if(!channels.has(roomName)) {
        return;
    }

    const clients:Map<string, string> | undefined = channels.get(roomName);
    if (clients && clients.has(id)) {
        clients.delete(id);

        if (clients.size == 0) {
            channels.delete(roomName);
        }
    }
}

async function refresh(io: any, socket: any): Promise<RefreshMessage> {
    const clientsByRoom: clientsByRoomType[] = [];
    const allRooms:string[] = Array.from(await io.of('/').adapter.allRooms());
    const rooms = allRooms.filter((room: string) => { return room.indexOf("Room:") > -1 });

    if (rooms.length > 0) {
        for (const room of rooms) {
            if (channels.has(room)) {
                const clientList = channels.get(room) || new Map<string, string>();
                const clients:string[] = Array.from(clientList.keys());
                clientsByRoom.push({
                    key: room,
                    clients: clients
                });
            }
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