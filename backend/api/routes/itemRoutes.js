import {Router} from 'express';

export function createItemRoutes(itemService) {
  const router = Router();

  router.get('/', (req, res) => {
    const limit = Number.parseInt(String(req.query.limit ?? '30'), 10);
    res.json({data: itemService.listRecent(limit)});
  });

  return router;
}
