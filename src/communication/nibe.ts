import { defer, Observable } from 'rxjs';
import { first, ignoreElements, map, retry, shareReplay, switchMap, timeout } from 'rxjs/operators';
import { Modbus } from './modbus';
import { loadAllRegisters } from './registers';
import { Tcp } from './tcp';
import { RegisterDefinition, RegisterSize, RegisterValue } from './types';
import { Logger } from '../log';

const DEFAULT_TIMEOUT = 1000;

export class Nibe {
    static createTcp(address: string, registerFilePath: string, logger?: Logger) {
        const nibe = Tcp
            .create(address, logger?.scope('tcp'))
            .pipe(
                map(x => new Modbus(x)),
                map(m => new Nibe(m, registerFilePath)),
            );

        return nibe;
    }

    readonly registers$: Observable<RegisterDefinition[]>;

    private constructor(
        private readonly modbus: Modbus,
        private registerFile: string) {

        this.registers$ = defer(async () => {
            return await loadAllRegisters(this.registerFile);
        }).pipe(
            shareReplay(1),
        );
    }

    readRegister(labelOrAddress: string | number, timeoutMsec: number) {
        return this.registers$.pipe(
            first(),
            map(registers => {
                const reg = this.findRegister(labelOrAddress, registers);
                if (!reg) {
                    throw new Error(`Could not find register '${labelOrAddress}'`);
                }

                return reg;
            }),
            switchMap(reg => this.readInternal(reg, timeoutMsec).pipe(
                retry({ count: 3 }),
            )),
        );
    }

    writeRegister(labelOrAddress: string | number, value: number, force: boolean, timeoutMsec: number) {
        return this.registers$.pipe(
            first(),
            map(registers => {
                const reg = this.findRegister(labelOrAddress, registers);
                if (!reg) {
                    throw new Error(`Could not find register '${labelOrAddress}'`);
                }

                if (reg.type !== 'MODBUS_HOLDING_REGISTER') {
                    throw new Error(`Readonly register '${labelOrAddress}'`);
                }

                return reg;
            }),
            switchMap(reg => this.writeInteral(reg, value, force, timeoutMsec).pipe(
                retry({ count: 3 }),
            )),
            ignoreElements(),
        );
    }

    private findRegister(labelOrAddress: string | number, list: RegisterDefinition[]): RegisterDefinition | undefined {
        const address = typeof labelOrAddress === 'number'
            ? labelOrAddress
            : parseInt(labelOrAddress, 10);
        if (!isNaN(address) && address >= 30000) {
            return list.find(r => r.address === address);
        }

        const match = list.filter(r => r.label === labelOrAddress);
        match.sort((a, b) => a.type.localeCompare(b.type));
        return match[0];
    }

    private writeInteral(register: RegisterDefinition, value: number, force = false, timeoutMsec = DEFAULT_TIMEOUT) {
        const raw = value * register.divisionFactor;
        if (!force && (
            register.minValue !== null && raw < register.minValue ||
            register.maxValue !== null && raw > register.maxValue)) {
            throw new Error(`Invalid value for register ${register.address}: ${raw}`);
        }
        const data = this.writeValue(register.size, raw);
        return this.modbus.writeRegisters(register.address % 10000, data, timeoutMsec);
    }

    private readInternal(register: RegisterDefinition, timeoutMsec = DEFAULT_TIMEOUT): Observable<RegisterValue> {
        const registerCount = register.size === 's32' || register.size === 'u32' ? 2 : 1;
        const readKind = register.type === 'MODBUS_HOLDING_REGISTER' ? 'READ_HOLDING' : 'READ_INPUT';

        return this.modbus.readRegisters(readKind, register.address % 10000, registerCount, timeoutMsec).pipe(
            map(v => {
                const rawValue = this.readValue(v.data, register.size);
                const value: RegisterValue = {
                    value: rawValue / register.divisionFactor,
                    label: register.label,
                    unit: register.unit,
                    address: register.address,
                    formatted: `${rawValue / register.divisionFactor}${register.unit}`,
                    rawValue,
                    raw: Buffer.from(v.data),
                };
                return value;
            }),
        );
    }

    private writeValue(size: RegisterSize, value: number): Buffer {
        let data: Buffer;
        switch (size) {
            case 'u8':
            case 'u16':
                data = Buffer.alloc(2);
                data.writeUInt16BE(value, 0);
                break;
            case 's8':
            case 's16':
                data = Buffer.alloc(2);
                data.writeInt16BE(value, 0);
                break;
            case 'u32':
            case 's32':
                data = Buffer.alloc(4);
                data.writeUint16BE((value >> 16) & 0xFFFF, 0);
                data.writeUint16BE(value & 0xFFFF, 2);
                break;
            default: throw new Error(`Register size not supported '${size}'`);
        }
        return data;
    }

    private readValue(data: Buffer, size: RegisterSize): number {
        switch (size) {
            case 'u8': return data.readUInt16BE(0);
            case 's8': return data.readInt16BE(0);
            case 'u16': return data.readUInt16BE(0);
            case 's16': return data.readInt16BE(0);
            case 'u32':
                const p1 = data.readUint16BE(0);
                const p2 = data.readUint16BE(2);
                return (p2 << 16) + p1;
            case 's32':
                const p1s = data.readUint16BE(0);
                const p2s = data.readUint16BE(2);
                return (p2s << 16) + p1s;
            default: throw new Error(`Register size not supported '${size}'`);
        }
    }
}