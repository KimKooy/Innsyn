import { Router } from 'express';
import { requireAuth } from '~/middleware/auth';
import { getOrCreateUserFromClaims } from '~/services/user-service';

export const meRouter = Router();

meRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    if (!req.user) throw new Error('auth middleware did not populate req.user');
    const user = await getOrCreateUserFromClaims(req.user);
    res.json({
      id: user.id,
      entraOid: user.entraOid,
      email: user.email,
      displayName: user.displayName,
    });
  } catch (err) {
    next(err);
  }
});
