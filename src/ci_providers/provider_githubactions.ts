/**
 * https://docs.github.com/en/actions/learn-github-actions/environment-variables
 */
import { request } from 'undici'

import { IServiceParams, UploaderEnvs, UploaderInputs } from '../types'

import { runExternalProgram } from "../helpers/util"
import { info, UploadLogger } from '../helpers/logger'

export function detect(envs: UploaderEnvs): boolean {
  return Boolean(envs.GITHUB_ACTIONS)
}

function _getBuild(inputs: UploaderInputs): string {
  const { args, envs } = inputs
  return args.build || envs.GITHUB_RUN_ID || ''
}

async function _getJobURL(inputs: UploaderInputs): Promise<string> {
  const url = `https://api.github.com/repos/${_getSlug(inputs)}/actions/runs/${_getBuild(inputs)}/jobs`
  const res = await request(url, {
    headers: {
      'User-Agent': 'Awesome-Octocat-App'
    }
  })
  if (res.statusCode !== 200) {
    return ''
  }

  const data = await res.body.json()
  const { envs } = inputs
  for (const job of data.jobs) {
    if (job.name == envs.GITHUB_JOB) {
      return job.html_url
    }
  }
  return ''
}

async function _getBuildURL(inputs: UploaderInputs): Promise<string> {
  const { envs } = inputs

  const url = await _getJobURL(inputs)
  if (url !== '') {
    return url
  }
  return (
    `${envs.GITHUB_SERVER_URL}/${_getSlug(inputs)}/actions/runs/${_getBuild(
      inputs,
    )}`
  )
}

function _getBranch(inputs: UploaderInputs): string {
  const { args, envs } = inputs
  const triggerName = envs.GITHUB_EVENT_NAME
  if (triggerName == "pull_request" || triggerName == "pull_request_target") {
    return args.branch || envs.GITHUB_REF || ''
  } else {
    return args.branch || envs.GITHUB_REF_NAME || ''
  }
}

function _getJob(envs: UploaderEnvs): string {
  return (envs.GITHUB_WORKFLOW || '')
}

function _getPR(inputs: UploaderInputs): string {
  const { args, envs } = inputs
  let match
  if (envs.GITHUB_HEAD_REF && envs.GITHUB_HEAD_REF !== '') {
    const prRegex = /refs\/pull\/([0-9]+)\/merge/
    const matches = prRegex.exec(envs.GITHUB_REF || '')
    if (matches) {
      match = matches[1]
    }
  }
  return args.pr || match || ''
}

function _getService(): string {
  return 'github-actions'
}

export function getServiceName(): string {
  return 'GitHub Actions'
}

function _getSHA(inputs: UploaderInputs): string {
  const { args, envs } = inputs
  if (args.sha) return args.sha

  const pr = _getPR(inputs)

  let commit = envs.GITHUB_SHA
  if (pr) {
    const mergeCommitRegex = /^[a-z0-9]{40} [a-z0-9]{40}$/
    const mergeCommitMessage = runExternalProgram('git', ['show', '--no-patch', '--format=%P'])
    UploadLogger.verbose(`Handling PR with parent hash(es) '${mergeCommitMessage}' of current commit.`)
    if (mergeCommitRegex.exec(mergeCommitMessage)) {
      const mergeCommit = mergeCommitMessage.split(' ')[1]
      info(`    Fixing merge commit SHA ${commit} -> ${mergeCommit}`)
      commit = mergeCommit
    } else if (mergeCommitMessage === '') {
      info(
        '->  Issue detecting commit SHA. Please run actions/checkout with fetch-depth > 1 or set to 0',
      )
    } else {
      info(`    Commit with SHA ${commit} of PR ${pr} is not a merge commit`)
    }
  }

  return args.sha || commit || ''
}

function _getSlug(inputs: UploaderInputs): string {
  const { args, envs } = inputs
  if (args.slug !== '') return args.slug
  return envs.GITHUB_REPOSITORY || ''
}

export async function getServiceParams(inputs: UploaderInputs): Promise<IServiceParams> {
  return {
    branch: _getBranch(inputs),
    build: _getBuild(inputs),
    buildURL: await _getBuildURL(inputs),
    commit: _getSHA(inputs),
    job: _getJob(inputs.envs),
    pr: _getPR(inputs),
    service: _getService(),
    slug: _getSlug(inputs),
  }
}

// https://docs.github.com/en/actions/learn-github-actions/variables
export function getEnvVarNames(): string[] {
  return [
    'GITHUB_ACTION',
    'GITHUB_HEAD_REF',
    'GITHUB_REF',
    'GITHUB_REPOSITORY',
    'GITHUB_RUN_ID',
    'GITHUB_SERVER_URL',
    'GITHUB_SHA',
    'GITHUB_WORKFLOW',
    'GITHUB_EVENT_NAME',
    'GITHUB_REF_NAME',
  ]
}
