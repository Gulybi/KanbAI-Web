/**
 * Single source of truth for the "non-owner" delete-project hint copy
 * (issue #96). Used by both `ProjectCardComponent`'s kebab menu (dashboard)
 * and `BoardHeaderComponent`'s kebab menu (open board) so the two surfaces
 * cannot drift from each other, and identical to the 403 toast copy per the
 * context-doc copy matrix.
 */
export const DELETE_PROJECT_DISABLED_COPY =
  'Only the project owner can delete this project';
