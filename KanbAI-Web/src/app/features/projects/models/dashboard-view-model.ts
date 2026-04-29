import { ProjectSummary } from './project.model';

/**
 * Discriminated-union view model for the Dashboard page.
 *
 * Exactly one variant is active at any time. The container renders
 * the matching sub-component via an @switch block in the template.
 *
 * Using a union (not a POJO with boolean flags) prevents illegal
 * combinations like `status: 'loading'` with a populated `projects`
 * array, or `status: 'error'` with a non-null `error` and a
 * populated projects array.
 */
export type DashboardViewModel =
  | { status: 'loading' }
  | { status: 'success'; projects: ProjectSummary[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/** Helper for the initial signal value, avoids magic literals in the component. */
export const INITIAL_DASHBOARD_VM: DashboardViewModel = { status: 'loading' };
