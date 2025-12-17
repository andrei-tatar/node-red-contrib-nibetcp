import { Socket } from "net";
import { Observable, Subject } from "rxjs";
import { Logger } from "../log";

export class Tcp {
  private _data = new Subject<Buffer>();

  readonly data$ = this._data.asObservable();

  private constructor(
    private readonly client: Socket,
    private readonly logger?: Logger
  ) {
    client.on("data", (msg) => this._data.next(Buffer.from(msg)));
  }

  static create(address: string, logger?: Logger) {
    return new Observable<Tcp>((observer) => {
      const client = new Socket();
      const url = new URL(address);
      if (url.protocol !== "tcp:") {
        throw new Error("Only TCP supported for now");
      }

      const port = parseInt(url.port) || 502;
      client.connect({
        host: url.hostname,
        port,
      });
      logger?.trace("connecting", { host: url.hostname, port });

      const wrapper = new Tcp(client, logger);
      client.on("connect", () => {
        logger?.trace("connected");
        observer.next(wrapper);
      });
      client.on("error", (err) => {
        logger?.trace("error", { err });
        observer.error(err);
      });
      client.on("close", () => {
        logger?.trace("connection closed");
        observer.error(new Error("Socket was closed"));
      });

      return () => {
        logger?.trace("observable closed");
        wrapper.end();
        client.end();
      };
    });
  }

  send(data: Buffer): Observable<void> {
    return new Observable((observer) => {
      this.client.write(data, (err) => {
        if (err) {
          observer.error(err);
        } else {
          observer.complete();
        }
      });
    });
  }

  end() {
    this.logger?.trace("end");
    this._data.complete();
  }
}
