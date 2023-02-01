import { concat, defer, EMPTY, merge, ReplaySubject, Subject } from 'rxjs';
import { join as pathJoin } from 'path';
import { concatMap, debounceTime, first, ignoreElements, map, retry, share, switchMap } from 'rxjs/operators';
import { ConfigNode, NodeInterface } from '..';
import { Nibe } from '../communication/nibe';

module.exports = function (RED: any) {
    RED.nodes.registerType('nibe-config',
        function (this: NodeInterface & ConfigNode, config: any) {
            RED.nodes.createNode(this, config);

            let address: string | undefined;
            if (typeof config.address === 'string') {
                address = config.address.trim() || undefined;
            }
            if (!address) {
                return;
            }

            const registerFile = config.registerFile || pathJoin(__dirname, '../../registers.csv');
            const reset$ = new Subject<void>();

            this.nibe$ = concat(
                defer(() => {
                    this.status({ fill: 'red', shape: 'dot', text: 'Disconnected' });
                    return EMPTY;
                }),
                merge(
                    Nibe.createTcp(address, registerFile),
                    reset$.pipe(
                        debounceTime(1000),
                        first(),
                        map(_ => {
                            throw new Error('Reset connection due to too many errors');
                        }),
                        ignoreElements(),
                    ),
                ),
            ).pipe(
                retry({ delay: 20000 }),
                share({
                    connector: () => new ReplaySubject(1),
                    resetOnRefCountZero: true,
                }),
            );

            this.reset = () => reset$.next();
        });
};
