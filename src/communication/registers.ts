import { readFile } from 'fs/promises';
import { RegisterDefinition } from './types';

const VALID_REGISTER_TYPES = ['MODBUS_INPUT_REGISTER', 'MODBUS_HOLDING_REGISTER'];
const SIZE_MAP = new Map<number, string>([
    [1, 's8'],
    [2, 's16'],
    [3, 's32'],
    [4, 'u8'],
    [5, 'u16'],
    [6, 'u32'],
]);

export async function loadAllRegisters(registerFile: string): Promise<RegisterDefinition[]> {
    const data = await readFile(registerFile);
    const registersString = data.toString('utf-8');
    const lines = registersString.split(/[\n\r]/gm).filter(l => !!l);
    const headers = lines[0].split('\t').filter(p => !!p);

    const titleIndex = headers.indexOf('Title');
    const typeIndex = headers.indexOf('Register type');
    const address = headers.indexOf('Register');
    const divisionFactor = headers.indexOf('Division factor')
    const unit = headers.indexOf('Unit');
    const sizeIndex = headers.indexOf('Size of variable');
    const minValue = headers.indexOf('Min value');
    const maxValue = headers.indexOf('Max value');
    const defaultValue = headers.indexOf('Default value');

    return lines
        .slice(1)
        .map(l => {
            const parts = l.split('\t');
            const size = parseInt(parts[sizeIndex], 10) || 5;
            return {
                label: parts[titleIndex],
                type: parts[typeIndex],
                address: parseInt(parts[address], 10),
                divisionFactor: parseInt(parts[divisionFactor], 10),
                unit: parts[unit],
                sizeOfVariable: size,
                size: SIZE_MAP.get(size),
                minValue: parts[minValue] === '-' ? null : parseInt(parts[minValue], 10),
                maxValue: parts[maxValue] === '-' ? null : parseInt(parts[maxValue], 10),
                defaultValue: parts[defaultValue] === '-' ? null : parseInt(parts[defaultValue], 10),
            };
        })
        .filter(validate);
}

function validate(reg: RegisterFromFile): reg is RegisterDefinition {
    if (!isNumber(reg.address) ||
        !isNumber(reg.divisionFactor) ||
        !isNumber(reg.sizeOfVariable) ||
        !isNumber(reg.minValue, true) ||
        !isNumber(reg.maxValue, true) ||
        !isNumber(reg.defaultValue, true) ||
        !VALID_REGISTER_TYPES.includes(reg.type) ||
        !reg.size) {
        return false;
    }

    return true;
}

function isNumber(val: any, allowNull = false): val is number {
    return allowNull && val === null || typeof val === 'number' && !isNaN(val) && isFinite(val);
}

interface RegisterFromFile {
    label: string;
    address: number;
    type: string;
    unit: string;
    divisionFactor: number;
    sizeOfVariable: number;
    minValue: number | null;
    maxValue: number | null;
    defaultValue: number | null;
    size?: string;
}
