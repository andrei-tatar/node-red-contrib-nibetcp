import { merge, Observable } from 'rxjs';
import { Tcp } from './tcp';
import { concatMap, filter, first, ignoreElements, map, scan, share, tap, timeout } from 'rxjs/operators';

const LABELS_BY_CODEID = new Map<number, string>([
    [3, 'READ_HOLDING'],
    [4, 'READ_INPUT'],
    [6, 'WRITE_SINGLE_REGISTER'],
    [16, 'WRITE_MULTIPLE_REGISTERS'],
]);
const CODEID_BY_LABEL = new Map<string, number>([...LABELS_BY_CODEID.entries()].map(([key, value]) => [value, key]));

export class Modbus {
    private static _transactionId = 0;
    private static get transactionId() {
        Modbus._transactionId++;
        if (Modbus._transactionId > 0xffff) {
            Modbus._transactionId = 0;
        }
        return Modbus._transactionId;
    }

    private readonly packages$: Observable<ModbusPackage>;

    constructor(
        private readonly tcp: Tcp,
    ) {

        this.packages$ = this.tcp.data$.pipe(
            scan(Modbus.handleMessage, { items: [], pending: Buffer.alloc(0) } as ModbusReadState),
            concatMap(v => v.items),
            share({ resetOnRefCountZero: true }),
        );
    }

    private static handleMessage(state: ModbusReadState, msg: Buffer) {
        state.pending = state.pending
            ? Buffer.concat([state.pending, msg])
            : msg;

        state.items = [];

        while (state.pending.length > 6) {
            const pkg_len = state.pending.readUInt16BE(4) + 6;

            if (state.pending.length < 8) return state; // safety precaution
            if (state.pending.length < pkg_len) return state; // not all data yet

            const data = state.pending.subarray(8, pkg_len);
            const pkgFunctionCode = state.pending.readUInt8(7);
            const functionCode = LABELS_BY_CODEID.get(pkgFunctionCode & 0x7F) as any;
            if (!functionCode) return state;

            const pkg: BasePackage = {
                transactionId: state.pending.readUInt16BE(0),
                protocol: state.pending.readUInt16BE(2),
                length: pkg_len,
                unitId: state.pending.readUInt8(6),
            };

            state.pending = state.pending.subarray(pkg_len);

            if (pkgFunctionCode & 0x80) {
                state.items.push({
                    ...pkg,
                    functionCode,
                    exception: data.readUInt8(0),
                });
                return state;
            }

            switch (functionCode) {
                case 'READ_HOLDING':
                case 'READ_INPUT':
                    const cnt = data.readUInt8(0);
                    const readRegsPackage: ReadRegistersModbusPackage = {
                        functionCode,
                        data: data.subarray(1, 1 + cnt),
                    }
                    state.items.push({
                        ...pkg,
                        ...readRegsPackage,
                    });
                    break;
                case 'WRITE_SINGLE_REGISTER':
                    const writeReg: WriteRegisterPackage = {
                        functionCode,
                        address: data.readUInt16BE(0),
                        value: Buffer.from([data[2], data[3]]),
                    };
                    state.items.push({
                        ...pkg,
                        ...writeReg,
                    });
                    break;
                case 'WRITE_MULTIPLE_REGISTERS':
                    const from = data.readUInt16BE(0);
                    const writeMany: WriteMultiplePackage = {
                        functionCode,
                        from: from,
                        to: data.readUInt16BE(2) + from - 1,
                    };
                    state.items.push({
                        ...pkg,
                        ...writeMany,
                    });
                    break;
            }
        }

        return state;
    }

    readRegisters(kind: 'READ_INPUT' | 'READ_HOLDING', startAddress: number, count = 1, timeoutMsec = 1000) {
        const transactionId = Modbus.transactionId;
        const data = Buffer.alloc(4);
        data.writeUInt16BE(startAddress, 0);
        data.writeUInt16BE(count, 2);
        const tx = this.sendPacket(transactionId, kind, data).pipe(ignoreElements());
        const rx = this.packages$.pipe(
            filter(p => p.transactionId === transactionId && p.functionCode === kind),
            timeout(timeoutMsec),
            first(),
            map(v => {
                if ('exception' in v) {
                    throw new Error(`Error while reading register ${startAddress}: (${v.functionCode} - ${v.exception})`);
                }

                if (v.functionCode !== kind) {
                    //we already filter, this shouldn't happen
                    throw new Error();
                }

                return v;
            }),
        );
        return merge(rx, tx);
    }

    writeRegisters(startAddress: number, data: Buffer, timeoutMsec = 1000) {
        if (data.length % 2 !== 0 || data.length === 0) {
            throw new Error(`Invalid data length ${data.length}`);
        }

        const transactionId = Modbus.transactionId;
        const writeCount = data.length / 2;
        let pckg: Buffer;
        let writeType: 'WRITE_SINGLE_REGISTER' | 'WRITE_MULTIPLE_REGISTERS';
        if (writeCount === 1) {
            writeType = 'WRITE_SINGLE_REGISTER';
            pckg = Buffer.alloc(2 + data.length);
            pckg.writeUInt16BE(startAddress, 0);
            data.copy(pckg, 2);
        } else {
            writeType = 'WRITE_MULTIPLE_REGISTERS';
            pckg = Buffer.alloc(5 + data.length);
            let offset = 0;
            offset = pckg.writeUInt16BE(startAddress, offset);
            offset = pckg.writeUInt16BE(writeCount, offset);
            offset = pckg.writeUInt8(writeCount * 2, offset);
            data.copy(pckg, offset);
        }

        const tx = this.sendPacket(transactionId, writeType, pckg).pipe(ignoreElements());
        const rx = this.packages$.pipe(
            filter(p => p.transactionId === transactionId && p.functionCode === writeType),
            timeout(timeoutMsec),
            first(),
            map(v => {
                if ('exception' in v) {
                    throw new Error(`Error while reading register ${startAddress}: (${v.functionCode} - ${v.exception})`);
                }
                if (v.functionCode !== writeType) {
                    //we already filter, this shouldn't happen
                    throw new Error();
                }

                return v;
            }),
        );

        return merge(rx, tx);
    }

    private sendPacket(transactionId: number, label: string, data: Buffer) {
        const codeId = CODEID_BY_LABEL.get(label);
        if (!codeId) {
            throw new Error('Invalid code id while sending packet');
        }

        const req = Buffer.alloc(8 + data.length);
        req.writeUInt16BE(transactionId, 0);
        req.writeUInt16BE(0, 2); //protocol
        req.writeUInt16BE(data.length + 2, 4);
        req.writeUInt8(0, 6); //unit id
        req.writeUInt8(codeId, 7);
        data.copy(req, 8);

        return this.tcp.send(req);
    }
}

type ModbusPackage = BasePackage & (ErrorModbusPackage | ReadRegistersModbusPackage | WriteRegisterPackage | WriteMultiplePackage);

interface BasePackage {
    transactionId: number;
    protocol: number;
    length: number;
    unitId: number;
};

interface ErrorModbusPackage {
    functionCode: 'READ_HOLDING' | 'READ_INPUT' | 'WRITE_SINGLE_REGISTER' | 'WRITE_MULTIPLE_REGISTERS';
    exception: number;
}

interface ReadRegistersModbusPackage {
    functionCode: 'READ_HOLDING' | 'READ_INPUT';
    data: Buffer;
}

interface WriteRegisterPackage {
    functionCode: 'WRITE_SINGLE_REGISTER';
    address: number;
    value: Buffer;
}

interface WriteMultiplePackage {
    functionCode: 'WRITE_MULTIPLE_REGISTERS';
    from: number;
    to: number;
}

interface ModbusReadState {
    pending: Buffer;
    items: ModbusPackage[];
}
