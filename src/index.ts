import { catchError, concat, concatMap, EMPTY, filter, mergeMap, switchMap } from 'rxjs';
import { Nibe } from './communication/nibe';

const address = 'tcp://NIBE-06545022180002.local:502';

/*
id:12802 - room setpoint (living)
id:12803 - room setpoint (night zone)
*/

Nibe.createTcp(address, './registers.csv')
    .pipe(
        // concatMap(n => n.registers$.pipe(
        //     concatMap(r => r),
        //     mergeMap(r => n.readRegister(r.label).pipe(catchError(() => EMPTY)), 5),
        // )),
        // filter(r => r.unit === '°C'),
        // filter(r => r.value === 23 || r.value === 22),
        switchMap(n => concat(
            // n.readRegister('id:12802'),
            // n.writeRegister('id:12802', 23),
            // n.readRegister('id:12802'),

            // n.readRegister('Hot water demand mode'),
            // n.writeRegister('Hot water demand mode', 0),
            // n.readRegister('Hot water demand mode'),

            n.writeRegister('Room sensor set point value climate system 2', 23),
            n.readRegister('Room sensor set point value climate system 2'),
            n.writeRegister('Room sensor set point value climate system 3', 22),
            n.readRegister('Room sensor set point value climate system 3'),

            n.writeRegister('Use room sensor climate system 2', 1),
            n.readRegister('Use room sensor climate system 2'),
            n.writeRegister('Use room sensor climate system 3', 1),
            n.readRegister('Use room sensor climate system 3'),


            // n.readRegister('id:12803'),
            // n.writeRegister('id:12803', 24.5),
        )),
    )
    .subscribe({
        next: (x) => console.log(x),
        complete: () => console.log('complete!'),
    });
