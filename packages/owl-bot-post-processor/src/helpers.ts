// Copyright 2021 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import {sign} from 'jsonwebtoken';
import {readFile} from 'fs/promises';
import {request} from 'gaxios';
import {CloudBuildClient} from '@google-cloud/cloudbuild';

export interface BuildArgs {
  'pem-path': string;
  'app-id': number;
  installation: string;
  repo: string;
  pr: string;
  project?: string;
  trigger: string;
}

export async function triggerBuild(argv: BuildArgs) {
  const token = await getToken(
    argv['pem-path'],
    argv['app-id'],
    argv.installation
  );
  const project = argv.project || process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    throw Error('gcloud project must be provided');
  }
  const cb = new CloudBuildClient();
  const [owner, repo] = argv.repo.split('/');
  const [resp] = await cb.runBuildTrigger({
    projectId: project,
    triggerId: argv.trigger,
    source: {
      projectId: project,
      branchName: 'owlbot',
      substitutions: {
        _GITHUB_TOKEN: token.token,
        _PR: argv.pr,
        // TODO: we should be able to get this information from the PR:
        _PR_BRANCH: 'create-pr',
        _PR_OWNER: 'bcoe',
        _OWNER: owner,
        _REPOSITORY: repo,
        _CONTAINER: 'node',
      },
    },
  });
  console.info(resp);
}

interface token {
  token: string;
  expires_at: string;
  permissions: object;
  repository_selection: string;
}

export async function getToken(
  pemPath: string,
  appId: number,
  installation: string
): Promise<token> {
  const privateKey = await readFile(pemPath);
  const payload = {
    // issued at time
    iat: parseInt('' + Date.now() / 1000),
    // JWT expiration time (10 minute maximum)
    exp: parseInt('' + Date.now() / 1000 + 10 * 60),
    // GitHub App's identifier
    iss: appId,
  };
  const jwt = sign(payload, privateKey, {algorithm: 'RS256'});
  const resp = await request({
    url: accessTokenURL(installation),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (resp.status !== 201) {
    throw Error(`unexpectedd response http = ${resp.status}`);
  } else {
    return resp.data as token;
  }
}

export function accessTokenURL(installation: string) {
  return `https://api.github.com/app/installations/${installation}/access_tokens`;
}
