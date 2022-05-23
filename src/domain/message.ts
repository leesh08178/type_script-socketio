type Message = {
    rooms: string[];
    text: string;
    date: Date;
}

type OnMessage = {
    room: string;
    client: string;
    text: string;
    date: Date;
}

type ServiceMessage = {
    name: string;
    nsp: string;
    date: Date;
}

type clientsByRoomType = { key: string, clients: string[] }

type EventMessage = {
    id: string,
    rooms: string[]
}

type RefreshMessage = {
    rooms: string[],
    clientsByRoom: clientsByRoomType[],
    message: string
}

export {
    Message,
    ServiceMessage,
    RefreshMessage,
    clientsByRoomType,
    EventMessage,
    OnMessage
}