WITH target_tenant AS (
  SELECT id, slug
  FROM tenants
  WHERE slug = :'tenant_slug'
), seed_categories AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', category.id,
        'name', category.name,
        'parentId', category.parent_id,
        'slug', category.slug
      )
      ORDER BY category.parent_id NULLS FIRST, category.name, category.id
    ),
    '[]'::jsonb
  ) AS value
  FROM knowledge_categories category
  JOIN target_tenant tenant ON tenant.id = category.tenant_id
), seed_items AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'categoryId', item.category_id,
        'currentVersionId', item.current_version_id,
        'id', item.id,
        'publishedVersionId', item.published_version_id,
        'revision', item.revision,
        'status', item.status,
        'title', item.title,
        'versions', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'answer', version.answer,
              'approvedAt', version.approved_at,
              'archivedAt', version.archived_at,
              'contentHash', version.content_hash,
              'id', version.id,
              'publishedAt', version.published_at,
              'questionVariants', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', variant.id,
                    'normalizedQuestion', variant.normalized_question,
                    'question', variant.question
                  )
                  ORDER BY variant.normalized_question, variant.id
                )
                FROM knowledge_question_variants variant
                WHERE variant.item_version_id = version.id
              ), '[]'::jsonb),
              'status', version.status,
              'version', version.version
            )
            ORDER BY version.version, version.id
          )
          FROM knowledge_item_versions version
          WHERE version.item_id = item.id
        ), '[]'::jsonb)
      )
      ORDER BY item.title, item.id
    ),
    '[]'::jsonb
  ) AS value
  FROM knowledge_items item
  JOIN target_tenant tenant ON tenant.id = item.tenant_id
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'schemaVersion', 1,
    'sourceTenantSlug', (SELECT slug FROM target_tenant),
    'categories', seed_categories.value,
    'items', seed_items.value
  )
)
FROM seed_categories, seed_items;
