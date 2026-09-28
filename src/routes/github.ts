import { Octokit } from '@octokit/core'
import { RequestError } from 'octokit'
import { PUBLIC_PAT } from '$env/static/public'
import { get, writable } from 'svelte/store'
import { browser } from '$app/environment'
import { throttling, type ThrottlingOptions } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
// @ts-expect-error import missing from bottleneck's package.json
import BottleneckLight from 'bottleneck/light.js'
import type { UTCTimestamp } from 'lightweight-charts'
import type { DataPoint } from './chart'
const Bottleneck = BottleneckLight as typeof import('bottleneck').default

const loaded_token = browser ? localStorage.getItem('starchart-token') : undefined
export const token = writable(loaded_token || '')
if (browser) {
	token.subscribe((value) => {
		if (value === '') {
			localStorage.removeItem('starchart-token')
		} else {
			localStorage.setItem('starchart-token', value)
		}
	})
}

let next_error_id = 0
const errors_store = writable<{ id: number; msg: string }[]>([])
export const errors = {
	subscribe: errors_store.subscribe,
	push(msg: string) {
		errors_store.update((errors) => {
			errors.push({ id: next_error_id++, msg })
			return errors
		})
	},
	remove_index(index: number) {
		errors_store.update((errors) => {
			errors.splice(index, 1)
			return errors
		})
	},
}

const rate_limit_handler: ThrottlingOptions['onRateLimit'] = (
	retry_after,
	options,
	octokit,
	retry_count,
) => {
	const retry_message = ` Retrying in ${retry_after} seconds.`
	const max_retries = 3
	if (retry_count < max_retries) {
		errors.push(`Rate limit reached.${retry_message}`)
		return true // retry
	}
	errors.push(`Rate limit reached ${max_retries} times.`)
}

const MyOctokit = Octokit.plugin(throttling, retry)
const octokit = new MyOctokit({
	auth: get(token) || PUBLIC_PAT,
	throttle: {
		onRateLimit: rate_limit_handler,
		onSecondaryRateLimit: rate_limit_handler,
		// The `write` group is what @octokit/plugin-throttling uses for the GraphQL API
		// This property is undocumented, but it is typed at least
		write: new Bottleneck.Group({
			maxConcurrent: 10,
			minTime: 100,
			// from @octokit/plugin-throttling source code:
			id: 'octokit-write',
			timeout: 1000 * 60 * 2,
		}),
	},
})

type StargazersHistory = {
	week: UTCTimestamp
	total: number
	days: [number, number, number, number, number, number, number]
}[]

export class RepoStars {
	total_count = 0
	data_points: DataPoint[] = []

	constructor(
		public owner: string,
		public repo: string,
	) {
		this.owner = owner
		this.repo = repo
	}

	// async get_repo_info() {
	// 	const repo = await octokit.request('GET /repos/{owner}/{repo}', {
	// 		owner: this.owner,
	// 		repo: this.repo,
	// 	})
	// 	const official_stargazers_count = repo.data.stargazers_count
	// 	const created_at = new Date(repo.data.created_at).getTime()
	// 	const weeks_since_creation = Math.floor((Date.now() - created_at) / 1000 / 60 / 60 / 24 / 7)
	// 	const last_page = Math.ceil(official_stargazers_count / 30)
	// }

	async get_page(page_n: number) {
		const history_result = await octokit
			.request('GET /repos/{owner}/{repo}/stargazers/history', {
				owner: this.owner,
				repo: this.repo,
				per_page: 30,
				page: page_n,
				headers: {
					'X-GitHub-Api-Version': '2026-03-10',
				},
			})
			.catch((error) => {
				if (error instanceof RequestError) {
					return {
						error: error.message,
					}
				} else if (error instanceof Error) {
					return { error: `${error.name}: ${error.message}` }
				} else {
					return { error: "Couldn't fetch stargazers" }
				}
			})
		if ('error' in history_result) {
			return { error: history_result.error }
		}
		const data: StargazersHistory = history_result.data
		return {
			headers: history_result.headers,
			data,
		}
	}

	async get_last_page() {
		const star_history = await this.get_page(100)
		if (!star_history.data) {
			return { error: star_history.error }
		}
		const link_header = star_history.headers.link ?? ''
		// regex from https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api?apiVersion=2026-03-10
		const last_pattern = /<([^<>]+)>; rel="last"/
		const last_url_str = link_header.match(last_pattern)?.[1]
		if (!last_url_str) {
			if (star_history.data.length > 0) {
				return { data: { last_page: 100 } }
			} else {
				return { error: 'Unexpected missing last stargazers page link' }
			}
		}
		let last_url: URL
		try {
			last_url = new URL(last_url_str)
		} catch (_) {
			return { error: 'Invalid last page URL: ' + last_url_str }
		}
		const last_page = Number(last_url.searchParams.get('page'))
		if (!Number.isFinite(last_page)) {
			return { error: 'Unexpected missing last link page param' }
		}
		return { data: { last_page } }
	}

	async add_page(page: number) {
		const star_history = await this.get_page(page)
		console.log('add_page history', star_history)
		if (!star_history.data) {
			return { error: star_history.error }
		}
		star_history.data.reverse()
		for (const week of star_history.data) {
			week.days.reverse()
			for (const [i, day] of week.days.entries()) {
				this.total_count += day
				console.log(
					't',
					week.week + i * 86400,
					'week',
					week.week,
					'total_count',
					this.total_count,
					'i',
					i,
				)
				this.data_points.push({
					t: (week.week + i * 86400) as UTCTimestamp,
					v: this.total_count,
				})
			}
		}
		return { error: null }
	}
}
