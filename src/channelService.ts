// 서비스별 채널을 만든다
import uid2 = require('uid2');
import { Express } from "express";

class Channel {
    private key: string;
    private service: ChannelService

    constructor(key: string, service: ChannelService) {
        this.key = key;
        this.service = service;
    }
}

class ChannelService {
    private channels: Map<any, any>;
    private nsp: string;
    private uid: string;

    constructor(serverNsp: string) {
        this.channels = new Map();
        this.nsp = serverNsp || '/'; //'/admin'
        this.uid = uid2(5);
    }

    CreateChannel(key: string): Channel | null {
        if (this.channels.has(key)) {
            return null;
        }

        const channel = new Channel(key, this);
        this.channels.set(key, channel);
        return channel;
    }

    RemoveChanel(key: string): void {
        if (this.channels.has(key)) {
            this.channels.delete(key);
        }
    }

    GetChanel(key: string ): Channel | null {
        if (!this.channels.has(key)) {
            return null;
        }

        return this.channels.get(key)
    }
}

class ChannelServiceManager {
    private app: Express;
    private services: Map<string, ChannelService>

    constructor(app: Express) {
        this.app = app;
        this.services = new Map<string, ChannelService>();
    }

    CreateService(serviceName: string, serviceNsp: string): boolean {
        if (this.services.has(serviceName)) {
            return false;
        }

        this.services.set(serviceName, new ChannelService(serviceNsp));
        console.log(`${serviceName} 서비스 생성`);
        return true;
    }

    RemoveService(serviceName: string): boolean {
        if (!this.services.has(serviceName)) {
            return false;
        }

        this.services.delete(serviceName);
        console.log(`${serviceName} 서비스 삭제`);
        return true;
    }

    GetService(serviceName: string): ChannelService | null {
        return this.services.get(serviceName) || null;
    }

    GetServiceList() {
        if (this.services.size == 0) {
            return null;
        }

        return Array.from(this.services.values());
    }
}

export default ChannelServiceManager;