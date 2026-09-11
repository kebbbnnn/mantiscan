export interface TriggerAuditOptions {
  siteId: string;
  url: string;
  name: string;
  callbackUrl: string;
  ingestSecret: string;
  githubOwner?: string;
  githubRepo?: string;
  githubToken?: string;
}

export interface TriggerResult {
  success: boolean;
  mode: 'github_actions' | 'local_simulated';
  message: string;
}

export async function triggerAuditWorkflow(options: TriggerAuditOptions): Promise<TriggerResult> {
  const { siteId, url, name, callbackUrl, ingestSecret, githubOwner, githubRepo, githubToken } = options;

  // If GitHub credentials are configured, trigger the real GitHub Actions workflow
  if (githubOwner && githubRepo && githubToken) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/audit.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Mantiscan-App',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              site_id: siteId,
              url,
              name,
              callback_url: callbackUrl,
              ingest_secret: ingestSecret,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          mode: 'github_actions',
          message: `GitHub API error (${response.status}): ${errorText}`,
        };
      }

      return {
        success: true,
        mode: 'github_actions',
        message: 'Successfully triggered GitHub Actions workflow dispatch',
      };
    } catch (err: unknown) {
      return {
        success: false,
        mode: 'github_actions',
        message: `Failed to connect to GitHub API: ${(err as Error).message}`,
      };
    }
  }

  // Otherwise, return local simulated mode for local offline development
  return {
    success: true,
    mode: 'local_simulated',
    message: 'Local development mode: Audit queued. Use local runner or mock webhook to ingest results.',
  };
}
