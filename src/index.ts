import { Observable } from 'rxjs';
import { Nibe } from './communication/nibe';

export interface NodeMessage extends Record<string, any> {
    payload: any;
    topic?: string;
}

export interface NodeInterface {
    credentials: { [key: string]: string };

    on(type: 'input', callback: (msg: NodeMessage, send?: (msgToSend: NodeMessage) => void, done?: (err?: any) => void) => void): void;
    on(type: 'close', callback: () => void): void;

    send(msg: any): void;

    log(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;

    status(params: {
        fill: 'red' | 'green' | 'yellow' | 'blue' | 'grey';
        text: string;
        shape: 'ring' | 'dot';
    } | {}): void;

    context(): {
        get<T>(key: string): T;
        set<T>(key: string, value: T): void;
    };
}

export interface Logger {
    trace(message?: any): void;
    debug(message?: any): void;
    info(message?: any): void;
    warn(message?: any): void;
    error(message?: any): void;
}

export interface ConfigNode {
    nibe$: Observable<Nibe>;
}
