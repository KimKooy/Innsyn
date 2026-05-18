import { PrismaClient } from '@prisma/client';
import { config } from './config';

export const prisma = new PrismaClient({
  log: config.LOG_LEVEL === 'debug' ? ['query', 'error', 'warn'] : ['error', 'warn'],
});
