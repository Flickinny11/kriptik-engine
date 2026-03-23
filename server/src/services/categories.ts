/**
 * Category definitions with display metadata for the dependency catalog UI.
 */

import type { CategoryMeta, ServiceCategory } from './registry-types.js';

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'database',
    label: 'Databases',
    description: 'Relational, document, vector, and key-value databases',
    sortOrder: 0,
  },
  {
    id: 'hosting',
    label: 'Hosting & Deployment',
    description: 'Application hosting, serverless, and deployment platforms',
    sortOrder: 1,
  },
  {
    id: 'auth',
    label: 'Authentication',
    description: 'User authentication, identity, and access management',
    sortOrder: 2,
  },
  {
    id: 'payments',
    label: 'Payments & Billing',
    description: 'Payment processing, subscriptions, and invoicing',
    sortOrder: 3,
  },
  {
    id: 'ai-ml',
    label: 'AI & Machine Learning',
    description: 'AI model APIs, inference, training, and ML platforms',
    sortOrder: 4,
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Transactional and marketing email delivery',
    sortOrder: 5,
  },
  {
    id: 'monitoring',
    label: 'Monitoring & Observability',
    description: 'Error tracking, logging, performance monitoring',
    sortOrder: 6,
  },
  {
    id: 'communication',
    label: 'Communication',
    description: 'Messaging, SMS, chat, and real-time communication',
    sortOrder: 7,
  },
  {
    id: 'storage',
    label: 'Storage',
    description: 'File storage, CDN, and media management',
    sortOrder: 8,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Product analytics, event tracking, and data insights',
    sortOrder: 9,
  },
  {
    id: 'design',
    label: 'Design',
    description: 'Design tools, asset management, and prototyping',
    sortOrder: 10,
  },
  {
    id: 'devtools',
    label: 'Developer Tools',
    description: 'Version control, project management, and development utilities',
    sortOrder: 11,
  },
  {
    id: 'other',
    label: 'Other',
    description: 'Services that do not fit a specific category',
    sortOrder: 12,
  },
];

/** Get category metadata by ID */
export function getCategoryMeta(id: ServiceCategory): CategoryMeta | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** Get all categories in display order */
export function getSortedCategories(): CategoryMeta[] {
  return CATEGORIES;
}
