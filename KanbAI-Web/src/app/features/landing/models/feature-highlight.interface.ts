/**
 * Represents a single feature highlight on the landing page.
 */
export interface FeatureHighlight {
  /**
   * Unique identifier for the feature.
   */
  id: string;

  /**
   * Display title of the feature (e.g., "Project Dashboard").
   */
  title: string;

  /**
   * Description of the feature (1–2 sentences).
   */
  description: string;

  /**
   * Icon identifier for visual representation.
   * Can be mapped to icon library classes or SVG names.
   * Examples: 'board', 'ai', 'team', 'automation', 'lock'
   */
  icon: string;

  /**
   * When true, the card is treated as a roadmap / not-yet-shipped capability
   * and a visible "Coming soon" badge is rendered. When omitted or false,
   * the card describes a currently available feature.
   */
  comingSoon?: boolean;
}
