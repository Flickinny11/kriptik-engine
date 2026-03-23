/**
 * Forensic Audit Report Generator
 *
 * Compiles raw analysis results from all 5 concurrent teams into
 * a structured, actionable report with health scoring and
 * prioritized recommendations.
 */

// ── Report Types ────────────────────────────────────────────────────

export interface ForensicAuditReport {
  summary: {
    overallHealth: 'critical' | 'poor' | 'fair' | 'good' | 'excellent';
    score: number; // 0-100
    totalFindings: number;
    criticalFindings: number;
    warningFindings: number;
    infoFindings: number;
    auditDuration: string;
    timestamp: string;
  };
  sections: {
    compilation: {
      typescriptErrors: number;
      buildSucceeded: boolean;
      buildErrors: string[];
    };
    security: {
      riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
      hardcodedSecrets: string[];
      xssVectors: string[];
      injectionRisks: string[];
      vulnerableDeps: Array<{ name: string; severity: string; advisory: string }>;
      missingCsrf: boolean;
      insecureCors: boolean;
    };
    runtime: {
      silentErrors: Array<{ page: string; description: string; evidence: string }>;
      consoleErrors: string[];
      consoleWarnings: string[];
      networkFailures: Array<{ url: string; status: number; method: string }>;
      performanceIssues: Array<{ page: string; metric: string; value: number; threshold: number }>;
      memoryLeaks: string[];
    };
    architecture: {
      couplingScore: number;
      duplicationRate: number;
      testCoverageEstimate: number;
      fileOrganizationScore: number;
      a11yIssues: Array<{ file: string; issue: string }>;
      performanceAntiPatterns: Array<{ file: string; pattern: string }>;
      namingInconsistencies: string[];
    };
    codeQuality: {
      deadCodeFiles: string[];
      circularDeps: string[][];
      anyTypeUsages: number;
      orphanedComponents: string[];
      missingErrorBoundaries: string[];
      staleClosureRisks: string[];
    };
    codebaseMetrics: {
      totalComponents: number;
      totalRoutes: number;
      totalHooks: number;
      totalApiCalls: number;
      dependencyVulnerabilities: number;
    };
  };
  recommendations: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    affectedFiles: string[];
  }>;
}

// ── Input from concurrent teams ─────────────────────────────────────

interface AuditInput {
  staticAnalysis: {
    typescriptErrors: number;
    lintWarnings: number;
    dependencyVulnerabilities: number;
    deadCodeFiles: string[];
    circularDeps: string[][];
    bundleSizeEstimate: string;
  };
  semanticIntelligence: {
    totalComponents: number;
    totalRoutes: number;
    totalHooks: number;
    totalApiCalls: number;
    orphanedComponents: string[];
    missingErrorBoundaries: string[];
    staleClosureRisks: string[];
    anyTypeUsages: number;
    propDrillingDepth: number;
  };
  runtimeBehavior: {
    pagesVisited: number;
    consoleErrors: string[];
    consoleWarnings: string[];
    networkFailures: Array<{ url: string; status: number; method: string }>;
    interactiveElementsTested: number;
    silentErrors: Array<{ page: string; description: string; evidence: string }>;
    performanceIssues: Array<{ page: string; metric: string; value: number; threshold: number }>;
    buildSucceeded: boolean;
    buildErrors: string[];
  };
  securityAudit: {
    locationsForReview: number;
    hardcodedSecrets: string[];
    xssVectors: string[];
    injectionRisks: string[];
    missingCsrf: boolean;
    insecureCors: boolean;
    vulnerableDeps: Array<{ name: string; severity: string; advisory: string }>;
  };
  architectureReview: {
    couplingScore: number;
    duplicationRate: number;
    testCoverageEstimate: number;
    a11yIssues: Array<{ file: string; issue: string }>;
    performanceAntiPatterns: Array<{ file: string; pattern: string }>;
    namingInconsistencies: string[];
    fileOrganizationScore: number;
  };
  durationMs: number;
}

// ── Score calculation ───────────────────────────────────────────────

function calculateHealthScore(input: AuditInput): number {
  let score = 100;

  // Compilation deductions
  if (!input.runtimeBehavior.buildSucceeded) score -= 25;
  score -= Math.min(20, input.staticAnalysis.typescriptErrors * 2);

  // Security deductions (heaviest penalties)
  score -= input.securityAudit.hardcodedSecrets.length * 8;
  score -= input.securityAudit.xssVectors.length * 5;
  score -= input.securityAudit.injectionRisks.length * 10;
  score -= input.securityAudit.vulnerableDeps.filter(d => d.severity === 'critical').length * 6;
  score -= input.securityAudit.vulnerableDeps.filter(d => d.severity === 'high').length * 3;
  if (input.securityAudit.insecureCors) score -= 5;

  // Runtime deductions
  score -= Math.min(15, input.runtimeBehavior.silentErrors.length * 3);
  score -= Math.min(10, input.runtimeBehavior.consoleErrors.length);
  score -= Math.min(10, input.runtimeBehavior.networkFailures.length * 2);

  // Architecture deductions
  score -= Math.min(10, Math.floor(input.architectureReview.couplingScore / 10));
  score -= Math.min(5, Math.floor(input.architectureReview.duplicationRate / 5));
  if (input.architectureReview.testCoverageEstimate < 10) score -= 5;

  // Code quality deductions
  score -= Math.min(5, input.semanticIntelligence.orphanedComponents.length);
  score -= Math.min(5, input.semanticIntelligence.missingErrorBoundaries.length * 2);
  score -= Math.min(5, Math.floor(input.semanticIntelligence.anyTypeUsages / 20));

  // A11y deductions
  score -= Math.min(5, input.architectureReview.a11yIssues.length);

  return Math.max(0, Math.min(100, score));
}

function scoreToHealth(score: number): 'critical' | 'poor' | 'fair' | 'good' | 'excellent' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 55) return 'fair';
  if (score >= 30) return 'poor';
  return 'critical';
}

function securityRiskLevel(audit: AuditInput['securityAudit']): 'critical' | 'high' | 'medium' | 'low' | 'none' {
  if (audit.injectionRisks.length > 0 || audit.hardcodedSecrets.length > 3) return 'critical';
  if (audit.hardcodedSecrets.length > 0 || audit.xssVectors.length > 0) return 'high';
  if (audit.vulnerableDeps.length > 0 || audit.insecureCors) return 'medium';
  if (audit.missingCsrf) return 'low';
  return 'none';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

// ── Report generation ───────────────────────────────────────────────

export function generateAuditReport(input: AuditInput): ForensicAuditReport {
  const score = calculateHealthScore(input);
  const recommendations: ForensicAuditReport['recommendations'] = [];

  // Generate recommendations from findings

  // Critical: Build failures
  if (!input.runtimeBehavior.buildSucceeded) {
    recommendations.push({
      priority: 'critical',
      category: 'Build',
      title: 'Build is failing',
      description: `The project fails to build. Errors: ${input.runtimeBehavior.buildErrors.slice(0, 3).join('; ')}`,
      affectedFiles: [],
    });
  }

  // Critical: Hardcoded secrets
  if (input.securityAudit.hardcodedSecrets.length > 0) {
    recommendations.push({
      priority: 'critical',
      category: 'Security',
      title: 'Hardcoded secrets detected',
      description: `${input.securityAudit.hardcodedSecrets.length} hardcoded secret(s) found. Move to environment variables immediately.`,
      affectedFiles: input.securityAudit.hardcodedSecrets.map(s => s.split(':')[0]),
    });
  }

  // Critical: Injection risks
  if (input.securityAudit.injectionRisks.length > 0) {
    recommendations.push({
      priority: 'critical',
      category: 'Security',
      title: 'Injection vulnerabilities detected',
      description: `${input.securityAudit.injectionRisks.length} potential injection point(s). Use parameterized queries and input sanitization.`,
      affectedFiles: input.securityAudit.injectionRisks.map(r => r.split(':')[0]),
    });
  }

  // High: XSS vectors
  if (input.securityAudit.xssVectors.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Security',
      title: 'XSS vulnerabilities detected',
      description: `${input.securityAudit.xssVectors.length} XSS vector(s) found. Avoid dangerouslySetInnerHTML, innerHTML, and eval().`,
      affectedFiles: input.securityAudit.xssVectors.map(v => v.split(':')[0]),
    });
  }

  // High: TypeScript errors
  if (input.staticAnalysis.typescriptErrors > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Type Safety',
      title: `${input.staticAnalysis.typescriptErrors} TypeScript compilation errors`,
      description: 'Fix TypeScript errors to ensure type safety and prevent runtime issues.',
      affectedFiles: [],
    });
  }

  // High: Silent errors
  if (input.runtimeBehavior.silentErrors.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Reliability',
      title: `${input.runtimeBehavior.silentErrors.length} silent error(s) detected`,
      description: 'Empty catch blocks, unhandled promises, and event listener leaks found. These cause hard-to-debug issues in production.',
      affectedFiles: [...new Set(input.runtimeBehavior.silentErrors.map(e => e.page))],
    });
  }

  // High: Missing error boundaries
  if (input.semanticIntelligence.missingErrorBoundaries.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'Reliability',
      title: 'Page components without error boundaries',
      description: `${input.semanticIntelligence.missingErrorBoundaries.length} page-level component(s) will show a white screen if they crash.`,
      affectedFiles: [],
    });
  }

  // Medium: Vulnerable dependencies
  if (input.securityAudit.vulnerableDeps.length > 0) {
    recommendations.push({
      priority: 'medium',
      category: 'Security',
      title: `${input.securityAudit.vulnerableDeps.length} vulnerable dependencies`,
      description: `Run \`npm audit fix\` to address known vulnerabilities.`,
      affectedFiles: ['package.json'],
    });
  }

  // Medium: Low type safety
  if (input.semanticIntelligence.anyTypeUsages > 20) {
    recommendations.push({
      priority: 'medium',
      category: 'Type Safety',
      title: `${input.semanticIntelligence.anyTypeUsages} \`any\` type usages`,
      description: 'Replace `any` with proper types to catch bugs at compile time.',
      affectedFiles: [],
    });
  }

  // Medium: A11y issues
  if (input.architectureReview.a11yIssues.length > 0) {
    recommendations.push({
      priority: 'medium',
      category: 'Accessibility',
      title: `${input.architectureReview.a11yIssues.length} accessibility issues`,
      description: 'Missing alt text, empty buttons, onClick on divs. These affect users with assistive technology.',
      affectedFiles: [...new Set(input.architectureReview.a11yIssues.map(i => i.file))],
    });
  }

  // Medium: Performance anti-patterns
  if (input.architectureReview.performanceAntiPatterns.length > 0) {
    recommendations.push({
      priority: 'medium',
      category: 'Performance',
      title: `${input.architectureReview.performanceAntiPatterns.length} performance anti-patterns`,
      description: 'Inline objects in JSX, large components, and excessive useEffect dependencies cause unnecessary re-renders.',
      affectedFiles: [...new Set(input.architectureReview.performanceAntiPatterns.map(p => p.file))],
    });
  }

  // Low: Dead code
  if (input.staticAnalysis.deadCodeFiles.length > 0) {
    recommendations.push({
      priority: 'low',
      category: 'Code Quality',
      title: `${input.staticAnalysis.deadCodeFiles.length} potentially dead code file(s)`,
      description: 'Files with exports that are never imported. Review and remove if unused.',
      affectedFiles: input.staticAnalysis.deadCodeFiles.slice(0, 10),
    });
  }

  // Low: Low test coverage
  if (input.architectureReview.testCoverageEstimate < 20) {
    recommendations.push({
      priority: 'low',
      category: 'Testing',
      title: `Test coverage estimated at ${input.architectureReview.testCoverageEstimate}%`,
      description: 'Add tests for critical paths — authentication, payments, data mutations.',
      affectedFiles: [],
    });
  }

  // Sort recommendations by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Count findings by severity
  const criticalFindings = recommendations.filter(r => r.priority === 'critical').length;
  const warningFindings = recommendations.filter(r => r.priority === 'high' || r.priority === 'medium').length;
  const infoFindings = recommendations.filter(r => r.priority === 'low').length;

  // Compile memory leak indicators from runtime
  const memoryLeaks = input.runtimeBehavior.silentErrors
    .filter(e => e.description.includes('event listener') || e.description.includes('leaking'))
    .map(e => `${e.page}: ${e.description}`);

  return {
    summary: {
      overallHealth: scoreToHealth(score),
      score,
      totalFindings: recommendations.length,
      criticalFindings,
      warningFindings,
      infoFindings,
      auditDuration: formatDuration(input.durationMs),
      timestamp: new Date().toISOString(),
    },
    sections: {
      compilation: {
        typescriptErrors: input.staticAnalysis.typescriptErrors,
        buildSucceeded: input.runtimeBehavior.buildSucceeded,
        buildErrors: input.runtimeBehavior.buildErrors,
      },
      security: {
        riskLevel: securityRiskLevel(input.securityAudit),
        hardcodedSecrets: input.securityAudit.hardcodedSecrets,
        xssVectors: input.securityAudit.xssVectors,
        injectionRisks: input.securityAudit.injectionRisks,
        vulnerableDeps: input.securityAudit.vulnerableDeps,
        missingCsrf: input.securityAudit.missingCsrf,
        insecureCors: input.securityAudit.insecureCors,
      },
      runtime: {
        silentErrors: input.runtimeBehavior.silentErrors,
        consoleErrors: input.runtimeBehavior.consoleErrors,
        consoleWarnings: input.runtimeBehavior.consoleWarnings,
        networkFailures: input.runtimeBehavior.networkFailures,
        performanceIssues: input.runtimeBehavior.performanceIssues,
        memoryLeaks,
      },
      architecture: {
        couplingScore: input.architectureReview.couplingScore,
        duplicationRate: input.architectureReview.duplicationRate,
        testCoverageEstimate: input.architectureReview.testCoverageEstimate,
        fileOrganizationScore: input.architectureReview.fileOrganizationScore,
        a11yIssues: input.architectureReview.a11yIssues,
        performanceAntiPatterns: input.architectureReview.performanceAntiPatterns,
        namingInconsistencies: input.architectureReview.namingInconsistencies,
      },
      codeQuality: {
        deadCodeFiles: input.staticAnalysis.deadCodeFiles,
        circularDeps: input.staticAnalysis.circularDeps,
        anyTypeUsages: input.semanticIntelligence.anyTypeUsages,
        orphanedComponents: input.semanticIntelligence.orphanedComponents,
        missingErrorBoundaries: input.semanticIntelligence.missingErrorBoundaries,
        staleClosureRisks: input.semanticIntelligence.staleClosureRisks,
      },
      codebaseMetrics: {
        totalComponents: input.semanticIntelligence.totalComponents,
        totalRoutes: input.semanticIntelligence.totalRoutes,
        totalHooks: input.semanticIntelligence.totalHooks,
        totalApiCalls: input.semanticIntelligence.totalApiCalls,
        dependencyVulnerabilities: input.staticAnalysis.dependencyVulnerabilities,
      },
    },
    recommendations,
  };
}
