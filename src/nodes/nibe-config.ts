import { concat, defer, EMPTY, ReplaySubject } from 'rxjs';
import { retry, share } from 'rxjs/operators';
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

            const registerFile = config.registerFile || (__dirname + '../../../registers.csv');

            this.nibe$ = concat(
                defer(() => {
                    this.status({ fill: 'red', shape: 'dot', text: 'Disconnected' });
                    return EMPTY;
                }),
                Nibe.createTcp(address, registerFile),
            ).pipe(
                retry({ delay: 20000 }),
                share({
                    connector: () => new ReplaySubject(1),
                    resetOnRefCountZero: true,
                }),
            );
        });
};
