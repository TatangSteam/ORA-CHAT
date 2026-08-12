import type {
  MessageTemplateSelection,
  TemplateVariableName,
  TemplateVersionInput
} from '@raho/contracts';
import { generateUuidV7, type Prisma, type PrismaClient } from '@raho/db';

type ChecklistSource = { id: string; sequence: number; label: string; required: boolean };

const audit = (
  tenantId: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  requestId: string,
  reason?: string,
  metadata: Prisma.InputJsonValue = {}
) => ({
  id: generateUuidV7(),
  tenantId,
  actorUserId,
  action,
  entityType,
  entityId,
  requestId,
  ...(reason ? { reason } : {}),
  metadata
});

export const renderMessageTemplate = (
  body: string,
  variableSchema: TemplateVariableName[],
  variables: Partial<Record<TemplateVariableName, string>>,
  checklist: ChecklistSource[],
  checkedById: ReadonlyMap<string, boolean> = new Map()
) => {
  for (const name of variableSchema) {
    if (!(name in variables)) throw new Error('TEMPLATE_VARIABLE_REQUIRED');
  }
  let rendered = body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gu, (_token, name: TemplateVariableName) => {
    if (!variableSchema.includes(name)) throw new Error('TEMPLATE_VARIABLE_INVALID');
    return variables[name] ?? '';
  });
  if (checklist.length > 0) {
    rendered += `\n\n${checklist
      .toSorted((left, right) => left.sequence - right.sequence)
      .map((item) => `${checkedById.get(item.id) ? '☑' : '☐'} ${item.label}`)
      .join('\n')}`;
  }
  if (rendered.length > 4096) throw new Error('TEMPLATE_RENDER_TOO_LONG');
  return rendered;
};

const versionData = (
  tenantId: string,
  templateId: string,
  version: number,
  actorUserId: string,
  input: TemplateVersionInput
) => ({
  id: generateUuidV7(),
  tenantId,
  templateId,
  version,
  body: input.body,
  variableSchema: input.variableSchema,
  createdByUserId: actorUserId,
  checklistItems: {
    create: input.checklist.map((item) => ({
      id: generateUuidV7(),
      tenantId,
      sequence: item.sequence,
      label: item.label,
      required: item.required
    }))
  }
});

export class PrismaTemplateRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(
    tenantId: string,
    query: {
      cursor?: string | undefined;
      limit: number;
      status?: string | undefined;
      search?: string | undefined;
    }
  ) {
    const rows = await this.prisma.messageTemplate.findMany({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {})
      },
      include: {
        versions: {
          include: { checklistItems: { orderBy: { sequence: 'asc' } } },
          orderBy: { version: 'desc' }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  public get(tenantId: string, id: string) {
    return this.prisma.messageTemplate.findFirst({
      where: { id, tenantId },
      include: {
        versions: {
          include: { checklistItems: { orderBy: { sequence: 'asc' } } },
          orderBy: { version: 'desc' }
        }
      }
    });
  }

  public async create(input: {
    tenantId: string;
    actorUserId: string;
    requestId: string;
    name: string;
    category: string;
    version: TemplateVersionInput;
    sourceTemplateId?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const templateId = generateUuidV7();
      await tx.messageTemplate.create({
        data: {
          id: templateId,
          tenantId: input.tenantId,
          name: input.name,
          category: input.category,
          createdByUserId: input.actorUserId
        }
      });
      await tx.messageTemplateVersion.create({
        data: versionData(input.tenantId, templateId, 1, input.actorUserId, input.version)
      });
      await tx.auditLog.create({
        data: audit(
          input.tenantId,
          input.actorUserId,
          input.sourceTemplateId ? 'message_template.duplicated' : 'message_template.created',
          'MessageTemplate',
          templateId,
          input.requestId,
          undefined,
          {
            name: input.name,
            version: 1,
            ...(input.sourceTemplateId ? { sourceTemplateId: input.sourceTemplateId } : {})
          }
        )
      });
      return tx.messageTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: { versions: { include: { checklistItems: true } } }
      });
    });
  }

  public async createVersion(input: {
    tenantId: string;
    templateId: string;
    actorUserId: string;
    requestId: string;
    expectedVersion: number;
    version: TemplateVersionInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.messageTemplate.findFirst({
        where: { id: input.templateId, tenantId: input.tenantId }
      });
      if (!template) throw new Error('TEMPLATE_NOT_FOUND');
      if (template.status === 'archived') throw new Error('TEMPLATE_ARCHIVED');
      if (template.currentVersion !== input.expectedVersion) throw new Error('REVISION_CONFLICT');
      const nextVersion = template.currentVersion + 1;
      const changed = await tx.messageTemplate.updateMany({
        where: {
          id: template.id,
          tenantId: input.tenantId,
          currentVersion: input.expectedVersion
        },
        data: { currentVersion: nextVersion }
      });
      if (changed.count !== 1) throw new Error('REVISION_CONFLICT');
      const version = await tx.messageTemplateVersion.create({
        data: versionData(
          input.tenantId,
          template.id,
          nextVersion,
          input.actorUserId,
          input.version
        ),
        include: { checklistItems: { orderBy: { sequence: 'asc' } } }
      });
      await tx.auditLog.create({
        data: audit(
          input.tenantId,
          input.actorUserId,
          'message_template.version.created',
          'MessageTemplateVersion',
          version.id,
          input.requestId,
          undefined,
          { templateId: template.id, version: nextVersion }
        )
      });
      return version;
    });
  }

  public async publish(input: {
    tenantId: string;
    templateId: string;
    actorUserId: string;
    requestId: string;
    expectedVersion: number;
    reason: string;
    now: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.messageTemplate.findFirst({
        where: { id: input.templateId, tenantId: input.tenantId }
      });
      if (!template) throw new Error('TEMPLATE_NOT_FOUND');
      if (template.status === 'archived') throw new Error('TEMPLATE_ARCHIVED');
      if (template.currentVersion !== input.expectedVersion) throw new Error('REVISION_CONFLICT');
      const version = await tx.messageTemplateVersion.findFirst({
        where: {
          tenantId: input.tenantId,
          templateId: template.id,
          version: input.expectedVersion
        }
      });
      if (!version) throw new Error('TEMPLATE_VERSION_NOT_FOUND');
      if (version.status !== 'draft') throw new Error('TEMPLATE_VERSION_NOT_DRAFT');
      await tx.messageTemplateVersion.updateMany({
        where: { tenantId: input.tenantId, templateId: template.id, status: 'published' },
        data: { status: 'retired' }
      });
      const published = await tx.messageTemplateVersion.update({
        where: { id: version.id },
        data: {
          status: 'published',
          publishedByUserId: input.actorUserId,
          publishedAt: input.now
        },
        include: { checklistItems: { orderBy: { sequence: 'asc' } } }
      });
      await tx.auditLog.create({
        data: audit(
          input.tenantId,
          input.actorUserId,
          'message_template.version.published',
          'MessageTemplateVersion',
          version.id,
          input.requestId,
          input.reason,
          { templateId: template.id, version: version.version }
        )
      });
      return published;
    });
  }

  public async duplicate(input: {
    tenantId: string;
    sourceId: string;
    actorUserId: string;
    requestId: string;
    name: string;
  }) {
    const source = await this.prisma.messageTemplate.findFirst({
      where: { id: input.sourceId, tenantId: input.tenantId }
    });
    if (!source) throw new Error('TEMPLATE_NOT_FOUND');
    const latest = await this.prisma.messageTemplateVersion.findFirst({
      where: { tenantId: input.tenantId, templateId: source.id, version: source.currentVersion },
      include: { checklistItems: { orderBy: { sequence: 'asc' } } }
    });
    if (!latest) throw new Error('TEMPLATE_VERSION_NOT_FOUND');
    return this.create({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      requestId: input.requestId,
      name: input.name,
      category: source.category,
      sourceTemplateId: source.id,
      version: {
        body: latest.body,
        variableSchema: latest.variableSchema as TemplateVariableName[],
        checklist: latest.checklistItems.map(({ sequence, label, required }) => ({
          sequence,
          label,
          required
        }))
      }
    });
  }

  public async lifecycle(input: {
    tenantId: string;
    templateId: string;
    actorUserId: string;
    requestId: string;
    expectedVersion: number;
    status: 'active' | 'inactive' | 'archived';
    reason: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.messageTemplate.findFirst({
        where: { id: input.templateId, tenantId: input.tenantId }
      });
      if (!template) throw new Error('TEMPLATE_NOT_FOUND');
      if (template.currentVersion !== input.expectedVersion) throw new Error('REVISION_CONFLICT');
      if (template.status === 'archived') throw new Error('TEMPLATE_ARCHIVED');
      if (input.status === 'active') {
        const published = await tx.messageTemplateVersion.count({
          where: {
            tenantId: input.tenantId,
            templateId: template.id,
            version: template.currentVersion,
            status: 'published'
          }
        });
        if (published !== 1) throw new Error('TEMPLATE_NOT_PUBLISHED');
      }
      const updated = await tx.messageTemplate.update({
        where: { id: template.id },
        data: { status: input.status }
      });
      await tx.auditLog.create({
        data: audit(
          input.tenantId,
          input.actorUserId,
          `message_template.${input.status}`,
          'MessageTemplate',
          template.id,
          input.requestId,
          input.reason,
          { previousStatus: template.status, currentStatus: input.status }
        )
      });
      return updated;
    });
  }

  public async preview(tenantId: string, selection: Omit<MessageTemplateSelection, 'checklist'>) {
    const version = await this.prisma.messageTemplateVersion.findFirst({
      where: { id: selection.templateVersionId, tenantId },
      include: {
        template: true,
        checklistItems: { orderBy: { sequence: 'asc' } }
      }
    });
    if (!version) throw new Error('TEMPLATE_VERSION_NOT_FOUND');
    const renderedBody = renderMessageTemplate(
      version.body,
      version.variableSchema as TemplateVariableName[],
      selection.variables,
      version.checklistItems
    );
    return {
      templateId: version.templateId,
      templateVersionId: version.id,
      version: version.version,
      status: version.status,
      renderedBody,
      checklist: version.checklistItems.map((item) => ({ ...item, checked: false }))
    };
  }
}
