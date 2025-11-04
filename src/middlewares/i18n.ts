import {prisma} from "../config/db";

export async function detectLanguage(req: any) {
    const userLang = req.user?.preferredLangCode;
    const headerLang = req.headers['accept-language']?.split(',')[0]?.slice(0, 2);
    const defaultLang = (await prisma.language.findFirst({ where: { isDefault: true } }))?.code || 'en';
    return userLang || headerLang || defaultLang;
}
