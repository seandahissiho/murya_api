import crypto from "crypto";

const VOUCHER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const generateVoucherCode = (prefix = "MURYA", size = 6) => {
    const bytes = crypto.randomBytes(size);
    let result = "";
    for (let i = 0; i < size; i += 1) {
        result += VOUCHER_ALPHABET[bytes[i] % VOUCHER_ALPHABET.length];
    }
    return `${prefix}-${result}`;
};
