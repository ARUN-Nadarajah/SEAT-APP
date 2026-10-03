import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { apiErrorMessage } from '@/services/api';

/**
 * React Query wrappers (spec §1: React Query).
 *
 * Centralising them means every screen gets the same defaults:
 *   • 30s staleness so availability/queue data stays fresh (NFR03)
 *   • automatic refetch on reconnect (offline/network error handling)
 *   • errors normalised to a readable message
 */
export function useApiQuery<T>(
  key: (string | number | null | undefined)[],
  fetcher: () => Promise<T>,
  options: Partial<UseQueryOptions<T>> = {},
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: fetcher,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
    ...options,
  });
}

export function useApiMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
  options: {
    invalidate?: (string | number | null | undefined)[][];
    onSuccess?: (data: TOutput, input: TInput) => void;
    onError?: (message: string, input: TInput) => void;
  } = {},
) {
  const queryClient = useQueryClient();

  return useMutation<TOutput, unknown, TInput>({
    mutationFn,
    onSuccess: (data, input) => {
      for (const key of options.invalidate || []) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      options.onSuccess?.(data, input);
    },
    onError: (error, input) => {
      options.onError?.(apiErrorMessage(error), input);
    },
  });
}

/** Absolute "in N minutes" helper for wait estimates. */
export function minutesFromNow(minutes: number): string {
  const date = new Date(Date.now() + minutes * 60000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
