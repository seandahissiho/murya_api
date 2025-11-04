// i18n/langChain.ts
export function parseAcceptLanguage(header?: string): string[] {
    if (!header) return [];
    return header
        .split(',')
        .map(p => p.split(';')[0].trim())
        .filter(Boolean);
}

export function buildLangChain({
                                   userPref,
                                   acceptLanguageHeader,
                                   systemDefault = 'en',
                               }: {
    userPref?: string | null;
    acceptLanguageHeader?: string;
    systemDefault?: string;
}) {
    const headerLangs = parseAcceptLanguage(acceptLanguageHeader);
    const chain = [
        ...(userPref ? [userPref] : []),
        ...headerLangs,
        systemDefault,
    ];
    return Array.from(new Set(chain));
}
