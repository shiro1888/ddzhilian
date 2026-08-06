import { readFile } from 'node:fs/promises';

export type BuildInfo = {
  sha: string | null;
  builtAt: string | null;
  runId: string | null;
};

type BuildInfoFile = Partial<Record<keyof BuildInfo, unknown>>;

type LoadBuildInfoOptions = {
  file?: string | URL;
  env?: Record<string, string | undefined>;
};

function normalizeBuildInfoValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function readBuildInfoFile(file: string | URL): Promise<BuildInfoFile> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as BuildInfoFile : {};
  } catch {
    return {};
  }
}

export async function loadBuildInfo(options: LoadBuildInfoOptions = {}): Promise<BuildInfo> {
  const env = options.env ?? process.env;
  const file = options.file ?? new URL('../.build-info.json', import.meta.url);
  const payload = await readBuildInfoFile(file);

  return {
    sha:
      normalizeBuildInfoValue(payload.sha) ??
      normalizeBuildInfoValue(env.DDZHILIAN_BUILD_SHA) ??
      normalizeBuildInfoValue(env.GITHUB_SHA),
    builtAt:
      normalizeBuildInfoValue(payload.builtAt) ??
      normalizeBuildInfoValue(env.DDZHILIAN_BUILD_AT),
    runId:
      normalizeBuildInfoValue(payload.runId) ??
      normalizeBuildInfoValue(env.DDZHILIAN_BUILD_RUN_ID) ??
      normalizeBuildInfoValue(env.GITHUB_RUN_ID),
  };
}
