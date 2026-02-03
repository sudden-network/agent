import { DefaultArtifactClient } from '@actions/artifact';
import { context, getOctokit } from '@actions/github';

type RepoArtifact = {
  id: number;
  name: string;
  expired: boolean;
  created_at?: string;
  workflow_run?: { id?: number };
};

const listArtifactsByName = async (githubToken: string, name: string): Promise<RepoArtifact[]> => {
  const { owner, repo } = context.repo;
  const octokit = getOctokit(githubToken);
  const artifacts = await octokit.paginate(octokit.rest.actions.listArtifactsForRepo, {
    owner,
    repo,
    per_page: 100,
    name,
  });
  return artifacts as RepoArtifact[];
};

const getLatestArtifact = async (githubToken: string, name: string): Promise<RepoArtifact | null> => {
  const artifacts = await listArtifactsByName(githubToken, name);
  const candidates = artifacts.filter((artifact) => !artifact.expired);
  return candidates.reduce<RepoArtifact | null>((latest, artifact) => {
    if (!latest) {
      return artifact;
    }
    const latestTime = latest.created_at ? Date.parse(latest.created_at) : 0;
    const artifactTime = artifact.created_at ? Date.parse(artifact.created_at) : 0;
    return artifactTime > latestTime ? artifact : latest;
  }, null);
};

export const downloadLatestArtifact = async (
  githubToken: string,
  name: string,
  downloadPath: string,
): Promise<RepoArtifact | null> => {
  const { owner, repo } = context.repo;
  const latest = await getLatestArtifact(githubToken, name);
  if (!latest) {
    return null;
  }
  const workflowRunId = latest.workflow_run?.id;
  if (!workflowRunId) {
    throw new Error('Latest artifact missing workflow run id.');
  }
  await new DefaultArtifactClient().downloadArtifact(latest.id, {
    path: downloadPath,
    findBy: {
      token: githubToken,
      repositoryOwner: owner,
      repositoryName: repo,
      workflowRunId,
    },
  });
  return latest;
};

export const uploadArtifact = async (name: string, rootDirectory: string): Promise<void> => {
  await new DefaultArtifactClient().uploadArtifact(name, [rootDirectory], rootDirectory);
};
