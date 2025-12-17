export type RegisterSize = "s8" | "s16" | "s32" | "u8" | "u16" | "u32";

export interface RegisterDefinition {
  readonly label: string;
  readonly address: number;
  readonly type: "MODBUS_INPUT_REGISTER" | "MODBUS_HOLDING_REGISTER";
  readonly unit: string;
  readonly divisionFactor: number;
  readonly sizeOfVariable: number;
  readonly size: RegisterSize;
  readonly minValue: number | null;
  readonly maxValue: number | null;
  readonly defaultValue: number | null;
}

export interface RegisterValue {
  address: number;
  value: number;
  rawValue: number;
  raw: Buffer;
  unit: string;
  formatted: string;
  label: string;
}
