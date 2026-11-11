'use client';

import { tNow } from "./i18n";

import { useEffect, useState, type DependencyList } from 'react';

interface ResourceState<T> {
  key: string;
  data: T | null;
  failed: boolean;
}

/**
 * Shared loading/error/data state for a component that fetches one resource on mount
 * and re-fetches whenever `deps` changes. `fetcher` should be a stable closure (it is
 * not itself a dependency — put the values it reads into `deps` instead, and keep them
 * primitive: they are compared via `JSON.stringify` to derive `loading`).
 *
 * `loading` is derived by comparing the current deps against the deps of the last
 * completed fetch, rather than set directly inside the effect — calling setState
 * synchronously in an effect body trips `react-hooks/set-state-in-effect`.
 */
export function useApiResource<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  errorMessage = tNow('lib.genericError'),
): { data: T | null; loading: boolean; error: string | null } {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<ResourceState<T>>({
    key: '',
    data: null,
    failed: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((result) => {
        if (!cancelled) setState({ key, data: result, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data: state.data, loading: state.key !== key, error: state.failed ? errorMessage : null };
}
