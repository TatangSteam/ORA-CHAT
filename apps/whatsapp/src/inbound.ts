import type { InboundMessage, InboundSink } from './adapter.js';

export class InternalApiInboundSink {
  public constructor(
    private readonly token: string,
    private readonly endpoint = process.env.API_INTERNAL_URL ??
      'http://api:4000/internal/v1/whatsapp/inbound'
  ) {}

  public readonly send: InboundSink = async (message: InboundMessage) => {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) throw new Error(`Inbound API rejected event with status ${response.status}`);
  };
}
