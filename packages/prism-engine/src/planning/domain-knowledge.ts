/**
 * domain-knowledge.ts -- App type dependency trees for the Prism planning pipeline.
 *
 * This is a versioned code artifact (NOT a database table) that maps app types to
 * their required features, UI patterns, security requirements, and infrastructure needs.
 * The planning pipeline uses this during Step 3 (inferred needs mapping) to expand
 * a parsed AppIntent into a comprehensive feature set via first-order and second-order
 * dependency expansion.
 *
 * Contains all 20 app type entries specified in DIFFUSION-ENGINE-SPEC.md Section 8.
 * 16 map directly to AppType union values; 4 special entries (authentication-flow,
 * settings-page, onboarding-flow, error-pages) use appType 'custom' since they are
 * not standalone AppType union members.
 */

import type { AppType, UIElementType } from '../types.js';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface AppTypeDependencyTree {
  appType: AppType;
  firstOrderDeps: {
    name: string;
    uiPatterns: UIElementType[];
    required: boolean;
  }[];
  secondOrderDeps: {
    name: string;
    triggeredBy: string; // Which first-order dep triggers this
    uiPatterns: UIElementType[];
  }[];
  securityRequirements: string[];
  infrastructureNeeds: string[];
}

// ---------------------------------------------------------------------------
// 1. landing-page
// ---------------------------------------------------------------------------

const LANDING_PAGE: AppTypeDependencyTree = {
  appType: 'landing-page',
  firstOrderDeps: [
    { name: 'hero-section', uiPatterns: ['hero-section', 'button'], required: true },
    { name: 'navigation', uiPatterns: ['navbar'], required: true },
    { name: 'social-proof', uiPatterns: ['card', 'avatar', 'badge'], required: false },
    { name: 'pricing', uiPatterns: ['card', 'button', 'toggle'], required: false },
    { name: 'cta-section', uiPatterns: ['hero-section', 'button', 'input'], required: true },
    { name: 'footer', uiPatterns: ['footer'], required: true },
  ],
  secondOrderDeps: [
    { name: 'form-validation', triggeredBy: 'cta-section', uiPatterns: ['input', 'alert'] },
    { name: 'loading-states', triggeredBy: 'cta-section', uiPatterns: ['spinner', 'skeleton'] },
    { name: 'error-handling', triggeredBy: 'cta-section', uiPatterns: ['toast', 'alert'] },
    { name: 'mobile-nav', triggeredBy: 'navigation', uiPatterns: ['drawer', 'button'] },
  ],
  securityRequirements: ['input-validation', 'xss-prevention', 'csrf-protection'],
  infrastructureNeeds: ['analytics', 'seo-meta-tags'],
};

// ---------------------------------------------------------------------------
// 2. saas-dashboard
// ---------------------------------------------------------------------------

const SAAS_DASHBOARD: AppTypeDependencyTree = {
  appType: 'saas-dashboard',
  firstOrderDeps: [
    { name: 'sidebar-navigation', uiPatterns: ['sidebar', 'icon', 'badge'], required: true },
    { name: 'top-bar', uiPatterns: ['navbar', 'avatar', 'search-bar', 'notification'], required: true },
    { name: 'metrics-overview', uiPatterns: ['card', 'chart', 'icon'], required: true },
    { name: 'data-table', uiPatterns: ['table', 'pagination', 'search-bar', 'button'], required: true },
    { name: 'activity-feed', uiPatterns: ['list', 'avatar', 'badge', 'icon'], required: false },
    { name: 'quick-actions', uiPatterns: ['button', 'modal', 'form'], required: false },
  ],
  secondOrderDeps: [
    { name: 'table-filters', triggeredBy: 'data-table', uiPatterns: ['select', 'input', 'button', 'tag'] },
    { name: 'table-sorting', triggeredBy: 'data-table', uiPatterns: ['icon', 'button'] },
    { name: 'chart-tooltips', triggeredBy: 'metrics-overview', uiPatterns: ['tooltip', 'card'] },
    { name: 'notification-panel', triggeredBy: 'top-bar', uiPatterns: ['drawer', 'list', 'badge'] },
    { name: 'form-validation', triggeredBy: 'quick-actions', uiPatterns: ['input', 'alert', 'toast'] },
    { name: 'loading-states', triggeredBy: 'data-table', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'empty-states', triggeredBy: 'data-table', uiPatterns: ['image', 'button'] },
  ],
  securityRequirements: ['authentication', 'authorization', 'session-management', 'csrf-protection', 'xss-prevention'],
  infrastructureNeeds: ['analytics', 'error-tracking', 'real-time-updates', 'caching'],
};

// ---------------------------------------------------------------------------
// 3. e-commerce
// ---------------------------------------------------------------------------

const E_COMMERCE: AppTypeDependencyTree = {
  appType: 'e-commerce',
  firstOrderDeps: [
    { name: 'navigation', uiPatterns: ['navbar', 'search-bar', 'icon', 'badge'], required: true },
    { name: 'product-grid', uiPatterns: ['grid', 'card', 'image', 'button', 'badge'], required: true },
    { name: 'product-detail', uiPatterns: ['image', 'carousel', 'button', 'select', 'tabs'], required: true },
    { name: 'shopping-cart', uiPatterns: ['drawer', 'list', 'button', 'icon', 'badge'], required: true },
    { name: 'checkout-flow', uiPatterns: ['form', 'input', 'select', 'button', 'progress'], required: true },
    { name: 'category-filters', uiPatterns: ['sidebar', 'checkbox', 'slider', 'tag', 'button'], required: true },
    { name: 'footer', uiPatterns: ['footer'], required: true },
  ],
  secondOrderDeps: [
    { name: 'search-autocomplete', triggeredBy: 'navigation', uiPatterns: ['popover', 'list', 'image'] },
    { name: 'product-reviews', triggeredBy: 'product-detail', uiPatterns: ['list', 'avatar', 'icon', 'progress'] },
    { name: 'size-guide', triggeredBy: 'product-detail', uiPatterns: ['modal', 'table'] },
    { name: 'payment-validation', triggeredBy: 'checkout-flow', uiPatterns: ['input', 'alert', 'spinner'] },
    { name: 'order-confirmation', triggeredBy: 'checkout-flow', uiPatterns: ['card', 'icon', 'button'] },
    { name: 'wishlist', triggeredBy: 'product-grid', uiPatterns: ['icon', 'toast'] },
    { name: 'loading-states', triggeredBy: 'product-grid', uiPatterns: ['skeleton', 'spinner'] },
  ],
  securityRequirements: [
    'authentication', 'payment-encryption', 'pci-compliance', 'csrf-protection',
    'xss-prevention', 'input-validation', 'rate-limiting',
  ],
  infrastructureNeeds: ['payment-gateway', 'inventory-management', 'email-notifications', 'analytics', 'seo-meta-tags', 'cdn'],
};

// ---------------------------------------------------------------------------
// 4. portfolio
// ---------------------------------------------------------------------------

const PORTFOLIO: AppTypeDependencyTree = {
  appType: 'portfolio',
  firstOrderDeps: [
    { name: 'navigation', uiPatterns: ['navbar'], required: true },
    { name: 'hero-section', uiPatterns: ['hero-section', 'image', 'button'], required: true },
    { name: 'project-gallery', uiPatterns: ['grid', 'card', 'image'], required: true },
    { name: 'about-section', uiPatterns: ['card', 'image', 'icon'], required: true },
    { name: 'contact-form', uiPatterns: ['form', 'input', 'textarea', 'button'], required: true },
    { name: 'footer', uiPatterns: ['footer', 'icon'], required: true },
  ],
  secondOrderDeps: [
    { name: 'project-detail-modal', triggeredBy: 'project-gallery', uiPatterns: ['modal', 'carousel', 'image', 'button'] },
    { name: 'form-validation', triggeredBy: 'contact-form', uiPatterns: ['input', 'alert'] },
    { name: 'form-submission-feedback', triggeredBy: 'contact-form', uiPatterns: ['toast', 'spinner'] },
    { name: 'skills-section', triggeredBy: 'about-section', uiPatterns: ['progress', 'tag', 'icon'] },
    { name: 'mobile-nav', triggeredBy: 'navigation', uiPatterns: ['drawer', 'button'] },
  ],
  securityRequirements: ['input-validation', 'xss-prevention', 'csrf-protection', 'rate-limiting'],
  infrastructureNeeds: ['analytics', 'seo-meta-tags', 'image-optimization', 'contact-email-delivery'],
};

// ---------------------------------------------------------------------------
// 5. blog
// ---------------------------------------------------------------------------

const BLOG: AppTypeDependencyTree = {
  appType: 'blog',
  firstOrderDeps: [
    { name: 'navigation', uiPatterns: ['navbar', 'search-bar'], required: true },
    { name: 'article-list', uiPatterns: ['grid', 'card', 'image', 'tag', 'avatar'], required: true },
    { name: 'article-detail', uiPatterns: ['card', 'image', 'avatar', 'tag'], required: true },
    { name: 'sidebar', uiPatterns: ['sidebar', 'list', 'tag', 'search-bar'], required: false },
    { name: 'footer', uiPatterns: ['footer'], required: true },
  ],
  secondOrderDeps: [
    { name: 'search-results', triggeredBy: 'navigation', uiPatterns: ['list', 'card', 'skeleton'] },
    { name: 'category-filter', triggeredBy: 'article-list', uiPatterns: ['tag', 'button'] },
    { name: 'reading-progress', triggeredBy: 'article-detail', uiPatterns: ['progress'] },
    { name: 'share-buttons', triggeredBy: 'article-detail', uiPatterns: ['button', 'icon', 'popover'] },
    { name: 'comments-section', triggeredBy: 'article-detail', uiPatterns: ['list', 'avatar', 'textarea', 'button'] },
    { name: 'pagination', triggeredBy: 'article-list', uiPatterns: ['pagination'] },
    { name: 'mobile-nav', triggeredBy: 'navigation', uiPatterns: ['drawer', 'button'] },
  ],
  securityRequirements: ['input-validation', 'xss-prevention', 'csrf-protection'],
  infrastructureNeeds: ['analytics', 'seo-meta-tags', 'rss-feed', 'image-optimization', 'content-caching'],
};

// ---------------------------------------------------------------------------
// 6. social-platform
// ---------------------------------------------------------------------------

const SOCIAL_PLATFORM: AppTypeDependencyTree = {
  appType: 'social-platform',
  firstOrderDeps: [
    { name: 'navigation', uiPatterns: ['navbar', 'icon', 'badge', 'avatar'], required: true },
    { name: 'feed', uiPatterns: ['list', 'card', 'image', 'avatar', 'icon', 'button'], required: true },
    { name: 'post-composer', uiPatterns: ['textarea', 'button', 'icon', 'image'], required: true },
    { name: 'profile-page', uiPatterns: ['card', 'avatar', 'image', 'tabs', 'grid', 'button'], required: true },
    { name: 'notifications', uiPatterns: ['list', 'notification', 'avatar', 'badge'], required: true },
    { name: 'sidebar-suggestions', uiPatterns: ['sidebar', 'card', 'avatar', 'button'], required: false },
  ],
  secondOrderDeps: [
    { name: 'comment-thread', triggeredBy: 'feed', uiPatterns: ['list', 'avatar', 'textarea', 'button'] },
    { name: 'like-reaction', triggeredBy: 'feed', uiPatterns: ['icon', 'popover', 'tooltip'] },
    { name: 'media-upload', triggeredBy: 'post-composer', uiPatterns: ['modal', 'progress', 'image'] },
    { name: 'profile-editing', triggeredBy: 'profile-page', uiPatterns: ['modal', 'form', 'input', 'avatar'] },
    { name: 'search-users', triggeredBy: 'navigation', uiPatterns: ['search-bar', 'list', 'avatar'] },
    { name: 'loading-states', triggeredBy: 'feed', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'notification-badge-update', triggeredBy: 'notifications', uiPatterns: ['badge', 'toast'] },
  ],
  securityRequirements: [
    'authentication', 'authorization', 'content-moderation', 'xss-prevention',
    'csrf-protection', 'rate-limiting', 'input-validation', 'media-validation',
  ],
  infrastructureNeeds: ['real-time-updates', 'media-storage', 'cdn', 'analytics', 'push-notifications', 'email-notifications'],
};

// ---------------------------------------------------------------------------
// 7. marketplace
// ---------------------------------------------------------------------------

const MARKETPLACE: AppTypeDependencyTree = {
  appType: 'marketplace',
  firstOrderDeps: [
    { name: 'navigation', uiPatterns: ['navbar', 'search-bar', 'icon', 'avatar'], required: true },
    { name: 'listing-grid', uiPatterns: ['grid', 'card', 'image', 'badge', 'icon'], required: true },
    { name: 'listing-detail', uiPatterns: ['image', 'carousel', 'card', 'avatar', 'button', 'tabs'], required: true },
    { name: 'category-sidebar', uiPatterns: ['sidebar', 'list', 'checkbox', 'slider', 'tag'], required: true },
    { name: 'seller-profile', uiPatterns: ['card', 'avatar', 'badge', 'grid', 'tabs'], required: true },
    { name: 'create-listing', uiPatterns: ['form', 'input', 'textarea', 'select', 'image', 'button'], required: true },
    { name: 'footer', uiPatterns: ['footer'], required: true },
  ],
  secondOrderDeps: [
    { name: 'search-autocomplete', triggeredBy: 'navigation', uiPatterns: ['popover', 'list'] },
    { name: 'review-system', triggeredBy: 'listing-detail', uiPatterns: ['list', 'avatar', 'icon', 'progress', 'textarea'] },
    { name: 'messaging', triggeredBy: 'listing-detail', uiPatterns: ['modal', 'list', 'textarea', 'button'] },
    { name: 'listing-image-upload', triggeredBy: 'create-listing', uiPatterns: ['modal', 'progress', 'image'] },
    { name: 'form-validation', triggeredBy: 'create-listing', uiPatterns: ['alert', 'input'] },
    { name: 'loading-states', triggeredBy: 'listing-grid', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'pagination', triggeredBy: 'listing-grid', uiPatterns: ['pagination'] },
  ],
  securityRequirements: [
    'authentication', 'authorization', 'payment-encryption', 'input-validation',
    'xss-prevention', 'csrf-protection', 'rate-limiting', 'content-moderation',
  ],
  infrastructureNeeds: ['payment-gateway', 'media-storage', 'search-indexing', 'analytics', 'email-notifications', 'cdn'],
};

// ---------------------------------------------------------------------------
// 8. crm
// ---------------------------------------------------------------------------

const CRM: AppTypeDependencyTree = {
  appType: 'crm',
  firstOrderDeps: [
    { name: 'sidebar-navigation', uiPatterns: ['sidebar', 'icon', 'badge'], required: true },
    { name: 'top-bar', uiPatterns: ['navbar', 'search-bar', 'avatar', 'notification'], required: true },
    { name: 'contact-list', uiPatterns: ['table', 'avatar', 'badge', 'pagination', 'button'], required: true },
    { name: 'contact-detail', uiPatterns: ['card', 'avatar', 'tabs', 'list', 'button', 'tag'], required: true },
    { name: 'pipeline-view', uiPatterns: ['grid', 'card', 'badge', 'icon', 'button'], required: true },
    { name: 'activity-timeline', uiPatterns: ['list', 'icon', 'avatar', 'badge'], required: false },
  ],
  secondOrderDeps: [
    { name: 'contact-filters', triggeredBy: 'contact-list', uiPatterns: ['select', 'input', 'tag', 'button'] },
    { name: 'contact-form', triggeredBy: 'contact-detail', uiPatterns: ['modal', 'form', 'input', 'select', 'textarea'] },
    { name: 'deal-card-detail', triggeredBy: 'pipeline-view', uiPatterns: ['modal', 'card', 'progress', 'list'] },
    { name: 'note-composer', triggeredBy: 'activity-timeline', uiPatterns: ['textarea', 'button', 'icon'] },
    { name: 'search-results', triggeredBy: 'top-bar', uiPatterns: ['popover', 'list', 'avatar'] },
    { name: 'loading-states', triggeredBy: 'contact-list', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'bulk-actions', triggeredBy: 'contact-list', uiPatterns: ['checkbox', 'button', 'toast'] },
  ],
  securityRequirements: [
    'authentication', 'authorization', 'role-based-access', 'data-encryption',
    'csrf-protection', 'xss-prevention', 'audit-logging',
  ],
  infrastructureNeeds: ['analytics', 'email-integration', 'calendar-integration', 'search-indexing', 'data-export'],
};

// ---------------------------------------------------------------------------
// 9. project-management
// ---------------------------------------------------------------------------

const PROJECT_MANAGEMENT: AppTypeDependencyTree = {
  appType: 'project-management',
  firstOrderDeps: [
    { name: 'sidebar-navigation', uiPatterns: ['sidebar', 'icon', 'badge', 'list'], required: true },
    { name: 'top-bar', uiPatterns: ['navbar', 'search-bar', 'avatar', 'notification'], required: true },
    { name: 'board-view', uiPatterns: ['grid', 'card', 'badge', 'avatar', 'icon'], required: true },
    { name: 'list-view', uiPatterns: ['table', 'checkbox', 'badge', 'avatar', 'pagination'], required: true },
    { name: 'task-detail', uiPatterns: ['drawer', 'form', 'input', 'textarea', 'select', 'tag', 'avatar'], required: true },
    { name: 'calendar-view', uiPatterns: ['grid', 'card', 'badge'], required: false },
  ],
  secondOrderDeps: [
    { name: 'task-comments', triggeredBy: 'task-detail', uiPatterns: ['list', 'avatar', 'textarea', 'button'] },
    { name: 'task-attachments', triggeredBy: 'task-detail', uiPatterns: ['list', 'icon', 'progress', 'button'] },
    { name: 'subtask-list', triggeredBy: 'task-detail', uiPatterns: ['list', 'checkbox', 'progress'] },
    { name: 'board-filters', triggeredBy: 'board-view', uiPatterns: ['select', 'tag', 'avatar', 'button'] },
    { name: 'quick-add-task', triggeredBy: 'board-view', uiPatterns: ['input', 'button'] },
    { name: 'loading-states', triggeredBy: 'board-view', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'notification-panel', triggeredBy: 'top-bar', uiPatterns: ['drawer', 'list', 'badge'] },
  ],
  securityRequirements: [
    'authentication', 'authorization', 'role-based-access', 'csrf-protection',
    'xss-prevention', 'input-validation',
  ],
  infrastructureNeeds: ['real-time-updates', 'file-storage', 'analytics', 'email-notifications', 'search-indexing'],
};

// ---------------------------------------------------------------------------
// 10. analytics-dashboard
// ---------------------------------------------------------------------------

const ANALYTICS_DASHBOARD: AppTypeDependencyTree = {
  appType: 'analytics-dashboard',
  firstOrderDeps: [
    { name: 'sidebar-navigation', uiPatterns: ['sidebar', 'icon'], required: true },
    { name: 'top-bar', uiPatterns: ['navbar', 'select', 'button', 'avatar'], required: true },
    { name: 'kpi-cards', uiPatterns: ['card', 'icon', 'badge'], required: true },
    { name: 'chart-grid', uiPatterns: ['grid', 'chart', 'card'], required: true },
    { name: 'data-table', uiPatterns: ['table', 'pagination', 'button'], required: true },
    { name: 'date-range-picker', uiPatterns: ['button', 'popover', 'select'], required: true },
  ],
  secondOrderDeps: [
    { name: 'chart-tooltips', triggeredBy: 'chart-grid', uiPatterns: ['tooltip', 'card'] },
    { name: 'chart-legend', triggeredBy: 'chart-grid', uiPatterns: ['list', 'icon', 'toggle'] },
    { name: 'export-controls', triggeredBy: 'data-table', uiPatterns: ['button', 'popover', 'icon'] },
    { name: 'table-filters', triggeredBy: 'data-table', uiPatterns: ['select', 'input', 'tag'] },
    { name: 'drill-down-modal', triggeredBy: 'chart-grid', uiPatterns: ['modal', 'chart', 'table'] },
    { name: 'loading-states', triggeredBy: 'chart-grid', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'empty-states', triggeredBy: 'data-table', uiPatterns: ['image', 'button'] },
  ],
  securityRequirements: [
    'authentication', 'authorization', 'role-based-access', 'data-encryption',
    'csrf-protection', 'xss-prevention',
  ],
  infrastructureNeeds: ['analytics', 'data-pipeline', 'caching', 'data-export', 'scheduled-reports'],
};

// ---------------------------------------------------------------------------
// 11. ai-tool
// ---------------------------------------------------------------------------

const AI_TOOL: AppTypeDependencyTree = {
  appType: 'ai-tool',
  firstOrderDeps: [
    { name: 'navigation', uiPatterns: ['navbar', 'avatar', 'icon'], required: true },
    { name: 'input-panel', uiPatterns: ['textarea', 'button', 'select', 'toggle'], required: true },
    { name: 'output-panel', uiPatterns: ['card', 'tabs'], required: true },
    { name: 'history-sidebar', uiPatterns: ['sidebar', 'list', 'icon', 'button'], required: false },
    { name: 'usage-meter', uiPatterns: ['progress', 'badge', 'card'], required: false },
    { name: 'settings-panel', uiPatterns: ['form', 'slider', 'toggle', 'select', 'input'], required: false },
  ],
  secondOrderDeps: [
    { name: 'streaming-output', triggeredBy: 'output-panel', uiPatterns: ['skeleton', 'spinner', 'progress'] },
    { name: 'copy-export', triggeredBy: 'output-panel', uiPatterns: ['button', 'icon', 'toast'] },
    { name: 'file-upload', triggeredBy: 'input-panel', uiPatterns: ['button', 'icon', 'progress'] },
    { name: 'model-selector', triggeredBy: 'input-panel', uiPatterns: ['select', 'popover', 'badge'] },
    { name: 'error-handling', triggeredBy: 'output-panel', uiPatterns: ['alert', 'button'] },
    { name: 'loading-states', triggeredBy: 'output-panel', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'history-detail', triggeredBy: 'history-sidebar', uiPatterns: ['modal', 'card'] },
  ],
  securityRequirements: [
    'authentication', 'api-key-management', 'rate-limiting', 'input-validation',
    'xss-prevention', 'csrf-protection', 'content-filtering',
  ],
  infrastructureNeeds: ['ai-api-integration', 'usage-tracking', 'analytics', 'caching', 'queue-management'],
};

// ---------------------------------------------------------------------------
// 12. video-platform
// ---------------------------------------------------------------------------

const VIDEO_PLATFORM: AppTypeDependencyTree = {
  appType: 'video-platform',
  firstOrderDeps: [
    { name: 'navigation', uiPatterns: ['navbar', 'search-bar', 'icon', 'avatar'], required: true },
    { name: 'video-player', uiPatterns: ['video-player', 'button', 'slider', 'icon'], required: true },
    { name: 'video-grid', uiPatterns: ['grid', 'card', 'image', 'badge', 'icon'], required: true },
    { name: 'channel-page', uiPatterns: ['card', 'avatar', 'tabs', 'grid', 'button'], required: true },
    { name: 'sidebar-recommendations', uiPatterns: ['sidebar', 'list', 'card', 'image'], required: false },
    { name: 'upload-flow', uiPatterns: ['form', 'input', 'textarea', 'select', 'progress', 'button'], required: true },
  ],
  secondOrderDeps: [
    { name: 'video-comments', triggeredBy: 'video-player', uiPatterns: ['list', 'avatar', 'textarea', 'button', 'icon'] },
    { name: 'like-dislike', triggeredBy: 'video-player', uiPatterns: ['button', 'icon', 'tooltip'] },
    { name: 'share-modal', triggeredBy: 'video-player', uiPatterns: ['modal', 'button', 'icon', 'input'] },
    { name: 'upload-progress', triggeredBy: 'upload-flow', uiPatterns: ['progress', 'spinner', 'toast'] },
    { name: 'search-results', triggeredBy: 'navigation', uiPatterns: ['list', 'card', 'image', 'skeleton'] },
    { name: 'playlists', triggeredBy: 'video-player', uiPatterns: ['list', 'card', 'button', 'icon'] },
    { name: 'loading-states', triggeredBy: 'video-grid', uiPatterns: ['skeleton', 'spinner'] },
  ],
  securityRequirements: [
    'authentication', 'authorization', 'content-moderation', 'media-validation',
    'xss-prevention', 'csrf-protection', 'rate-limiting',
  ],
  infrastructureNeeds: ['video-transcoding', 'media-storage', 'cdn', 'analytics', 'search-indexing', 'push-notifications'],
};

// ---------------------------------------------------------------------------
// 13. messaging-app
// ---------------------------------------------------------------------------

const MESSAGING_APP: AppTypeDependencyTree = {
  appType: 'messaging-app',
  firstOrderDeps: [
    { name: 'conversation-list', uiPatterns: ['sidebar', 'list', 'avatar', 'badge', 'search-bar'], required: true },
    { name: 'message-thread', uiPatterns: ['list', 'card', 'avatar', 'image', 'icon'], required: true },
    { name: 'message-composer', uiPatterns: ['textarea', 'button', 'icon'], required: true },
    { name: 'user-profile', uiPatterns: ['card', 'avatar', 'button', 'icon'], required: true },
    { name: 'top-bar', uiPatterns: ['navbar', 'avatar', 'icon', 'button'], required: true },
  ],
  secondOrderDeps: [
    { name: 'media-upload', triggeredBy: 'message-composer', uiPatterns: ['modal', 'image', 'progress', 'icon'] },
    { name: 'emoji-picker', triggeredBy: 'message-composer', uiPatterns: ['popover', 'grid', 'search-bar', 'tabs'] },
    { name: 'message-reactions', triggeredBy: 'message-thread', uiPatterns: ['popover', 'icon', 'tooltip'] },
    { name: 'typing-indicator', triggeredBy: 'message-thread', uiPatterns: ['spinner', 'icon'] },
    { name: 'read-receipts', triggeredBy: 'message-thread', uiPatterns: ['icon', 'tooltip'] },
    { name: 'new-conversation', triggeredBy: 'conversation-list', uiPatterns: ['modal', 'search-bar', 'list', 'avatar'] },
    { name: 'loading-states', triggeredBy: 'message-thread', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'notification-sound', triggeredBy: 'conversation-list', uiPatterns: ['notification', 'badge'] },
  ],
  securityRequirements: [
    'authentication', 'end-to-end-encryption', 'message-encryption', 'xss-prevention',
    'csrf-protection', 'rate-limiting', 'media-validation', 'input-validation',
  ],
  infrastructureNeeds: ['real-time-updates', 'media-storage', 'push-notifications', 'presence-detection', 'message-queue'],
};

// ---------------------------------------------------------------------------
// 14. booking-system
// ---------------------------------------------------------------------------

const BOOKING_SYSTEM: AppTypeDependencyTree = {
  appType: 'booking-system',
  firstOrderDeps: [
    { name: 'navigation', uiPatterns: ['navbar', 'search-bar', 'avatar'], required: true },
    { name: 'service-catalog', uiPatterns: ['grid', 'card', 'image', 'badge', 'button'], required: true },
    { name: 'calendar-picker', uiPatterns: ['grid', 'button', 'icon', 'badge'], required: true },
    { name: 'time-slot-selector', uiPatterns: ['grid', 'button', 'badge'], required: true },
    { name: 'booking-form', uiPatterns: ['form', 'input', 'select', 'textarea', 'button'], required: true },
    { name: 'booking-confirmation', uiPatterns: ['card', 'icon', 'button'], required: true },
    { name: 'footer', uiPatterns: ['footer'], required: true },
  ],
  secondOrderDeps: [
    { name: 'provider-profile', triggeredBy: 'service-catalog', uiPatterns: ['card', 'avatar', 'icon', 'badge', 'list'] },
    { name: 'form-validation', triggeredBy: 'booking-form', uiPatterns: ['input', 'alert'] },
    { name: 'payment-step', triggeredBy: 'booking-form', uiPatterns: ['form', 'input', 'button', 'spinner'] },
    { name: 'booking-summary', triggeredBy: 'booking-confirmation', uiPatterns: ['card', 'list', 'button'] },
    { name: 'cancellation-flow', triggeredBy: 'booking-confirmation', uiPatterns: ['modal', 'button', 'alert'] },
    { name: 'loading-states', triggeredBy: 'calendar-picker', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'availability-indicator', triggeredBy: 'time-slot-selector', uiPatterns: ['badge', 'tooltip'] },
  ],
  securityRequirements: [
    'authentication', 'payment-encryption', 'input-validation', 'xss-prevention',
    'csrf-protection', 'rate-limiting',
  ],
  infrastructureNeeds: ['payment-gateway', 'email-notifications', 'calendar-integration', 'analytics', 'sms-notifications'],
};

// ---------------------------------------------------------------------------
// 15. documentation
// ---------------------------------------------------------------------------

const DOCUMENTATION: AppTypeDependencyTree = {
  appType: 'documentation',
  firstOrderDeps: [
    { name: 'sidebar-navigation', uiPatterns: ['sidebar', 'list', 'icon', 'search-bar'], required: true },
    { name: 'top-bar', uiPatterns: ['navbar', 'search-bar', 'toggle', 'button'], required: true },
    { name: 'content-area', uiPatterns: ['card', 'tabs'], required: true },
    { name: 'table-of-contents', uiPatterns: ['sidebar', 'list'], required: true },
    { name: 'breadcrumbs', uiPatterns: ['breadcrumb'], required: true },
    { name: 'footer', uiPatterns: ['footer'], required: true },
  ],
  secondOrderDeps: [
    { name: 'code-blocks', triggeredBy: 'content-area', uiPatterns: ['card', 'button', 'icon', 'tabs'] },
    { name: 'search-results', triggeredBy: 'top-bar', uiPatterns: ['modal', 'list', 'icon', 'badge'] },
    { name: 'version-selector', triggeredBy: 'top-bar', uiPatterns: ['select', 'badge'] },
    { name: 'feedback-widget', triggeredBy: 'content-area', uiPatterns: ['button', 'icon', 'toast'] },
    { name: 'copy-button', triggeredBy: 'content-area', uiPatterns: ['button', 'icon', 'toast'] },
    { name: 'prev-next-navigation', triggeredBy: 'content-area', uiPatterns: ['button', 'icon'] },
    { name: 'mobile-nav', triggeredBy: 'sidebar-navigation', uiPatterns: ['drawer', 'button'] },
  ],
  securityRequirements: ['xss-prevention', 'csrf-protection', 'content-integrity'],
  infrastructureNeeds: ['seo-meta-tags', 'search-indexing', 'analytics', 'content-versioning', 'content-caching'],
};

// ---------------------------------------------------------------------------
// 16. admin-panel
// ---------------------------------------------------------------------------

const ADMIN_PANEL: AppTypeDependencyTree = {
  appType: 'admin-panel',
  firstOrderDeps: [
    { name: 'sidebar-navigation', uiPatterns: ['sidebar', 'icon', 'badge'], required: true },
    { name: 'top-bar', uiPatterns: ['navbar', 'search-bar', 'avatar', 'notification'], required: true },
    { name: 'data-table', uiPatterns: ['table', 'checkbox', 'pagination', 'button', 'badge'], required: true },
    { name: 'detail-view', uiPatterns: ['card', 'tabs', 'form', 'input', 'select', 'button'], required: true },
    { name: 'stats-overview', uiPatterns: ['card', 'chart', 'icon'], required: true },
    { name: 'user-management', uiPatterns: ['table', 'avatar', 'badge', 'button', 'modal'], required: true },
  ],
  secondOrderDeps: [
    { name: 'table-filters', triggeredBy: 'data-table', uiPatterns: ['select', 'input', 'tag', 'button'] },
    { name: 'bulk-actions', triggeredBy: 'data-table', uiPatterns: ['checkbox', 'button', 'modal', 'toast'] },
    { name: 'form-validation', triggeredBy: 'detail-view', uiPatterns: ['input', 'alert'] },
    { name: 'role-editor', triggeredBy: 'user-management', uiPatterns: ['modal', 'checkbox', 'select', 'button'] },
    { name: 'audit-log', triggeredBy: 'detail-view', uiPatterns: ['list', 'icon', 'badge'] },
    { name: 'delete-confirmation', triggeredBy: 'data-table', uiPatterns: ['modal', 'button', 'alert'] },
    { name: 'loading-states', triggeredBy: 'data-table', uiPatterns: ['skeleton', 'spinner'] },
    { name: 'export-controls', triggeredBy: 'data-table', uiPatterns: ['button', 'popover', 'icon'] },
  ],
  securityRequirements: [
    'authentication', 'authorization', 'role-based-access', 'audit-logging',
    'session-management', 'csrf-protection', 'xss-prevention', 'rate-limiting',
    'ip-whitelisting', 'data-encryption',
  ],
  infrastructureNeeds: ['analytics', 'error-tracking', 'data-export', 'email-notifications', 'backup-system'],
};

// ---------------------------------------------------------------------------
// 17. authentication-flow (uses appType 'custom' -- not a standalone AppType)
// ---------------------------------------------------------------------------

const AUTHENTICATION_FLOW: AppTypeDependencyTree = {
  appType: 'custom',
  firstOrderDeps: [
    { name: 'login-form', uiPatterns: ['form', 'input', 'button', 'icon'], required: true },
    { name: 'registration-form', uiPatterns: ['form', 'input', 'button', 'checkbox'], required: true },
    { name: 'forgot-password', uiPatterns: ['form', 'input', 'button'], required: true },
    { name: 'social-login', uiPatterns: ['button', 'icon'], required: false },
    { name: 'branding-panel', uiPatterns: ['image', 'hero-section'], required: false },
    { name: 'two-factor-auth', uiPatterns: ['form', 'input', 'button', 'icon'], required: false },
  ],
  secondOrderDeps: [
    { name: 'form-validation', triggeredBy: 'login-form', uiPatterns: ['input', 'alert'] },
    { name: 'registration-validation', triggeredBy: 'registration-form', uiPatterns: ['input', 'alert', 'icon'] },
    { name: 'password-strength', triggeredBy: 'registration-form', uiPatterns: ['progress', 'icon', 'tooltip'] },
    { name: 'loading-states', triggeredBy: 'login-form', uiPatterns: ['spinner', 'button'] },
    { name: 'error-messages', triggeredBy: 'login-form', uiPatterns: ['alert', 'toast'] },
    { name: 'email-verification', triggeredBy: 'registration-form', uiPatterns: ['card', 'icon', 'button'] },
    { name: 'reset-confirmation', triggeredBy: 'forgot-password', uiPatterns: ['card', 'icon'] },
  ],
  securityRequirements: [
    'password-hashing', 'brute-force-protection', 'rate-limiting', 'session-management',
    'csrf-protection', 'xss-prevention', 'secure-cookie-handling', 'input-validation',
    'account-lockout', 'oauth-state-validation',
  ],
  infrastructureNeeds: ['email-notifications', 'oauth-provider-integration', 'session-storage', 'audit-logging'],
};

// ---------------------------------------------------------------------------
// 18. settings-page (uses appType 'custom' -- not a standalone AppType)
// ---------------------------------------------------------------------------

const SETTINGS_PAGE: AppTypeDependencyTree = {
  appType: 'custom',
  firstOrderDeps: [
    { name: 'settings-navigation', uiPatterns: ['sidebar', 'list', 'icon'], required: true },
    { name: 'profile-settings', uiPatterns: ['form', 'input', 'avatar', 'button'], required: true },
    { name: 'notification-preferences', uiPatterns: ['form', 'toggle', 'checkbox', 'button'], required: true },
    { name: 'security-settings', uiPatterns: ['form', 'input', 'button', 'toggle'], required: true },
    { name: 'billing-section', uiPatterns: ['card', 'table', 'button', 'badge'], required: false },
    { name: 'api-keys', uiPatterns: ['table', 'button', 'icon', 'modal'], required: false },
  ],
  secondOrderDeps: [
    { name: 'avatar-upload', triggeredBy: 'profile-settings', uiPatterns: ['modal', 'image', 'button', 'progress'] },
    { name: 'form-validation', triggeredBy: 'profile-settings', uiPatterns: ['input', 'alert'] },
    { name: 'password-change', triggeredBy: 'security-settings', uiPatterns: ['modal', 'form', 'input', 'button'] },
    { name: 'two-factor-setup', triggeredBy: 'security-settings', uiPatterns: ['modal', 'form', 'input', 'image'] },
    { name: 'plan-upgrade-modal', triggeredBy: 'billing-section', uiPatterns: ['modal', 'card', 'button', 'badge'] },
    { name: 'api-key-generation', triggeredBy: 'api-keys', uiPatterns: ['modal', 'input', 'button', 'icon', 'toast'] },
    { name: 'save-confirmation', triggeredBy: 'profile-settings', uiPatterns: ['toast', 'button'] },
    { name: 'danger-zone', triggeredBy: 'security-settings', uiPatterns: ['card', 'button', 'modal', 'alert'] },
  ],
  securityRequirements: [
    'authentication', 'session-management', 'csrf-protection', 'xss-prevention',
    'input-validation', 'password-hashing', 'api-key-encryption',
  ],
  infrastructureNeeds: ['email-notifications', 'payment-gateway', 'audit-logging'],
};

// ---------------------------------------------------------------------------
// 19. onboarding-flow (uses appType 'custom' -- not a standalone AppType)
// ---------------------------------------------------------------------------

const ONBOARDING_FLOW: AppTypeDependencyTree = {
  appType: 'custom',
  firstOrderDeps: [
    { name: 'welcome-screen', uiPatterns: ['hero-section', 'image', 'button'], required: true },
    { name: 'step-indicator', uiPatterns: ['progress', 'icon'], required: true },
    { name: 'profile-setup', uiPatterns: ['form', 'input', 'select', 'avatar', 'button'], required: true },
    { name: 'preferences-selection', uiPatterns: ['grid', 'card', 'checkbox', 'icon', 'button'], required: true },
    { name: 'feature-tour', uiPatterns: ['card', 'image', 'button', 'icon'], required: false },
    { name: 'completion-screen', uiPatterns: ['card', 'icon', 'button'], required: true },
  ],
  secondOrderDeps: [
    { name: 'avatar-upload', triggeredBy: 'profile-setup', uiPatterns: ['modal', 'image', 'button', 'progress'] },
    { name: 'form-validation', triggeredBy: 'profile-setup', uiPatterns: ['input', 'alert'] },
    { name: 'tooltip-hints', triggeredBy: 'feature-tour', uiPatterns: ['tooltip', 'popover', 'icon'] },
    { name: 'skip-confirmation', triggeredBy: 'welcome-screen', uiPatterns: ['modal', 'button'] },
    { name: 'loading-states', triggeredBy: 'profile-setup', uiPatterns: ['spinner', 'skeleton'] },
    { name: 'team-invite', triggeredBy: 'completion-screen', uiPatterns: ['form', 'input', 'button', 'list'] },
  ],
  securityRequirements: [
    'authentication', 'input-validation', 'xss-prevention', 'csrf-protection',
  ],
  infrastructureNeeds: ['analytics', 'email-notifications', 'user-preferences-storage'],
};

// ---------------------------------------------------------------------------
// 20. error-pages (uses appType 'custom' -- not a standalone AppType)
// ---------------------------------------------------------------------------

const ERROR_PAGES: AppTypeDependencyTree = {
  appType: 'custom',
  firstOrderDeps: [
    { name: '404-not-found', uiPatterns: ['hero-section', 'image', 'button'], required: true },
    { name: '500-server-error', uiPatterns: ['hero-section', 'image', 'button'], required: true },
    { name: '403-forbidden', uiPatterns: ['hero-section', 'icon', 'button'], required: true },
    { name: 'maintenance-page', uiPatterns: ['hero-section', 'image', 'icon'], required: false },
    { name: 'offline-page', uiPatterns: ['hero-section', 'icon', 'button'], required: false },
  ],
  secondOrderDeps: [
    { name: 'search-suggestion', triggeredBy: '404-not-found', uiPatterns: ['search-bar', 'list', 'button'] },
    { name: 'auto-redirect', triggeredBy: '404-not-found', uiPatterns: ['progress', 'spinner'] },
    { name: 'retry-button', triggeredBy: '500-server-error', uiPatterns: ['button', 'spinner'] },
    { name: 'status-indicator', triggeredBy: 'maintenance-page', uiPatterns: ['progress', 'badge', 'icon'] },
    { name: 'contact-support', triggeredBy: '500-server-error', uiPatterns: ['button', 'icon'] },
  ],
  securityRequirements: ['xss-prevention', 'information-hiding'],
  infrastructureNeeds: ['error-tracking', 'analytics'],
};

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * All 20 app type dependency trees. Keyed by a human-readable slug that matches
 * the spec's list. For the 16 standard AppType values the key IS the AppType value.
 * For the 4 supplementary entries (authentication-flow, settings-page,
 * onboarding-flow, error-pages) the key is the slug from the spec and the inner
 * `appType` field is set to 'custom'.
 */
export const APP_TYPE_DEPENDENCY_TREES: Record<string, AppTypeDependencyTree> = {
  'landing-page': LANDING_PAGE,
  'saas-dashboard': SAAS_DASHBOARD,
  'e-commerce': E_COMMERCE,
  'portfolio': PORTFOLIO,
  'blog': BLOG,
  'social-platform': SOCIAL_PLATFORM,
  'marketplace': MARKETPLACE,
  'crm': CRM,
  'project-management': PROJECT_MANAGEMENT,
  'analytics-dashboard': ANALYTICS_DASHBOARD,
  'ai-tool': AI_TOOL,
  'video-platform': VIDEO_PLATFORM,
  'messaging-app': MESSAGING_APP,
  'booking-system': BOOKING_SYSTEM,
  'documentation': DOCUMENTATION,
  'admin-panel': ADMIN_PANEL,
  'authentication-flow': AUTHENTICATION_FLOW,
  'settings-page': SETTINGS_PAGE,
  'onboarding-flow': ONBOARDING_FLOW,
  'error-pages': ERROR_PAGES,
};

/**
 * Look up a dependency tree by AppType value or by slug name.
 * Returns undefined for 'custom' AppType (custom apps are handled dynamically)
 * and for any unknown key.
 */
export function getAppTypeDependencyTree(appType: AppType): AppTypeDependencyTree | undefined {
  return APP_TYPE_DEPENDENCY_TREES[appType];
}
