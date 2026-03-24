import {Router} from 'express';

export function createStatusRoutes(statusService) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({data: statusService.getStatus()});
  });

  return router;
}
