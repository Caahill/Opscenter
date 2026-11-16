import { Controller, Get, Injectable } from '@nestjs/common';
import { alt, defineDto, label, maskBody, present, viewerClasses } from '@opshub/policy';
import { Authenticated, CurrentViewer } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { CryptoService, type Sealed } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_BILLING, DEMO_CLIENT, DEMO_CONTACTS, DEMO_LEAVE, DEMO_MESSAGE } from './preview-fixture';

const ClientPreviewDto = defineDto('Client', {
  companyName: 'client.companyName',
  website: 'client.website',
  contractValue: 'client.contractValue',
  taxId: 'client.taxId',
});
const ContactPreviewDto = defineDto('Contact', {
  id: 'contact.id',
  role: 'contact.role',
  label: 'contact.label',
  name: 'contact.name',
  email: 'contact.email',
  phone: 'contact.phone',
});
const MessagePreviewDto = defineDto('Communication', {
  id: 'communication.id',
  from: 'communication.from',
  body: 'communication.body',
});
const BillingPreviewDto = defineDto('BillingRequest', {
  id: 'billingRequest.id',
  reason: 'billingRequest.reason',
  amount: 'billingRequest.amount',
  currency: 'billingRequest.currency',
});
const LeavePreviewDto = defineDto('Leave', {
  id: 'leave.id',
  userName: 'leave.userName',
  startDate: 'leave.startDate',
  endDate: 'leave.endDate',
  reason: 'leave.reason',
});
const PolicyPreviewDto = defineDto('PolicyPreview', {
  viewerClasses: 'policyPreview.viewerClasses',
  client: 'policyPreview.client',
  contacts: 'policyPreview.contacts',
  message: 'policyPreview.message',
  billingRequest: 'policyPreview.billingRequest',
  leave: 'policyPreview.leave',
});

interface SealedFixture {
  taxId: Sealed;
  contacts: Array<{ name: Sealed; email: Sealed; phone: Sealed }>;
  messageFrom: Sealed;
  messageBody: Sealed;
  bodyMasked: string;
  leaveReason: Sealed;
}

/**
 * Dev only: one invented Demo Co record served through the real Policy Serializer, so each seed
 * role can see what masking does to it. Values are stored encrypted, as real records will be.
 */
@Injectable()
export class PolicyPreviewService {
  private sealed: Promise<SealedFixture> | null = null;

  constructor(
    private readonly crypto: CryptoService,
    private readonly prisma: PrismaService,
  ) {}

  private seal(): Promise<SealedFixture> {
    const enc = (v: string) => this.crypto.encrypt(v, 'pii');
    this.sealed ??= (async () => ({
      taxId: await enc(DEMO_CLIENT.taxId),
      contacts: await Promise.all(
        DEMO_CONTACTS.map(async (c) => ({ name: await enc(c.name), email: await enc(c.email), phone: await enc(c.phone) })),
      ),
      messageFrom: await enc(DEMO_MESSAGE.from),
      messageBody: await enc(DEMO_MESSAGE.body),
      // Computed once at "ingest", as TechSpec 5.4 requires.
      bodyMasked: maskBody(DEMO_MESSAGE.body),
      leaveReason: await enc(DEMO_LEAVE.reason),
    }))();
    return this.sealed;
  }

  async build(viewer: AuthedViewer) {
    const s = await this.seal();
    const pm = await this.prisma.user.findUnique({ where: { email: 'pm@dev.local' }, select: { id: true } });
    const clientPmId = pm?.id ?? 'unassigned';
    const decrypt = (sealed: Sealed) => () => this.crypto.decrypt(sealed);
    const contactLabel = (c: (typeof DEMO_CONTACTS)[number]) => label(DEMO_CLIENT.companyName, c.label);

    return present(PolicyPreviewDto, {
      viewerClasses: viewerClasses(viewer, { clientPmId }),
      client: present(
        ClientPreviewDto,
        {
          companyName: DEMO_CLIENT.companyName,
          website: DEMO_CLIENT.website,
          contractValue: DEMO_CLIENT.contractValue,
          taxId: alt({ full: decrypt(s.taxId) }),
        },
        { clientPmId, entityId: DEMO_CLIENT.id },
      ),
      contacts: DEMO_CONTACTS.map((c, i) =>
        present(
          ContactPreviewDto,
          {
            id: c.id,
            role: c.role,
            label: contactLabel(c),
            name: alt({ full: decrypt(s.contacts[i]!.name) }),
            email: alt({ full: decrypt(s.contacts[i]!.email) }),
            phone: alt({ full: decrypt(s.contacts[i]!.phone) }),
          },
          { clientPmId, contactRole: c.role, entityId: c.id, label: contactLabel(c) },
        ),
      ),
      message: present(
        MessagePreviewDto,
        {
          id: DEMO_MESSAGE.id,
          from: alt({ full: decrypt(s.messageFrom) }),
          body: alt({ full: decrypt(s.messageBody), masked: s.bodyMasked }),
        },
        { clientPmId, entityId: DEMO_MESSAGE.id, label: contactLabel(DEMO_CONTACTS[0]) },
      ),
      billingRequest: present(BillingPreviewDto, { ...DEMO_BILLING }, { clientPmId, entityId: DEMO_BILLING.id }),
      leave: present(
        LeavePreviewDto,
        {
          id: DEMO_LEAVE.id,
          userName: DEMO_LEAVE.userName,
          startDate: DEMO_LEAVE.startDate,
          endDate: DEMO_LEAVE.endDate,
          reason: alt({ full: decrypt(s.leaveReason) }),
        },
        { entityId: DEMO_LEAVE.id },
      ),
    });
  }
}

@Controller('dev')
export class PolicyPreviewController {
  constructor(private readonly preview: PolicyPreviewService) {}

  /** Field rules alone decide what each role sees here, so every signed-in role may call it. */
  @Get('policy-preview')
  @Authenticated()
  get(@CurrentViewer() viewer: AuthedViewer) {
    return this.preview.build(viewer);
  }
}
