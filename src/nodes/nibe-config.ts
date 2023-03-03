import { merge, ReplaySubject, Subject, throwError } from 'rxjs';
import { join as pathJoin } from 'path';
import { debounceTime, first, ignoreElements, share, switchMap } from 'rxjs/operators';
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

            this.nibe$ = merge(
                Nibe.createTcp(address, registerFile),
                reset$.pipe(
                    debounceTime(1000),
                    first(),
                    switchMap(_ =>
                        throwError(() => new Error('Reset connection'))
                    ),
                    ignoreElements(),
                ),
            ).pipe(
                share({ connector: () => new ReplaySubject(1) }),
            );

            this.reset = () => reset$.next();
        });
};
