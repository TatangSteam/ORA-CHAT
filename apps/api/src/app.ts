import express, { type Express } from 'express';
import { healthResponseSchema } from '@raho/contracts';

export const createApp = (): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.get('/health/live', (_request, response) => {
    response.json(
      healthResponseSchema.parse({
        service: 'api',
        status: 'live'
      })
    );
  });
  return app;
};
