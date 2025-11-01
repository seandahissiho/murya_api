import {Request, Response, NextFunction} from "express";

// Convert dates to UTC timezone

function toLocalISOString(date: Date | string): string {
    // Convert the input to a Date object if it's a string
    const dateObj = date instanceof Date ? date : new Date(date);
    if (!dateObj) throw new Error("Invalid date");
    // check if the date is a valid date
    if (isNaN(dateObj.getTime())) {
        throw new Error("Invalid date");
    }
    return dateObj.toISOString();
}

function parseDateIgnoringTimezone(date: string | Date): Date {
    // Convert the input to a string if it's a Date object
    const dateString = date instanceof Date ? date.toISOString() : date;
    // Parse the input date string without applying the local timezone
    const parts = dateString.replace(/\.000Z/g, '').split(/[-T:]/);

    // Construct a Date object as if it were UTC
    return new Date(Date.UTC(
        Number(parts[0]), // Year
        Number(parts[1]) - 1, // Month (0-based)
        Number(parts[2]), // Day
        Number(parts[3] || '0'), // Hours
        Number(parts[4] || '0'), // Minutes
        Number(parts[5] || '0') // Seconds
    ));
}


/**
 * Checks if a given string is a valid ISO-8601 date string.
 *
 * @param value - The string to validate.
 * @returns `true` if the string matches the ISO-8601 format, `false` otherwise.
 */
function isISODateString(value: string): boolean {
    // Explanation of this pattern:
    // 1) Mandatory date portion: YYYY-MM-DD
    // 2) Optional time portion: [T| ]HH:mm:ss
    //    - The time portion may begin with 'T' or a single space.
    // 3) Optional milliseconds: .ddd
    // 4) Optional timezone: Z or ±HH:MM (the colon in offset is optional)
    //
    // Note: This pattern is fairly permissive: it allows either
    // "2024-12-15T00:00:00.000Z" or "2024-12-15 00:00:00.000" or even
    // "2024-12-15T00:00:00.000+0200".
    const isoDatePattern = new RegExp(
        '^' +
        '\\d{4}-\\d{2}-\\d{2}' +                 // 1) YYYY-MM-DD
        '(?:' +                                 //    start optional time part
        '[ T]' +                              //    [T or space]
        '\\d{2}:\\d{2}:\\d{2}' +              //    HH:mm:ss
        '(?:\\.\\d+)?' +                      //    optional .milliseconds
        '(?:Z|[+\\-]\\d{2}:?\\d{2})?' +       //    optional Z or ±HH[:]mm
        ')?' +
        '$'
    );

    return isoDatePattern.test(value);
}


function isValidISODateString(value: string): boolean {
    const date = new Date(value);
    return !isNaN(date.getTime()) && isISODateString(value);
}


function convertDates(obj: any): any {
    if (obj && typeof obj === "object") {
        if (Array.isArray(obj)) {
            return obj.map((item) => convertDates(item));
        } else {
            for (const key in obj) {
                if (typeof obj[key] === "string" && isValidISODateString(obj[key])) {
                    const date = parseDateIgnoringTimezone(obj[key]);
                    if (!isNaN(date.getTime())) {
                        obj[key] = toLocalISOString(date);
                    }
                } else if (typeof obj[key] === "object") {
                    obj[key] = convertDates(obj[key]);
                }
            }
        }
    }
    return obj;
}

export function parseDateStrings(req: Request, res: Response, next: NextFunction) {
    if (req.body && typeof req.body === "object") {
        req.body = convertDates(req.body);
    }
    next();
}
