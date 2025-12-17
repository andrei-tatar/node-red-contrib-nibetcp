import { EMPTY, from, MonoTypeOperatorFunction } from "rxjs";
import {
  concatMap,
  tap,
  mergeMap,
  catchError,
  toArray,
  scan,
  skip,
  repeat,
  map,
  filter,
} from "rxjs/operators";
import { Nibe } from "./communication/nibe";
import { RegisterDefinition, RegisterValue } from "./communication/types";

const IGNORE = [42176, 33224, 33304, 33344, 33624];
Nibe.createTcp("tcp://NIBE-06545022180002.local:502", "./registers.csv")
  .pipe(
    concatMap((n) =>
      n.registers$.pipe(
        tap(() => console.log(`scan start`)),
        concatMap((regs) => {
          const start = new Date().getTime();
          return readAllRegisters(n, regs).pipe(
            map((values) => {
              return {
                values,
                seconds: Math.round((new Date().getTime() - start) / 100) / 10,
              };
            })
          );
        }),
        tap(({ values, seconds }) =>
          console.log(
            `scan done, read ${values.length} values in ${seconds} sec`
          )
        ),
        map(({ values }) => values),
        repeat({ delay: 5000 })
      )
    ),
    keepOnlyChangedValues(),
    tap((changedValues) => {
      for (const value of changedValues) {
        console.log(`'${value.label}' changed to ${value.formatted}`);
      }
    })
  )
  .subscribe();

function readAllRegisters(nibe: Nibe, regs: RegisterDefinition[]) {
  return from(regs).pipe(
    filter((reg) => !IGNORE.includes(reg.address)),
    mergeMap(
      (reg) =>
        nibe.readRegister(reg.address, 1000).pipe(
          catchError((err) => {
            console.warn(`failed reading ${reg.address}: ${err}`);
            return EMPTY;
          })
        ),
      20
    ),
    toArray()
  );
}

function keepOnlyChangedValues(): MonoTypeOperatorFunction<RegisterValue[]> {
  return (source) =>
    source.pipe(
      scan(
        (ctx, currentValues) => {
          ctx.changes = [];
          for (const current of currentValues) {
            const lastIndex = ctx.lastValues.findIndex(
              (v) => v.label === current.label
            );
            if (lastIndex >= 0) {
              const last = ctx.lastValues[lastIndex];
              if (last.value !== current.value) {
                ctx.changes.push(current);
              }
              ctx.lastValues.splice(lastIndex, 1);
            }
          }
          ctx.lastValues.push(...currentValues);
          return ctx;
        },
        {
          lastValues: [],
          changes: [],
        } as {
          lastValues: RegisterValue[];
          changes: RegisterValue[];
        }
      ),
      skip(1),
      map((v) => v.changes)
    );
}
