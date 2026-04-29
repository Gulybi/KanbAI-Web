import { ProjectSummary } from '../models/project.model';

/**
 * Internal state owned by ProjectStateService. Never exported from
 * the service except via read-only selectors.
 *
 * `hasLoaded` distinguishes "we never asked" from "we asked and
 * the server returned an empty array". This is what lets the UI
 * show loading -> empty vs. loading -> error correctly without
 * adding an explicit status enum.
 */
export interface ProjectState {
  projects: ProjectSummary[];
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
}

/**
 * Input shape for create/update. Mirrors CreateProjectDto /
 * UpdateProjectDto from the backend (name required, description
 * optional and nullable).
 */
export interface ProjectInput {
  name: string;
  description: string | null;
}

export const INITIAL_PROJECT_STATE: ProjectState = {
  projects: [],
  isLoading: false,
  error: null,
  hasLoaded: false
};
