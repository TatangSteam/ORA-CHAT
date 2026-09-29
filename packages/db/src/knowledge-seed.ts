import knowledgeSeed from './knowledge-seed-data.json' with { type: 'json' };

import { createDatabaseClient } from './prisma.js';

type SeedCategory = {
  id: string;
  name: string;
  parentId: string | null;
  slug: string;
};

type SeedQuestionVariant = {
  id: string;
  normalizedQuestion: string;
  question: string;
};

type SeedVersion = {
  answer: string;
  approvedAt: string | null;
  archivedAt: string | null;
  contentHash: string;
  id: string;
  publishedAt: string | null;
  questionVariants: SeedQuestionVariant[];
  status: string;
  version: number;
};

type SeedItem = {
  categoryId: string | null;
  currentVersionId: string;
  id: string;
  publishedVersionId: string | null;
  revision: number;
  status: string;
  title: string;
  versions: SeedVersion[];
};

type KnowledgeSeed = {
  categories: SeedCategory[];
  items: SeedItem[];
  schemaVersion: number;
  sourceTenantSlug: string;
};

const seed = knowledgeSeed as KnowledgeSeed;
const tenantSlug = (process.env.KNOWLEDGE_SEED_TENANT_SLUG ?? 'default').trim().toLowerCase();
const prisma = createDatabaseClient();

try {
  if (seed.schemaVersion !== 1) throw new Error('Unsupported knowledge seed schema version');
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant '${tenantSlug}' does not exist; run db:bootstrap first`);

  const result = await prisma.$transaction(async (tx) => {
    const categoryIds = new Map<string, string>();

    for (const category of seed.categories) {
      const stored = await tx.knowledgeCategory.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: category.slug } },
        update: { name: category.name },
        create: {
          id: category.id,
          tenantId: tenant.id,
          name: category.name,
          slug: category.slug
        }
      });
      categoryIds.set(category.id, stored.id);
    }

    for (const category of seed.categories) {
      let parentId: string | null = null;
      if (category.parentId) {
        const mappedParentId = categoryIds.get(category.parentId);
        if (!mappedParentId) {
          throw new Error(`Missing parent category mapping for '${category.name}'`);
        }
        parentId = mappedParentId;
      }
      await tx.knowledgeCategory.update({
        where: { tenantId_slug: { tenantId: tenant.id, slug: category.slug } },
        data: { parentId }
      });
    }

    let versions = 0;
    let questionVariants = 0;
    for (const item of seed.items) {
      const categoryId = item.categoryId ? categoryIds.get(item.categoryId) : undefined;
      if (item.categoryId && !categoryId) {
        throw new Error(`Missing category mapping for knowledge item '${item.title}'`);
      }

      const existing = await tx.knowledgeItem.findUnique({ where: { id: item.id } });
      if (existing && existing.tenantId !== tenant.id) {
        throw new Error(`Knowledge item ID collision for '${item.title}'`);
      }
      await tx.knowledgeItem.upsert({
        where: { id: item.id },
        update: { categoryId: categoryId ?? null, title: item.title },
        create: {
          id: item.id,
          tenantId: tenant.id,
          categoryId: categoryId ?? null,
          title: item.title,
          status: 'draft'
        }
      });

      for (const version of item.versions) {
        const existingVersion = await tx.knowledgeItemVersion.findUnique({
          where: { id: version.id }
        });
        if (existingVersion && existingVersion.itemId !== item.id) {
          throw new Error(`Knowledge version ID collision for '${item.title}' v${version.version}`);
        }
        await tx.knowledgeItemVersion.upsert({
          where: { id: version.id },
          update: {
            answer: version.answer,
            approvedAt: version.approvedAt,
            archivedAt: version.archivedAt,
            contentHash: version.contentHash,
            publishedAt: version.publishedAt,
            status: version.status
          },
          create: {
            id: version.id,
            tenantId: tenant.id,
            itemId: item.id,
            version: version.version,
            answer: version.answer,
            approvedAt: version.approvedAt,
            archivedAt: version.archivedAt,
            contentHash: version.contentHash,
            publishedAt: version.publishedAt,
            status: version.status
          }
        });
        versions += 1;

        for (const variant of version.questionVariants) {
          await tx.knowledgeQuestionVariant.upsert({
            where: {
              itemVersionId_normalizedQuestion: {
                itemVersionId: version.id,
                normalizedQuestion: variant.normalizedQuestion
              }
            },
            update: { question: variant.question },
            create: {
              id: variant.id,
              tenantId: tenant.id,
              itemVersionId: version.id,
              question: variant.question,
              normalizedQuestion: variant.normalizedQuestion
            }
          });
          questionVariants += 1;
        }
      }

      await tx.knowledgeItem.update({
        where: { id: item.id },
        data: {
          categoryId: categoryId ?? null,
          title: item.title,
          currentVersionId: item.currentVersionId,
          publishedVersionId: item.publishedVersionId,
          status: item.status,
          revision: item.revision
        }
      });
    }

    return {
      categories: seed.categories.length,
      items: seed.items.length,
      questionVariants,
      tenantId: tenant.id,
      tenantSlug,
      versions
    };
  });

  process.stdout.write(`${JSON.stringify({ status: 'ok', ...result })}\n`);
} finally {
  await prisma.$disconnect();
}
