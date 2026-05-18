import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { authConfigured, config } from '~/lib/config';
import { logger } from '~/lib/logger';
import { errorHandler } from '~/middleware/errors';
import { notFoundHandler } from '~/middleware/notFound';
import { healthRouter } from '~/routes/health';
import { meRouter } from '~/routes/me';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

app.use('/api/health', healthRouter);
app.use('/api/me', meRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV, authConfigured },
    'innsyn backend listening',
  );
  if (!authConfigured) {
    logger.warn(
      'Entra ikke konfigurert — GET /api/me returnerer 503 inntil AUTH_TENANT_ID og AUTH_AUDIENCE settes i .env',
    );
  }
});
