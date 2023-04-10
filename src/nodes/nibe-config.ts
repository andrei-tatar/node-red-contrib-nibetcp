import { merge, ReplaySubject, Subject, throwError } from 'rxjs';
import { join as pathJoin } from 'path';
import { debounceTime, first, ignoreElements, share, switchMap } from 'rxjs/operators';
import { ConfigNode, NodeInterface } from '..';
import { Nibe } from '../communication/nibe';
import { logger } from '../log';

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
            const log = logger?.scope(`config`);

            this.nibe$ = merge(
                Nibe.createTcp(address, registerFile, log),
                reset$.pipe(
                    debounceTime(1000),
                    first(),
                    switchMap(_ =>
                        throwError(() => {
                            log?.trace('reseting connection');
                            return new Error('Reset connection');
                        })
                    ),
                    ignoreElements(),
                ),
            ).pipe(
                share({ connector: () => new ReplaySubject(1) }),
            );

            this.reset = () => reset$.next();
        });
};
