import {searchRepository} from '../storage/searchRepository.js';
import {itemRepository} from '../storage/itemRepository.js';

export function createStatusService(scheduler) {
  return {
    getStatus() {
      return {
        scheduler: scheduler.getStatus(),
        counters: {
          searchesTotal: searchRepository.countAll(),
          searchesActive: searchRepository.countActive(),
          itemsTotal: itemRepository.countAll(),
        },
        timestamp: new Date().toISOString(),
      };
    },
  };
}
