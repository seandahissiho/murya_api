// i18n/upsert.ts

import {prisma} from "../config/db";

export async function upsertTranslationRow(input: {
    entity: string;
    entityId: string;
    field: string;
    langCode: string;
    value: string;
}) {
    const { entity, entityId, field, langCode, value } = input;
    return prisma.translation.upsert({
        where: {
            entity_entityId_field_langCode: {
                entity,
                entityId,
                field,
                langCode,
            },
        },
        update: {
            value,
        },
        create: {
            entity,
            entityId,
            field,
            langCode,
            value,
        },
    });
}

export async function upsertTranslationsBulk(
    rows: { entity: string; entityId: string; field: string; langCode: string; value: string }[]
) {
    return prisma.$transaction(
        rows.map(r =>
            prisma.translation.upsert({
                where: {
                    entity_entityId_field_langCode: {
                        entity: r.entity,
                        entityId: r.entityId,
                        field: r.field,
                        langCode: r.langCode,
                    },
                },
                update: { value: r.value },
                create: { entity: r.entity, entityId: r.entityId, field: r.field, langCode: r.langCode, value: r.value },
            })
        )
    );
}
