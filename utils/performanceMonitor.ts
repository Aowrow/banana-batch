/**
 * Performance monitoring utilities
 */

export interface PerformanceMetric {
  id: string;
  type: 'api_call' | 'image_generation' | 'image_optimization';
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completedMetrics: PerformanceMetric[] = [];
  private maxHistory = 50; // Keep last 50 metrics

  /**
   * Start tracking a performance metric
   */
  start(id: string, type: PerformanceMetric['type'], metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      id,
      type,
      startTime: performance.now(),
      metadata
    };
    this.metrics.set(id, metric);
  }

  /**
   * End tracking and calculate duration
   */
  end(id: string): number | null {
    const metric = this.metrics.get(id);
    if (!metric) {
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    const completedMetric: PerformanceMetric = {
      ...metric,
      endTime,
      duration
    };

    this.metrics.delete(id);
    this.completedMetrics.push(completedMetric);

    // Keep only recent history
    if (this.completedMetrics.length > this.maxHistory) {
      this.completedMetrics.shift();
    }

    return duration;
  }

  /**
   * Get statistics for a specific metric type
   */
  getStats(type: PerformanceMetric['type']): {
    count: number;
    avg: number;
    min: number;
    max: number;
    total: number;
  } | null {
    const metrics = this.completedMetrics.filter((m) => m.type === type && m.duration);

    if (metrics.length === 0) {
      return null;
    }

    const durations = metrics.map((m) => m.duration!);
    const total = durations.reduce((sum, d) => sum + d, 0);
    const avg = total / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    return {
      count: metrics.length,
      avg,
      min,
      max,
      total
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(limit: number = 10): PerformanceMetric[] {
    return this.completedMetrics.slice(-limit);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.completedMetrics = [];
  }

  /**
   * Format duration for display
   */
  formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    } else {
      return `${(ms / 1000).toFixed(1)}s`;
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Hook for measuring async operations
 */
export async function measureAsync<T>(
  id: string,
  type: PerformanceMetric['type'],
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  performanceMonitor.start(id, type, metadata);
  try {
    const result = await fn();
    return result;
  } finally {
    const duration = performanceMonitor.end(id);
    if (import.meta.env.DEV && duration !== null) {
      console.log(`[Performance] ${type} (${id}): ${performanceMonitor.formatDuration(duration)}`);
    }
  }
}
