import {itemRepository} from '../storage/itemRepository.js';

export const itemService = {
  listRecent(limit) {
    const boundedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 30;
    return itemRepository.listRecent(boundedLimit);
  },
};
