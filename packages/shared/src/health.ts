import { z } from 'zod';

export const ThermalStateSchema = z.enum(['nominal', 'fair', 'serious', 'critical']);

export const HealthSchema = z.object({
  ok: z.literal(true),
  app: z.string(),
  version: z.string(),
  protocol: z.number().int(),
  device: z.object({
    model: z.string(),
    ios: z.string(),
    name: z.string(),
  }),
  streaming: z.boolean(),
  battery: z.number().min(0).max(1),
  thermalState: ThermalStateSchema,
});

export type ThermalState = z.infer<typeof ThermalStateSchema>;
export type Health = z.infer<typeof HealthSchema>;
