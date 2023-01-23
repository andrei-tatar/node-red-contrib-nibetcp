export type RegisterSize = 's8' | 's16' | 's32' | 'u8' | 'u16' | 'u32';

export interface RegisterDefinition {
    label: string;
    address: number;
    type: 'MODBUS_INPUT_REGISTER' | 'MODBUS_HOLDING_REGISTER';
    unit: string;
    divisionFactor: number;
    sizeOfVariable: number;
    size: RegisterSize;
    minValue: number | null;
    maxValue: number | null;
    defaultValue: number | null;
}

export interface RegisterValue {
    value: number;
    rawValue: number;
    raw: Buffer;
    unit: string;
    formatted: string;
    label: string;
}