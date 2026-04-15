/**
 * ExperienceMetrics — learning engine observability.
 *
 * Aggregates stats about the global experience memory, tracks build
 * quality trends, and provides a heuristic model readiness assessment.
 */

import type { GlobalMemoryService } from './global-memory.js';

export interface MetricsSnapshot {
  totalExperiences: number;
  averageStrength: number;
  strengthDistribution: {
    veryWeak: number;   // 0 - 0.2
    weak: number;       // 0.2 - 0.4
    moderate: number;   // 0.4 - 0.6
    strong: number;     // 0.6 - 0.8
    veryStrong: number; // 0.8 - 1.0
  };
  byType: Record<string, number>;
  topActivated: Array<{ id: string; title: string; activationCount: number }>;
  topReinforced: Array<{ id: string; title: string; reinforcements: number }>;
  topContradicted: Array<{ id: string; title: string; contradictions: number }>;
  domainCoverage: Record<string, number>;
  buildCount: number;
  lastDecayCycle: number;
}

export interface ModelReadinessAssessment {
  domains: Array<{
    domain: string;
    experienceCount: number;
    averageStrength: number;
    readiness: 'high' | 'moderate' | 'low' | 'insufficient';
    recommendation: string;
  }>;
  overallAssessment: string;
}

export class ExperienceMetrics {
  private globalMemory: GlobalMemoryService;

  constructor(globalMemory: GlobalMemoryService) {
    this.globalMemory = globalMemory;
  }

  /**
   * Compute a full metrics snapshot of the global experience memory.
   */
  async computeSnapshot(): Promise<MetricsSnapshot> {
    const [stats, metadata] = await Promise.all([
      this.globalMemory.getExperienceStats(),
      this.globalMemory.getMetadata(),
    ]);

    // For distribution and domain coverage, we need a deeper scan
    const detailedStats = await this.computeDetailedStats();

    return {
      totalExperiences: stats.totalExperiences,
      averageStrength: stats.averageStrength,
      strengthDistribution: detailedStats.strengthDistribution,
      byType: stats.byType,
      topActivated: stats.topActivated,
      topReinforced: detailedStats.topReinforced,
      topContradicted: detailedStats.topContradicted,
      domainCoverage: detailedStats.domainCoverage,
      buildCount: metadata.buildCount,
      lastDecayCycle: metadata.lastDecayCycle,
    };
  }

  /**
   * Assess whether cheaper models could handle builds in specific domains.
   * Conservative heuristic — errs on the side of "not ready."
   */
  async assessModelReadiness(): Promise<ModelReadinessAssessment> {
    const detailedStats = await this.computeDetailedStats();

    const domains: ModelReadinessAssessment['domains'] = [];

    for (const [domain, count] of Object.entries(detailedStats.domainCoverage)) {
      const avgStrength = detailedStats.domainStrengths[domain] || 0;

      let readiness: 'high' | 'moderate' | 'low' | 'insufficient';
      let recommendation: string;

      if (count >= 200 && avgStrength >= 0.7) {
        readiness = 'high';
        recommendation = `Strong experience coverage in ${domain}. A cheaper model could likely produce comparable results with this experience base.`;
      } else if (count >= 100 && avgStrength >= 0.5) {
        readiness = 'moderate';
        recommendation = `Moderate experience in ${domain}. A cheaper model might handle common patterns but could struggle with edge cases.`;
      } else if (count >= 30 && avgStrength >= 0.3) {
        readiness = 'low';
        recommendation = `Limited experience in ${domain}. Would still benefit significantly from a capable model.`;
      } else {
        readiness = 'insufficient';
        recommendation = `Insufficient experience in ${domain} (${count} experiences, avg strength ${avgStrength.toFixed(2)}). Full model capability needed.`;
      }

      domains.push({ domain, experienceCount: count, averageStrength: avgStrength, readiness, recommendation });
    }

    // Sort by readiness (high first)
    const readinessOrder = { high: 0, moderate: 1, low: 2, insufficient: 3 };
    domains.sort((a, b) => readinessOrder[a.readiness] - readinessOrder[b.readiness]);

    const highDomains = domains.filter((d) => d.readiness === 'high').length;
    const totalDomains = domains.length;

    let overallAssessment: string;
    if (totalDomains === 0) {
      overallAssessment = 'No experience data yet. The learning engine needs builds to accumulate knowledge.';
    } else if (highDomains === totalDomains) {
      overallAssessment = 'All tracked domains have high experience coverage. Model cost optimization is viable across the board.';
    } else if (highDomains > 0) {
      overallAssessment = `${highDomains}/${totalDomains} domains have high experience coverage. Selective model optimization is possible for those domains.`;
    } else {
      overallAssessment = 'Experience coverage is still building. Continue using full-capability models while the learning engine accumulates knowledge.';
    }

    return { domains, overallAssessment };
  }

  /**
   * Format metrics for SSE emission.
   */
  async formatForSSE(): Promise<Record<string, unknown>> {
    const snapshot = await this.computeSnapshot();
    return {
      totalExperiences: snapshot.totalExperiences,
      averageStrength: Math.round(snapshot.averageStrength * 100) / 100,
      buildCount: snapshot.buildCount,
      topDomains: Object.entries(snapshot.domainCoverage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([domain, count]) => ({ domain, count })),
      strengthDistribution: snapshot.strengthDistribution,
      byType: snapshot.byType,
    };
  }

  private async computeDetailedStats(): Promise<{
    strengthDistribution: MetricsSnapshot['strengthDistribution'];
    topReinforced: Array<{ id: string; title: string; reinforcements: number }>;
    topContradicted: Array<{ id: string; title: string; contradictions: number }>;
    domainCoverage: Record<string, number>;
    domainStrengths: Record<string, number>;
  }> {
    // We'll reuse the scroll-through approach from getExperienceStats
    // but compute additional dimensions
    const distribution = { veryWeak: 0, weak: 0, moderate: 0, strong: 0, veryStrong: 0 };
    const reinforced: Array<{ id: string; title: string; reinforcements: number }> = [];
    const contradicted: Array<{ id: string; title: string; contradictions: number }> = [];
    const domainCounts: Record<string, number> = {};
    const domainStrengthSums: Record<string, number> = {};

    // Query all experiences (we need to reuse globalMemory's internal scroll)
    // Since we can't access the private Qdrant client, we'll use the public queryExperience
    // with a very broad search. This is not ideal for large collections but works for
    // the current scale. For production, we'd add a dedicated scroll method.
    const allExperiences = await this.globalMemory.queryExperience({
      semanticSignal: 'software development patterns',
      limit: 1000,
      minStrength: 0.001,
    });

    for (const exp of allExperiences) {
      // Strength distribution
      if (exp.strength < 0.2) distribution.veryWeak++;
      else if (exp.strength < 0.4) distribution.weak++;
      else if (exp.strength < 0.6) distribution.moderate++;
      else if (exp.strength < 0.8) distribution.strong++;
      else distribution.veryStrong++;

      // Reinforcement/contradiction tracking
      reinforced.push({ id: exp.id, title: exp.title, reinforcements: exp.reinforcements });
      contradicted.push({ id: exp.id, title: exp.title, contradictions: exp.contradictions });

      // Domain coverage
      for (const fw of exp.context.frameworks) {
        domainCounts[fw] = (domainCounts[fw] || 0) + 1;
        domainStrengthSums[fw] = (domainStrengthSums[fw] || 0) + exp.strength;
      }
      for (const integ of exp.context.integrations) {
        domainCounts[integ] = (domainCounts[integ] || 0) + 1;
        domainStrengthSums[integ] = (domainStrengthSums[integ] || 0) + exp.strength;
      }
      if (exp.context.appType) {
        domainCounts[exp.context.appType] = (domainCounts[exp.context.appType] || 0) + 1;
        domainStrengthSums[exp.context.appType] = (domainStrengthSums[exp.context.appType] || 0) + exp.strength;
      }
    }

    // Sort and limit top lists
    reinforced.sort((a, b) => b.reinforcements - a.reinforcements);
    contradicted.sort((a, b) => b.contradictions - a.contradictions);

    // Compute average strengths per domain
    const domainStrengths: Record<string, number> = {};
    for (const [domain, sum] of Object.entries(domainStrengthSums)) {
      domainStrengths[domain] = sum / (domainCounts[domain] || 1);
    }

    return {
      strengthDistribution: distribution,
      topReinforced: reinforced.slice(0, 10),
      topContradicted: contradicted.slice(0, 10),
      domainCoverage: domainCounts,
      domainStrengths,
    };
  }
}
