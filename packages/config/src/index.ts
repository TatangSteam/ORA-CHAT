import { z } from 'zod';

const apiPortSchema = z.coerce.number().int().min(1).max(65_535);

export const apiPort = apiPortSchema.parse(process.env.API_PORT ?? 4000);
