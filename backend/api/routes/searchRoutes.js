import {Router} from 'express';
import {HttpError} from '../../utils/errors.js';

function parseId(rawId) {
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new HttpError(400, 'ID invalide');
  }
  return id;
}

export function createSearchRoutes(searchService) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({data: searchService.list()});
  });

  router.post('/', (req, res, next) => {
    try {
      const created = searchService.create(req.body ?? {});
      res.status(201).json({data: created});
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const updated = searchService.update(id, req.body ?? {});
      res.json({data: updated});
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      searchService.delete(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
