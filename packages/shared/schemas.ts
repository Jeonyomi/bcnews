import { z } from "zod";

// ---- Auth ----
export const ApiKeyHeaderSchema = z
  .string()
  .regex(/^Bearer\s+.+$/, "Authorization must be 'Bearer <API_KEY>'");

// ---- News ----
export const NewsBriefSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(), // ISO
  contentMd: z.string(),
  // Accept any string for forward-compat (we may add more sources like 'local-test', 'import', etc.)
  source: z.string().default("cron"),
});
export type NewsBrief = z.infer<typeof NewsBriefSchema>;

export const NewsListResponseSchema = z.object({
  items: z.array(NewsBriefSchema),
  nextCursor: z.string().nullable().optional(),
});

// ---- Metrics ----
export const ChainIdSchema = z.literal(1); // Ethereum-only MVP

export const TokenRefSchema = z.object({
  chainId: ChainIdSchema,
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  symbol: z.string(),
  decimals: z.number().int().nonnegative(),
});

export const HourlyMetricSchema = z.object({
  bucketStart: z.string(), // ISO
  chainId: ChainIdSchema,
  tokenAddress: TokenRefSchema.shape.address,
  supply: z.string().optional(),
  mintAmount: z.string(),
  burnAmount: z.string(),
  transferAmount: z.string(),
  transferCount: z.number().int().nonnegative(),
  uniqueSenders: z.number().int().nonnegative(),
  uniqueReceivers: z.number().int().nonnegative(),
});

export const MetricsHourlyResponseSchema = z.object({
  items: z.array(HourlyMetricSchema),
});

export const MetricsLatestResponseSchema = z.object({
  chainId: ChainIdSchema,
  tokenAddress: TokenRefSchema.shape.address,
  asOf: z.string(),
  supply: z.string().optional(),
  depegBps: z.number().optional(),
});

// ---- Health ----
export const HealthResponseSchema = z.object({ ok: z.literal(true) });

export const IndexerStatusSchema = z.object({
  chainId: ChainIdSchema,
  lastFinalizedBlock: z.number().int().nonnegative(),
  updatedAt: z.string(),
  lagBlocks: z.number().int().nonnegative(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string()).optional(),
  }),
});
