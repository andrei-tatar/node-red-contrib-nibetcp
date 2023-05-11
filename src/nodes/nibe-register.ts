import { combineLatest, concat, defer, interval, EMPTY, Subject, merge, ReplaySubject, } from 'rxjs';
import { finalize, catchError, startWith, tap, retry, takeUntil, concatMap, withLatestFrom, filter } from 'rxjs/operators';
import { ConfigNode, NodeInterface, isDefined } from '..';
import { logger } from '../log';

module.exports = function (RED: any) {
    RED.nodes.registerType('nibe-register',
        function (this: NodeInterface, config: any) {
            RED.nodes.createNode(this, config);

            const nibeConfig: ConfigNode = RED.nodes.getNode(config.nibe);
            if (!nibeConfig?.nibe$) {
                return;
            }

            const log = logger?.scope(`reg-${config.id}`);

            const forceWrite = !!config.force;
            let timeoutMsec = (+config.timeout || 3) * 1000;
            const intervalMsec = (+config.interval || 10) * 1000;
            const forceRead$ = new Subject<void>();
            const close$ = new Subject<void>();
            const write$ = new ReplaySubject<number | null>(1);
            let consecutiveErrors = 0;

            const resetConnectionOnConsecutiveErrors = () => {
                if (++consecutiveErrors >= 3) {
                    log?.trace('3 consecutive errors, reseting config');
                    nibeConfig.reset();
                };
            };

            concat(
                defer(() => {
                    consecutiveErrors = 0;
                    log?.trace('starting subscription');
                    this.status({ fill: 'yellow', text: 'standby' })
                    return EMPTY;
                }),
                combineLatest([
                    nibeConfig.nibe$,
                    merge(
                        interval(intervalMsec).pipe(startWith(0)),
                        forceRead$,
                    ),
                ])
            ).pipe(
                concatMap(([n]) => {
                    log?.trace('reading register');
                    return n.readRegister(config.register, timeoutMsec).pipe(
                        catchError(err => {
                            log?.trace('error reading');
                            this.warn(`Error reading ${config.register}: ${err}`);
                            this.status({ fill: 'red', text: `${err}` })
                            resetConnectionOnConsecutiveErrors();
                            return EMPTY;
                        })
                    );
                }),
                tap(v => {
                    log?.trace('got response', { value: v.formatted });
                    this.status({ fill: 'blue', text: v.formatted });
                    consecutiveErrors = 0;
                }),
                finalize(() => {
                    log?.trace('disconnected');
                    this.status({ fill: 'red', text: 'disconnected' });
                }),
                retry({ delay: 20000 }),
                takeUntil(close$),
            ).subscribe({
                next: (value) => this.send({ payload: value, topic: config.topic }),
                complete: () => log?.trace('complete!'),
            });


            write$.pipe(
                filter(isDefined),
                withLatestFrom(nibeConfig.nibe$),
                concatMap(([value, nibeConnection]) =>
                    nibeConnection
                        .writeRegister(config.register, value, forceWrite, timeoutMsec)
                        .pipe(
                            tap({
                                error: (err) => {
                                    this.warn(`Error writing ${value} to ${config.register}: ${err}`);
                                    this.status({ fill: 'red', text: `${err}` })
                                    resetConnectionOnConsecutiveErrors();
                                },
                                complete: () => {
                                    write$.next(null);
                                    forceRead$.next();
                                    consecutiveErrors = 0;
                                },
                            }),
                            takeUntil(close$),
                        )
                ),
                retry({ delay: 10000 }),
            ).subscribe();

            this.on('input', (msg, _, done) => {
                if (config.filter && config.topic && msg.topic !== config.topic) {
                    done?.();
                    return;
                }

                write$.next(+msg.payload);
                done?.();
            });

            this.on('close', () => close$.next());
        });
};
