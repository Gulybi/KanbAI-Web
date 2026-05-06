/**
 * Lifecycle phase of the panel-open list fetch for a given task.
 *  - 'idle'    : no fetch has been attempted (e.g. task-detail not yet opened).
 *  - 'loading' : GET in flight.
 *  - 'ready'   : last fetch succeeded; completedByTaskId[taskId] is authoritative.
 *  - 'error'   : last fetch failed; the list falls back to SignalR-origin entries
 *                but the section shows an error banner with a Retry button.
 */
export type AttachmentListFetchPhase = 'idle' | 'loading' | 'ready' | 'error';

export type AttachmentListFetchErrorCode =
  | 'HTTP_403'
  | 'HTTP_404'
  | 'HTTP_5XX'
  | 'NETWORK'
  | 'HTTP_OTHER';

export interface AttachmentListFetchError {
  readonly code: AttachmentListFetchErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
}

export interface AttachmentListFetchState {
  readonly phase: AttachmentListFetchPhase;
  readonly error: AttachmentListFetchError | null;
}

export const IDLE_LIST_FETCH_STATE: AttachmentListFetchState = {
  phase: 'idle',
  error: null
};
