/**
 * Durable storage-domain declaration for the learned component library.
 * @module @deepseek-ai/dsh-component-library/src/spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { ComponentRecord } from './types.ts'

/** Runtime schema for one component record. */
export const componentRecordSchema: z.ZodType<ComponentRecord> = z.object({
  id: z.string().min(1),
  pkg: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  props: z.array(z.object({
    name: z.string().min(1),
    type: z.string(),
    required: z.boolean(),
  })),
  tokens: z.array(z.string()),
  jsdoc: z.string(),
  example: z.string(),
  origin: z.union([z.literal('scanned'), z.literal('model')]),
  propsInferred: z.boolean(),
  rawProps: z.string(),
  reviewed: z.boolean(),
  updatedAt: z.number().int().nonnegative(),
})

/** One table of every learned component, keyed by `<package directory>/<name>`. */
export const componentLibraryDomainSpec = defineDomain({
  name: 'component_library',
  version: 0,
  tables: {
    components: domainTable<string, ComponentRecord>(componentRecordSchema),
  },
})
