/**
 * Represents a single feature highlight on the landing page.
 */
export interface FeatureHighlight {
  /**
   * Unique identifier for the feature.
   */
  id: string;

  /**
   * Display title of the feature (e.g., "Real-time Kanban Boards").
   */
  title: string;

  /**
   * Description of the feature (2-3 sentences).
   */
  description: string;

  /**
   * Icon identifier for visual representation.
   * Can be mapped to icon library classes or SVG names.
   * Examples: 'board', 'ai', 'team', 'automation'
   */
  icon: string;
}
