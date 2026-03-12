import {searchRepository} from '../storage/searchRepository.js';
import {HttpError} from '../utils/errors.js';
import {normalizeVintedUrl} from '../utils/url.js';

function normalizeLabel(label) {
  return String(label ?? '').trim();
}

export const searchService = {
  list() {
    return searchRepository.list();
  },

  create(payload) {
    const url = String(payload?.url ?? '').trim();
    const label = normalizeLabel(payload?.label);

    if (!url) {
      throw new HttpError(400, 'Le champ url est requis');
    }

    if (!label) {
      throw new HttpError(400, 'Le champ label est requis');
    }

    const normalizedUrl = normalizeVintedUrl(url);

    try {
      return searchRepository.create({
        url: normalizedUrl,
        normalizedUrl,
        label,
        isActive: true,
        isPinned: false,
      });
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed: searches.normalized_url')) {
        throw new HttpError(409, 'Cette recherche existe déjà');
      }
      throw error;
    }
  },

  update(id, patch) {
    const existing = searchRepository.getById(id);
    if (!existing) {
      throw new HttpError(404, 'Recherche introuvable');
    }

    const updatePayload = {};

    if (Object.hasOwn(patch, 'label')) {
      const nextLabel = normalizeLabel(patch.label);
      if (!nextLabel) {
        throw new HttpError(400, 'Le label ne peut pas être vide');
      }
      updatePayload.label = nextLabel;
    }

    if (Object.hasOwn(patch, 'url')) {
      const nextUrl = String(patch.url ?? '').trim();
      if (!nextUrl) {
        throw new HttpError(400, 'Le champ url ne peut pas être vide');
      }
      const normalizedUrl = normalizeVintedUrl(nextUrl);
      updatePayload.url = normalizedUrl;
      updatePayload.normalizedUrl = normalizedUrl;
    }

    if (Object.hasOwn(patch, 'isActive')) {
      updatePayload.isActive = Boolean(patch.isActive);
    }

    if (Object.hasOwn(patch, 'isPinned')) {
      updatePayload.isPinned = Boolean(patch.isPinned);
    }

    if (!Object.keys(updatePayload).length) {
      return existing;
    }

    try {
      return searchRepository.update(id, updatePayload);
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed: searches.normalized_url')) {
        throw new HttpError(409, 'Une recherche avec cette URL existe déjà');
      }
      throw error;
    }
  },

  delete(id) {
    const deleted = searchRepository.delete(id);
    if (!deleted) {
      throw new HttpError(404, 'Recherche introuvable');
    }
  },
};
