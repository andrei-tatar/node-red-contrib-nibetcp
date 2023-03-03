import { combineLatest, concat, defer, interval, EMPTY, Subject, merge, } from 'rxjs';
import { finalize, first, catchError, startWith, switchMap, tap } from 'rxjs/operators';
import { ConfigNode, NodeInterface } from '..';

module.exports = function (RED: any) {
    RED.nodes.registerType('nibe-register',
        function (this: NodeInterface, config: any) {
            RED.nodes.createNode(this, config);

            const nibeConfig: ConfigNode = RED.nodes.getNode(config.nibe);
            if (!nibeConfig?.nibe$) {
                return;
            }

            const forceWrite = !!config.force;
            const timeoutMsec = (+config.timeout || 1) * 1000;
            const intervalMsec = (+config.interval || 1) * 1000;
            const forceRead = new Subject<void>();
            let consecutiveErrors = 0;

            const subscription = concat(
                defer(() => {
                    consecutiveErrors = 0;
                    this.status({ fill: 'yellow', text: 'standby' })
                    return EMPTY;
                }),
                combineLatest([
                    nibeConfig.nibe$,
                    merge(
                        interval(intervalMsec).pipe(startWith(0)),
                        forceRead,
                    ),
                ])
            ).pipe(
                switchMap(([n]) => n.readRegister(config.register, timeoutMsec).pipe(
                    catchError(err => {
                        this.warn(`Error reading ${config.register}: ${err}`);
                        this.status({ fill: 'red', text: `${err}` })
                        if (++consecutiveErrors >= 3) {
                            nibeConfig.reset();
                        };
                        return EMPTY;
                    }),
                )),
                tap(v => {
                    this.status({ fill: 'blue', text: v.formatted });
                    consecutiveErrors = 0;
                }),
                finalize(() => this.status({ fill: 'red', text: 'disconnected' })),
            ).subscribe({
                next: (value) => this.send({ payload: value, topic: config.topic }),
            });

            this.on('input', (msg, _, done) => {
                if (config.filter && config.topic && msg.topic !== config.topic) {
                    done?.();
                    return;
                }

                nibeConfig.nibe$.pipe(
                    first(),
                    switchMap(n => n.writeRegister(config.register, +msg.payload, forceWrite, timeoutMsec)),
                ).subscribe({
                    error: (err) => {
                        done
                            ? done?.(err)
                            : this.warn(`Error writing ${msg.payload} to ${config.register}: ${err}`);
                    },
                    complete: () => {
                        forceRead.next();
                        done?.();
                    },
                });
            });

            this.on('close', () => subscription.unsubscribe());
        });
};
