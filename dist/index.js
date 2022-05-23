"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
function run(port = 3000) {
    const app = (0, express_1.default)();
    let server = http_1.default.createServer(app);
    let io = new socket_io_1.Server(server);
    server.listen(port, () => {
        console.log('Listening port %s', port);
    });
    const pubClient = createClient({ url: "redis://localhost:6379" });
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    app.get('/', (req, res) => {
        res.sendFile('index.html', { root: __dirname + '/html/' });
    });
    io.on('connection', (socket) => {
        socket.on('joinRoom', (key) => {
            socket.join(key);
        });
        socket.on('message', (message) => {
            io.nsp.to(message.key).emit('message', 'admin 서버에서 받은 정보: ' + message);
        });
    });
}
run(3000);
