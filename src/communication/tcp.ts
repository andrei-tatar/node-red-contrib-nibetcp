import { Socket } from 'net';
import { Observable, Subject } from 'rxjs';

export class Tcp {
    private _data = new Subject<Buffer>();

    readonly data$ = this._data.asObservable();

    private constructor(
        private readonly client: Socket,
    ) {
        client.on('data', this.handler.bind(this));
    }

    private handler(msg: Buffer) {
        this._data.next(msg);
    }

    static create(address: string) {
        return new Observable<Tcp>(observer => {
            const client = new Socket();
            const url = new URL(address);
            if (url.protocol !== 'tcp:') {
                throw new Error('Only TCP supported for now');
            };

            const port = parseInt(url.port) || 502;
            client.connect({
                host: url.hostname,
                port,
            });

            const wrapper = new Tcp(client);
            client.on('connect', () => observer.next(wrapper));

            return () => {
                wrapper.end();
                client.end();
            };
        })
    }

    send(data: Buffer): Observable<void> {
        return new Observable(observer => {
            this.client.write(data, err => {
                if (err) {
                    observer.error(err);
                } else {
                    observer.complete();
                }
            });
        });
    }

    end() {
        this._data.complete();
    }
}