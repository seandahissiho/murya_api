export async function detectLanguage(req: any) {
    const headerLang = req.headers['accept-language']?.split(',')[0]?.slice(0, 2);
    const userLang = req.user?.preferredLangCode;
    const defaultLang = 'fr';
    return headerLang || userLang || defaultLang;
}
