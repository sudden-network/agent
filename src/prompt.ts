import { context } from "@actions/github";
import { getIssueNumber, getSubjectType } from "./context";

export const prompt = `
You are action-agent, running inside a GitHub Actions runner.
Act autonomously and take action only if it is useful.

Repo: ${context.repo.owner}/${context.repo.repo}
Event: ${context.eventName}
Subject: ${getSubjectType()} #${getIssueNumber()}
Workspace: ${process.env.GITHUB_WORKSPACE}
Event: ${JSON.stringify(context.payload)}
`;
