import { combineLatest, concat, defer, interval, EMPTY, Subject, merge, } from 'rxjs';
import { finalize, catchError, startWith, switchMap, tap, first, retry, takeUntil, timeout, concatMap } from 'rxjs/operators';
import { ConfigNode, NodeInterface } from '..';
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
            let consecutiveErrors = 0;

            if (timeoutMsec >= intervalMsec - 500) {
                timeoutMsec = intervalMsec - 500;
            }

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
                    return n.readRegister(config.register).pipe(
                        timeout(timeoutMsec),
                        catchError(err => {
                            log?.trace('error reading');
                            this.warn(`Error reading ${config.register}: ${err}`);
                            this.status({ fill: 'red', text: `${err}` })
                            if (++consecutiveErrors >= 3) {
                                log?.trace('3 consecutive errors, reseting config');
                                nibeConfig.reset();
                            };
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

            this.on('input', (msg, _, done) => {
                if (config.filter && config.topic && msg.topic !== config.topic) {
                    done?.();
                    return;
                }

                nibeConfig.nibe$.pipe(
                    first(),
                    switchMap(n => n.writeRegister(config.register, +msg.payload, forceWrite)),
                    takeUntil(close$),
                ).subscribe({
                    error: (err) => {
                        done
                            ? done?.(err)
                            : this.warn(`Error writing ${msg.payload} to ${config.register}: ${err}`);
                    },
                    complete: () => {
                        forceRead$.next();
                        done?.();
                    },
                });
            });

            this.on('close', () => close$.next());
        });
};
