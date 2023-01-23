import { combineLatest, concat, defer, interval, EMPTY, } from 'rxjs';
import { finalize, first, catchError, startWith, switchMap, tap, distinctUntilChanged } from 'rxjs/operators';
import { ConfigNode, NodeInterface } from '..';

module.exports = function (RED: any) {
    RED.nodes.registerType('nibe-register',
        function (this: NodeInterface, config: any) {
            RED.nodes.createNode(this, config);

            const nibeConfig: ConfigNode = RED.nodes.getNode(config.nibe);
            if (!nibeConfig?.nibe$) {
                return;
            }

            const subscription = concat(
                defer(() => {
                    this.status({ fill: 'yellow', text: 'standby' })
                    return EMPTY;
                }),
                combineLatest([
                    nibeConfig.nibe$,
                    interval((+config.interval || 1) * 1000).pipe(startWith(0)),
                ])
            ).pipe(
                switchMap(([n]) => n.readRegister(config.register, (+config.timeout || 1) * 1000).pipe(
                    catchError(err => {
                        this.warn(`Error reading ${config.register}: ${err}`);
                        return EMPTY;
                    }),
                )),
                distinctUntilChanged((a, b) => a.formatted === b.formatted),
                tap(v => this.status({ fill: 'blue', text: v.formatted })),
                finalize(() => this.status({ fill: 'red', text: 'disconnected' })),
            ).subscribe({
                next: (value) => this.send({ payload: value }),
            });

            this.on('input', (msg, _, done) => {
                nibeConfig.nibe$.pipe(
                    first(),
                    switchMap(n => n.writeRegister(config.register, +msg.payload, (+config.timeout || 1) * 1000)),
                ).subscribe({
                    error: (err) => {
                        done
                            ? done?.(err)
                            : this.warn(`Error writing ${msg.payload} to ${config.register}: ${err}`);
                    },
                    complete: () => done?.(),
                });
            });

            this.on('close', () => subscription.unsubscribe());
        });
};
