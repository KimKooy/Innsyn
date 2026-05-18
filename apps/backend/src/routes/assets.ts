import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '~/middleware/auth';
import { ValidationError } from '~/middleware/errors';
import { prisma } from '~/lib/prisma';
import {
  createAsset,
  getDownloadUrl,
  listAssetsForScene,
  softDeleteAsset,
} from '~/services/asset-service';

export const assetsRouter = Router();

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

const createAssetBody = z.object({
  sceneId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  position: positionSchema,
});

assetsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = createAssetBody.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid asset payload', parsed.error.flatten());
    }
    if (!req.user) throw new Error('auth middleware did not populate req.user');
    // Resolve User.id from Entra oid — uploadedBy is the DB PK.
    const user = await prisma.user.findUnique({
      where: { entraOid: req.user.oid },
      select: { id: true },
    });
    if (!user) throw new ValidationError('User not provisioned');
    const result = await createAsset(parsed.data, user.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

assetsRouter.get('/scene/:sceneId', requireAuth, async (req, res, next) => {
  try {
    const sceneId = z.string().min(1).max(64).parse(req.params.sceneId);
    const assets = await listAssetsForScene(sceneId);
    res.json({ assets });
  } catch (err) {
    next(err);
  }
});

assetsRouter.get('/:id/download-url', requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const result = await getDownloadUrl(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

assetsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    await softDeleteAsset(id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
