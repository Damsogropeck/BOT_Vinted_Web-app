import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {User, Plus, Search, ExternalLink, Activity, Pin, MoreVertical} from 'lucide-react';
import {api, type ItemRecord, type SearchRecord, type StatusRecord} from './services/api';

const POLLING_INTERVAL_MS = 8000;

function formatRelativeTime(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return 'à l\'instant';
  }

  const diffMs = parsed.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('fr', {numeric: 'auto'});

  if (absMs < 60_000) {
    return rtf.format(Math.round(diffMs / 1000), 'second');
  }

  if (absMs < 3_600_000) {
    return rtf.format(Math.round(diffMs / 60_000), 'minute');
  }

  if (absMs < 86_400_000) {
    return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  }

  return rtf.format(Math.round(diffMs / 86_400_000), 'day');
}

function inferBrand(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return 'N/A';
  }

  return words[words.length - 1];
}

function formatPrice(price: string) {
  if (!price || !price.trim()) {
    return 'N/A';
  }

  return price;
}

type UiItem = ItemRecord & {
  categoryId: number;
};

export default function App() {
  const [searches, setSearches] = useState<SearchRecord[]>([]);
  const [items, setItems] = useState<UiItem[]>([]);
  const [status, setStatus] = useState<StatusRecord | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const [newSearchUrl, setNewSearchUrl] = useState('');
  const [newSearchLabel, setNewSearchLabel] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busySearchId, setBusySearchId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    }

    try {
      const [searchesResponse, itemsResponse, statusResponse] = await Promise.all([
        api.listSearches(),
        api.listItems(30),
        api.getStatus(),
      ]);

      setSearches(searchesResponse);
      setItems(
        itemsResponse.map((item) => ({
          ...item,
          categoryId: item.searchId,
        })),
      );
      setStatus(statusResponse);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData(true);

    const interval = window.setInterval(() => {
      void loadData(false);
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadData]);

  useEffect(() => {
    if (selectedCategoryId == null) {
      return;
    }

    const exists = searches.some((search) => search.id === selectedCategoryId);
    if (!exists) {
      setSelectedCategoryId(null);
    }
  }, [searches, selectedCategoryId]);

  const handleCreateSearch = useCallback(async () => {
    if (!newSearchUrl.trim() || !newSearchLabel.trim()) {
      setErrorMessage('URL et nom de catégorie sont requis');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.createSearch({
        url: newSearchUrl.trim(),
        label: newSearchLabel.trim(),
      });
      setNewSearchUrl('');
      setNewSearchLabel('');
      setErrorMessage(null);
      await loadData(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer la recherche');
    } finally {
      setIsSubmitting(false);
    }
  }, [loadData, newSearchLabel, newSearchUrl]);

  const toggleCategory = useCallback(
    async (id: number) => {
      const current = searches.find((entry) => entry.id === id);
      if (!current) {
        return;
      }

      setBusySearchId(id);

      try {
        await api.updateSearch(id, {isActive: !current.isActive});
        await loadData(false);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Impossible de modifier la recherche');
      } finally {
        setBusySearchId(null);
      }
    },
    [loadData, searches],
  );

  const togglePin = useCallback(
    async (id: number) => {
      const current = searches.find((entry) => entry.id === id);
      if (!current) {
        return;
      }

      setBusySearchId(id);

      try {
        await api.updateSearch(id, {isPinned: !current.isPinned});
        await loadData(false);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Impossible de modifier la recherche');
      } finally {
        setBusySearchId(null);
      }
    },
    [loadData, searches],
  );

  const deleteCategory = useCallback(
    async (id: number, label: string) => {
      const confirmed = window.confirm(`Supprimer la recherche "${label}" ?`);
      if (!confirmed) {
        return;
      }

      setBusySearchId(id);

      try {
        await api.deleteSearch(id);
        await loadData(false);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Impossible de supprimer la recherche');
      } finally {
        setBusySearchId(null);
      }
    },
    [loadData],
  );

  const sortedCategories = useMemo(() => {
    return [...searches].sort((a, b) => {
      if (a.isPinned === b.isPinned) {
        return 0;
      }
      return a.isPinned ? -1 : 1;
    });
  }, [searches]);

  const selectedCategory = useMemo(
    () => searches.find((search) => search.id === selectedCategoryId) ?? null,
    [searches, selectedCategoryId],
  );

  const filteredItems = useMemo(() => {
    if (selectedCategoryId == null) {
      return items;
    }

    return items.filter((item) => item.categoryId === selectedCategoryId);
  }, [items, selectedCategoryId]);

  return (
    <div className="min-h-screen bg-[#050505] font-sans text-zinc-100 selection:bg-fuchsia-500/30 relative overflow-hidden">
      {/* Ambient Background Glows */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/20 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-fuchsia-600/10 blur-[120px] pointer-events-none" />
      <div className="fixed top-[40%] right-[-5%] w-[30%] h-[40%] rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-20 shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400">
              Vinted-Bot
            </h1>
          </div>
          <button className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors group">
            <div className="p-1.5 rounded-full bg-white/5 border border-white/10 group-hover:border-white/20 transition-colors">
              <User className="w-4 h-4" />
            </div>
            <span className="hidden sm:inline font-display">Mon compte</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Search Form Section */}
        <section className="relative bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-8 shadow-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 pointer-events-none" />
          <h2 className="relative text-xs font-display font-bold text-zinc-400 uppercase tracking-widest mb-5">Make research</h2>

          <div className="relative flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label htmlFor="url" className="block text-sm font-medium text-zinc-300 mb-1.5">
                URL Vinted
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-zinc-500 group-focus-within:text-violet-400 transition-colors" />
                </div>
                <input
                  type="url"
                  id="url"
                  value={newSearchUrl}
                  onChange={(event) => setNewSearchUrl(event.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-inner"
                  placeholder="https://www.vinted.fr/..."
                />
              </div>
            </div>
            <div className="flex-1 w-full">
              <label htmlFor="category" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Nom catégorie
              </label>
              <input
                type="text"
                id="category"
                value={newSearchLabel}
                onChange={(event) => setNewSearchLabel(event.target.value)}
                className="block w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all shadow-inner"
                placeholder="Ex: Sneakers Nike"
              />
            </div>
            <button
              onClick={handleCreateSearch}
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-2.5 border border-transparent text-sm font-display font-bold rounded-xl text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050505] focus:ring-fuchsia-500 transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] disabled:opacity-60"
            >
              <Plus className="w-4 h-4 mr-2" />
              {isSubmitting ? 'Ajout...' : 'Add research'}
            </button>
          </div>

          {errorMessage && <p className="relative mt-4 text-sm text-rose-400">{errorMessage}</p>}
        </section>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full lg:w-64 flex-shrink-0">
            <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden sticky top-24 shadow-xl">
              <div className="p-4 border-b border-white/10 bg-white/5">
                <h3 className="text-xs font-display font-bold text-zinc-300 uppercase tracking-widest">Recherches actives</h3>
              </div>
              <ul className="divide-y divide-white/5">
                {sortedCategories.map((category) => (
                  <li
                    key={category.id}
                    onClick={() => {
                      setSelectedCategoryId((current) => (current === category.id ? null : category.id));
                    }}
                    className={`relative p-4 border-l-2 transition-colors flex flex-col gap-3 group cursor-pointer ${
                      selectedCategoryId === category.id
                        ? 'border-l-violet-500 bg-white/5'
                        : 'border-l-transparent hover:bg-white/5'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-display font-semibold text-zinc-100 truncate pr-4">{category.label}</div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteCategory(category.id, category.label);
                        }}
                        disabled={busySearchId === category.id}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-white/10 opacity-0 group-hover:opacity-100 -mt-1 -mr-1 disabled:opacity-40"
                        title="Supprimer la recherche"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="text-xs text-zinc-400 flex items-center gap-1">
                        <span className="font-medium text-zinc-500">Marque:</span> <span className="truncate">{inferBrand(category.label)}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void toggleCategory(category.id);
                          }}
                          disabled={busySearchId === category.id}
                          className={`w-12 py-1 rounded-md text-xs font-display font-bold transition-all border disabled:opacity-40 ${
                            category.isActive
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)] hover:bg-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.15)] hover:bg-rose-500/20'
                          }`}
                        >
                          {category.isActive ? 'ON' : 'OFF'}
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void togglePin(category.id);
                          }}
                          disabled={busySearchId === category.id}
                          className={`p-1.5 rounded-md transition-colors disabled:opacity-40 ${
                            category.isPinned
                              ? 'text-violet-400 bg-violet-500/10 hover:bg-violet-500/20'
                              : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                          }`}
                          title={category.isPinned ? 'Dépingler' : 'Épingler en haut'}
                        >
                          <Pin className={`w-4 h-4 ${category.isPinned ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {!isLoading && sortedCategories.length === 0 && (
                  <li className="p-4 text-sm text-zinc-400">Aucune recherche enregistrée.</li>
                )}
              </ul>
            </div>
          </aside>

          {/* Main Content - Items Grid */}
          <div className="flex-1">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-display font-bold text-white">
                {selectedCategory ? `Articles trouvés : ${selectedCategory.label}` : 'Derniers articles trouvés'}
              </h2>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-display font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                {status?.scheduler?.cycleInProgress ? 'Scan en cours' : 'Live updates'}
                <span className="ml-2 flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></span>
                </span>
              </span>
            </div>

            {isLoading && <p className="mb-6 text-sm text-zinc-400">Chargement initial...</p>}

            <div className="flex flex-col gap-4">
              {filteredItems.map((item) => (
                <article
                  key={`${item.categoryId}-${item.itemId}`}
                  className="relative bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden hover:border-violet-500/50 hover:shadow-[0_0_30px_rgba(139,92,246,0.15)] transition-all duration-500 flex flex-col md:flex-row group"
                >
                  <div className="relative w-full aspect-[4/3] md:aspect-square md:w-56 lg:w-64 flex-shrink-0 bg-black/40 overflow-hidden">
                    <img
                      src={item.imageUrl || 'https://picsum.photos/seed/vinted/400/400'}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-80" />
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-display font-bold text-zinc-200 border border-white/10 shadow-lg">
                      {formatRelativeTime(item.detectedAt)}
                    </div>
                  </div>

                  <div className="flex-1 p-5 flex flex-col min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <h3 className="font-display font-semibold text-zinc-100 text-lg line-clamp-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-violet-400 group-hover:to-fuchsia-400 transition-all min-w-0">
                        {item.title}
                      </h3>
                      <span className="text-2xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-[0_0_8px_rgba(6,182,212,0.3)] whitespace-nowrap">
                        {formatPrice(item.price)}
                      </span>
                    </div>

                    <div className="mb-5 md:ml-auto md:min-w-[220px] grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div className="text-zinc-500">Marque:</div>
                      <div className="font-medium text-zinc-300 text-right truncate">{item.brand || 'N/A'}</div>

                      <div className="text-zinc-500">État:</div>
                      <div className="font-medium text-zinc-300 text-right truncate">{item.condition || 'N/A'}</div>

                      <div className="text-zinc-500">Taille:</div>
                      <div className="font-medium text-zinc-300 text-right truncate">{item.size || 'N/A'}</div>
                    </div>

                    <div className="mt-auto flex justify-end">
                      <button
                        onClick={() => window.open(item.itemUrl, '_blank', 'noopener,noreferrer')}
                        className="w-full md:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-white/10 text-sm font-display font-bold rounded-xl text-zinc-200 bg-white/5 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#050505] focus:ring-violet-500 transition-all backdrop-blur-sm group-hover:border-violet-500/30 group-hover:shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Voir l'article
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {!isLoading && filteredItems.length === 0 && (
                <article className="relative bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden p-8 text-zinc-300 flex flex-col items-center justify-center text-center">
                  <Search className="w-8 h-8 text-zinc-500 mb-3" />
                  <p className="font-medium text-zinc-300">
                    {selectedCategory ? 'Aucun article trouvé pour cette recherche' : 'Aucun nouvel article détecté pour le moment.'}
                  </p>
                  {selectedCategory && <p className="text-sm text-zinc-500 mt-1">Attends le prochain scan ou essaie une autre recherche.</p>}
                </article>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
