/**
 * Frozen copy constants for the Description section (issue #91). Every
 * user-visible string in the feature is sourced from here — any drift is
 * a bug. Verbatim strings come from `docs/handoffs/issue_91_context.md`
 * §Acceptance Criteria.
 */
export const TASK_DESCRIPTION_COPY = {
  EMPTY_PLACEHOLDER: 'No description yet — click to add one',
  INLINE_ERROR_EMPTY: 'Description cannot be empty',
  INLINE_ERROR_GENERIC_SAVE: "Couldn't save description — please try again",
  INLINE_ERROR_PERMISSION: "You don't have permission to edit this task",
  INLINE_ERROR_NETWORK: "Couldn't reach the server — try again",
  TOAST_TASK_NOT_FOUND: 'This task no longer exists',
  ANNOUNCE_SAVED: 'Description saved',
  ANNOUNCE_CLEARED: 'Description cleared',
  BANNER_REMOTE_UPDATED: 'This task was updated by someone else',
  BANNER_DISCARD_ACTION: 'Discard my changes and reload',
  CLEAR_CONFIRM_TITLE: 'Clear this description?',
  CLEAR_CONFIRM_CONFIRM_LABEL: 'Confirm',
  CLEAR_CONFIRM_CANCEL_LABEL: 'Cancel',
  TEXTAREA_LABEL: 'Task description',
  EDIT_BUTTON_LABEL: 'Edit description',
  CLEAR_BUTTON_LABEL: 'Clear description',
  SAVE_BUTTON_LABEL: 'Save',
  CANCEL_BUTTON_LABEL: 'Cancel'
} as const;

export const TASK_DESCRIPTION_MAX_LENGTH = 10_000;
export const TASK_DESCRIPTION_COUNTER_THRESHOLD = 9_000;
