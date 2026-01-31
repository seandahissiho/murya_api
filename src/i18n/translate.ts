// i18n/translate.ts

import {prisma} from "../config/db";

export async function resolveField({
                                       entity,
                                       entityId,
                                       field,
                                       langs,
                                       baseValue,
                                   }: {
    entity: string;
    entityId: string;
    field: string;
    langs: string[];
    baseValue?: string | null;
}): Promise<string | null> {
    const rows = await prisma.translation.findMany({
        where: {
            entity,
            entityId,
            field,
            langCode: { in: langs },
        },
        select: { langCode: true, value: true },
    });

    const byLang = new Map(rows.map(r => [r.langCode, r.value]));
    for (const l of langs) {
        const v = byLang.get(l);
        if (v !== undefined) {
            return v;
        }
    }
    return baseValue ?? null;
}

export async function resolveFields({
                                        entity,
                                        entityId,
                                        fields,
                                        lang,
                                        base,
                                    }: {
    entity: string;
    entityId: string;
    fields: string[];
    lang: string;
    base: Record<string, any>;
}) {
    const translations = await prisma.translation.findMany({
        where: {
            entity,
            entityId,
            langCode: lang,
            field: { in: fields },
        },
    });

    const result = { ...base };
    for (const field of fields) {
        const tr = translations.find((t) => t.field === field);
        if (tr) result[field] = tr.value;
    }

    return result;
}

export async function getTranslationsMap(input: {
    entity: string;
    entityIds: string[];
    fields: string[];
    lang: string;
}) {
    const { entity, entityIds, fields, lang } = input;
    const map = new Map<string, string>();
    if (!entityIds.length || !fields.length || !lang) {
        return map;
    }

    const rows = await prisma.translation.findMany({
        where: {
            entity,
            entityId: { in: entityIds },
            field: { in: fields },
            langCode: lang,
        },
        select: { entityId: true, field: true, value: true },
    });

    for (const row of rows) {
        map.set(`${row.entityId}::${row.field}`, row.value);
    }

    return map;
}
