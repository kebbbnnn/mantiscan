import type { AuditScores, CoreWebVitals, DeviceStrategy, AlertChannel } from '@mantiscan/shared';
import type { SiteRow, AuditRunRow } from '../db/schema.js';

export interface AlertEvaluationResult {
  action: 'degraded' | 'recovered' | 'regression' | 'none';
  newStatus: 'healthy' | 'degraded';
  title: string;
  summary: string;
}

export function evaluateAuditState(
  site: SiteRow,
  currentScores: AuditScores,
  strategy: DeviceStrategy,
  metrics?: CoreWebVitals | null,
  previousRun?: AuditRunRow | null
): AlertEvaluationResult {
  const lcpTarget = site.lcpThresholdMs ?? 2500;
  const clsTarget = site.clsThreshold ?? 0.1;
  const inpTarget = site.inpThresholdMs ?? 200;

  const lcpBreach = metrics?.lcpMs != null && metrics.lcpMs > lcpTarget;
  const clsBreach = metrics?.cls != null && metrics.cls > clsTarget;
  const inpBreach = metrics?.inpMs != null && metrics.inpMs > inpTarget;

  const scoreBreaches: string[] = [];
  if (currentScores.performance < site.perfThreshold) {
    scoreBreaches.push(`Perf ${currentScores.performance} < ${site.perfThreshold}`);
  }
  if (currentScores.accessibility < site.a11yThreshold) {
    scoreBreaches.push(`A11y ${currentScores.accessibility} < ${site.a11yThreshold}`);
  }
  if (currentScores.bestPractices < site.bestPracticesThreshold) {
    scoreBreaches.push(`BestPractices ${currentScores.bestPractices} < ${site.bestPracticesThreshold}`);
  }
  if (currentScores.seo < site.seoThreshold) {
    scoreBreaches.push(`SEO ${currentScores.seo} < ${site.seoThreshold}`);
  }

  const cwvBreaches: string[] = [];
  if (lcpBreach) {
    cwvBreaches.push(`LCP ${(metrics!.lcpMs! / 1000).toFixed(2)}s > ${(lcpTarget / 1000).toFixed(2)}s`);
  }
  if (clsBreach) {
    cwvBreaches.push(`CLS ${metrics!.cls!.toFixed(3)} > ${clsTarget.toFixed(3)}`);
  }
  if (inpBreach) {
    cwvBreaches.push(`INP ${metrics!.inpMs!}ms > ${inpTarget}ms`);
  }

  const allBreaches = [...scoreBreaches, ...cwvBreaches];
  const isFailing = allBreaches.length > 0;
  const newStatus: 'healthy' | 'degraded' = isFailing ? 'degraded' : 'healthy';
  const prevStatus = site.status;

  // Check for sharp regression (>= 10 points drop from previous run of the same strategy)
  let isRegression = false;
  if (previousRun) {
    const perfDrop = previousRun.performanceScore - currentScores.performance;
    const a11yDrop = previousRun.accessibilityScore - currentScores.accessibility;
    if (perfDrop >= 10 || a11yDrop >= 10) {
      isRegression = true;
    }
  }

  // 1. Transition: Healthy -> Degraded
  if (prevStatus !== 'degraded' && newStatus === 'degraded') {
    return {
      action: 'degraded',
      newStatus,
      title: `🚨 Lighthouse Alert: ${site.name} fell below thresholds`,
      summary: `Threshold breached on ${strategy}: ${allBreaches.join(', ')}.`,
    };
  }

  // 2. Transition: Degraded -> Healthy
  if (prevStatus === 'degraded' && newStatus === 'healthy') {
    return {
      action: 'recovered',
      newStatus,
      title: `✅ Lighthouse Recovery: ${site.name} restored to healthy status`,
      summary: `All categories and Core Web Vitals have met or exceeded thresholds on ${strategy}. Current scores: Perf ${currentScores.performance}, A11y ${currentScores.accessibility}.`,
    };
  }

  // 3. Significant regression delta (even if above threshold, or worsening)
  if (isRegression) {
    return {
      action: 'regression',
      newStatus,
      title: `⚠️ Lighthouse Regression Warning: ${site.name} scores dropped significantly`,
      summary: `Detected a drop of ≥10 points on ${strategy}. Perf: ${currentScores.performance} (was ${previousRun?.performanceScore}), A11y: ${currentScores.accessibility} (was ${previousRun?.accessibilityScore}).`,
    };
  }

  // 4. Still degraded, but unchanged state -> suppress duplicate alert to prevent fatigue
  return {
    action: 'none',
    newStatus,
    title: '',
    summary: '',
  };
}

export function buildSlackPayload(
  site: SiteRow,
  scores: AuditScores,
  metrics: CoreWebVitals,
  strategy: DeviceStrategy,
  evalResult: AlertEvaluationResult,
  reportUrl?: string | null
) {
  const statusEmoji = evalResult.action === 'degraded' ? '🚨' : evalResult.action === 'recovered' ? '✅' : '⚠️';
  const color = evalResult.action === 'degraded' ? '#E74C3C' : evalResult.action === 'recovered' ? '#2ECC71' : '#F39C12';

  const lcpTarget = site.lcpThresholdMs ?? 2500;
  const clsTarget = site.clsThreshold ?? 0.1;
  const inpTarget = site.inpThresholdMs ?? 200;

  const formatScore = (val: number, threshold: number) => {
    const icon = val >= threshold ? '🟢' : '🔴';
    return `${icon} *${val}* (target: ${threshold})`;
  };

  const formatCwvScore = (
    label: string,
    val: number | null | undefined,
    threshold: number,
    formatFn: (v: number) => string,
    thresholdStr: string
  ) => {
    if (val === null || val === undefined) {
      return `*${label}:*\n⚪ *N/A* (target: ≤${thresholdStr})`;
    }
    const isPassing = val <= threshold;
    const icon = isPassing ? '🟢' : '🔴';
    return `*${label}:*\n${icon} *${formatFn(val)}* (target: ≤${thresholdStr})`;
  };

  const cwvFields: Array<{ type: string; text: string }> = [
    {
      type: 'mrkdwn',
      text: formatCwvScore(
        'LCP',
        metrics.lcpMs,
        lcpTarget,
        (v) => `${(v / 1000).toFixed(2)}s`,
        `${(lcpTarget / 1000).toFixed(2)}s`
      ),
    },
    {
      type: 'mrkdwn',
      text: formatCwvScore(
        'CLS',
        metrics.cls,
        clsTarget,
        (v) => v.toFixed(3),
        clsTarget.toFixed(3)
      ),
    },
  ];

  if (metrics.inpMs !== null && metrics.inpMs !== undefined) {
    cwvFields.push({
      type: 'mrkdwn',
      text: formatCwvScore(
        'INP',
        metrics.inpMs,
        inpTarget,
        (v) => `${v}ms`,
        `${inpTarget}ms`
      ),
    });
  }

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${statusEmoji} Mantiscan: ${site.name} (${strategy.toUpperCase()})`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Website:* <${site.url}|${site.url}>\n*Alert:* ${evalResult.summary}`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Performance:*\n${formatScore(scores.performance, site.perfThreshold)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Accessibility:*\n${formatScore(scores.accessibility, site.a11yThreshold)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Best Practices:*\n${formatScore(scores.bestPractices, site.bestPracticesThreshold)}`,
        },
        {
          type: 'mrkdwn',
          text: `*SEO:*\n${formatScore(scores.seo, site.seoThreshold)}`,
        },
      ],
    },
    {
      type: 'section',
      fields: cwvFields,
    },
  ];

  if (reportUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📊 <${reportUrl}|*View Full Interactive Lighthouse Report*>`,
      },
    });
  }

  return {
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };
}

export function buildDiscordPayload(
  site: SiteRow,
  scores: AuditScores,
  metrics: CoreWebVitals,
  strategy: DeviceStrategy,
  evalResult: AlertEvaluationResult,
  reportUrl?: string | null
) {
  const color = evalResult.action === 'degraded' ? 0xe74c3c : evalResult.action === 'recovered' ? 0x2ecc71 : 0xf39c12;

  const lcpTarget = site.lcpThresholdMs ?? 2500;
  const clsTarget = site.clsThreshold ?? 0.1;
  const inpTarget = site.inpThresholdMs ?? 200;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: 'Performance',
      value: `${scores.performance} / ${site.perfThreshold}`,
      inline: true,
    },
    {
      name: 'Accessibility',
      value: `${scores.accessibility} / ${site.a11yThreshold}`,
      inline: true,
    },
    {
      name: 'Best Practices',
      value: `${scores.bestPractices} / ${site.bestPracticesThreshold}`,
      inline: true,
    },
    {
      name: 'SEO',
      value: `${scores.seo} / ${site.seoThreshold}`,
      inline: true,
    },
  ];

  const cwvParts: string[] = [];
  if (metrics.lcpMs !== null && metrics.lcpMs !== undefined) {
    const lcpPassing = metrics.lcpMs <= lcpTarget;
    cwvParts.push(`LCP: ${lcpPassing ? '🟢' : '🔴'} ${(metrics.lcpMs / 1000).toFixed(2)}s (target ≤${(lcpTarget / 1000).toFixed(2)}s)`);
  }
  if (metrics.cls !== null && metrics.cls !== undefined) {
    const clsPassing = metrics.cls <= clsTarget;
    cwvParts.push(`CLS: ${clsPassing ? '🟢' : '🔴'} ${metrics.cls.toFixed(3)} (target ≤${clsTarget.toFixed(3)})`);
  }
  if (metrics.inpMs !== null && metrics.inpMs !== undefined) {
    const inpPassing = metrics.inpMs <= inpTarget;
    cwvParts.push(`INP: ${inpPassing ? '🟢' : '🔴'} ${metrics.inpMs}ms (target ≤${inpTarget}ms)`);
  }

  if (cwvParts.length > 0) {
    fields.push({
      name: 'Core Web Vitals',
      value: cwvParts.join(' | '),
      inline: false,
    });
  }

  return {
    embeds: [
      {
        title: evalResult.title,
        url: reportUrl || site.url,
        description: `**URL:** ${site.url}\n**Viewport:** ${strategy}\n\n${evalResult.summary}`,
        color,
        fields,
        footer: {
          text: 'Mantiscan Automated Alert',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function dispatchAlert(
  channel: AlertChannel,
  site: SiteRow,
  scores: AuditScores,
  metrics: CoreWebVitals,
  strategy: DeviceStrategy,
  evalResult: AlertEvaluationResult,
  reportUrl?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    let payload: Record<string, unknown>;

    if (channel.type === 'slack') {
      payload = buildSlackPayload(site, scores, metrics, strategy, evalResult, reportUrl);
    } else if (channel.type === 'discord') {
      payload = buildDiscordPayload(site, scores, metrics, strategy, evalResult, reportUrl);
    } else {
      return { success: false, error: `Unsupported channel type: ${channel.type}` };
    }

    const response = await fetch(channel.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Webhook returned status ${response.status}: ${text}` };
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
