import { Octokit } from '@octokit/core'
import { GraphqlResponseError } from '@octokit/graphql'
import { PUBLIC_PAT } from '$env/static/public'
import { get, writable } from 'svelte/store'
import { browser } from '$app/environment'
import { throttling, type ThrottlingOptions } from '@octokit/plugin-throttling'
import { retry } from '@octokit/plugin-retry'
// @ts-expect-error import missing from bottleneck's package.json
import BottleneckLight from 'bottleneck/light.js'
import type { UTCTimestamp } from 'lightweight-charts'
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

errors.push(
	"Sadly GitHub has restricted star history access to only your own repos :( Add an auth token if you want to see your own repo's star chart.",
)

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

export class RepoStars {
	// Fetching user IDs would add 200ms to the response time, so we use timestamps instead
	forward_star_times = new Set<string>()
	backward_star_times = new Set<string>()
	forward_count = 0
	backward_count_initialised = false
	backward_count = -1
	/** null means no more pages */
	next_cursor: { forward?: string; backward?: string } | null = {}
	total_count = 0
	request_queue: ReturnType<InstanceType<typeof RepoStars>['fetch']>[] = []
	data_points: { t: UTCTimestamp; v: number }[] = []
	constructor(
		public owner: string,
		public repo: string,
	) {
		this.owner = owner
		this.repo = repo
	}

	async fetch_concurrent() {
		if (this.request_queue.length === 0) {
			this.request_queue.push(this.fetch('forward'), this.fetch('backward'))
		}
		const promise = this.request_queue[0]
		this.request_queue.shift()
		const result = await promise
		if (result?.stargazers && this.next_cursor) {
			this.request_queue.push(this.fetch(result.stargazers.direction))
		}
		return result
	}

	async fetch(direction: 'forward' | 'backward') {
		if (this.next_cursor === null) {
			throw new Error('Unexpected RepoStars.fetch after completion')
		}
		// copy to prevent desync
		const cursor = { ...this.next_cursor }
		const start_time = Date.now()
		type Stargazers = {
			totalCount: number
			pageInfo: {
				startCursor: string
				endCursor: string
				hasNextPage: boolean
				hasPreviousPage: boolean
			}
			edges: {
				starredAt: string
			}[]
		}
		const response_promise = octokit.graphql<{
			repository: {
				stargazers: Stargazers
			}
		}>(
			`query($owner: String!, $repo: String!, $first: Int, $last: Int, $after: String, $before: String) {
				repository(owner: $owner, name: $repo) {
					stargazers(first: $first, last: $last, after: $after, before: $before, orderBy: {field: STARRED_AT, direction: ASC}) {
						totalCount
						pageInfo {
							startCursor
							endCursor
							hasNextPage
							hasPreviousPage
						}
						edges {
							starredAt
						}
					}
				}
				}`,
			{
				owner: this.owner,
				repo: this.repo,
				first: direction === 'forward' ? 100 : undefined,
				after: direction === 'forward' ? cursor.forward : undefined,
				last: direction === 'backward' ? 100 : undefined,
				before: direction === 'backward' ? cursor.backward : undefined,
			},
		)

		const response = await response_promise.catch((error) => {
			if (error instanceof GraphqlResponseError && error.errors) {
				return {
					error: error.errors.map((error) => error.message).join('/n'),
				}
			} else if (error instanceof Error) {
				return { error: `${error.name}: ${error.message}` }
			} else {
				return { error: "Couldn't fetch stargazers" }
			}
		})

		console.log('response took', Date.now() - start_time, response)
		if ('error' in response) {
			return { error: response.error, stargazers: undefined }
		}

		// const stargazers_forwards = response.repository.stargazers_forwards
		// const stargazers_backwards = response.repository.stargazers_backwards

		// if (!this.backwards_count_initialised) {
		// 	this.backwards_count = stargazers_backwards.totalCount
		// 	this.backwards_count_initialised = true
		// }

		// const star_times_forwards = stargazers_forwards.edges
		// 	.filter((edge) => !this.user_ids.has(edge.user.id))
		// 	.map((edge) => {
		// 		this.user_ids.add(edge.user.id)
		// 		this.forwards_count++
		// 		return {
		// 			t: Math.floor(new Date(edge.starredAt).getTime() / 1000) as UTCTimestamp,
		// 			v: this.forwards_count,
		// 		}
		// 	})

		// const star_times_backwards = stargazers_backwards.edges
		// 	.filter((edge) => !this.user_ids.has(edge.user.id))
		// 	.map((edge) => {
		// 		this.user_ids.add(edge.user.id)
		// 		this.backwards_count!--
		// 		return {
		// 			t: Math.floor(new Date(edge.starredAt).getTime() / 1000) as UTCTimestamp,
		// 			v: this.backwards_count!,
		// 		}
		// 	})
		const stargazers = response.repository.stargazers

		if (!this.backward_count_initialised) {
			this.backward_count = stargazers.totalCount + 1
			this.backward_count_initialised = true
		}

		const filtered_stargazers = stargazers.edges.filter((edge) => {
			// Stop once we reach overlapping data
			if (direction === 'forward') {
				return !this.backward_star_times.has(edge.starredAt)
			} else {
				return !this.forward_star_times.has(edge.starredAt)
			}
		})
		if (direction === 'backward') {
			filtered_stargazers.reverse() // correctly handle backward_count--
		}
		const star_times = filtered_stargazers.map((edge) => {
			if (direction === 'forward') {
				this.forward_star_times.add(edge.starredAt)
				this.forward_count++
			} else {
				this.backward_star_times.add(edge.starredAt)
				this.backward_count--
			}
			return {
				t: Math.floor(new Date(edge.starredAt).getTime() / 1000) as UTCTimestamp,
				v: direction === 'forward' ? this.forward_count : this.backward_count!,
			}
		})
		if (direction === 'backward') {
			star_times.reverse() // reset order
		}
		const has_overlapped = star_times.length !== stargazers.edges.length

		this.data_points.push(...star_times)
		this.data_points.sort((a, b) => a.t - b.t)

		if (has_overlapped) {
			this.next_cursor = null
		} else if (direction === 'forward' && stargazers.pageInfo.hasNextPage) {
			this.next_cursor = {
				forward: stargazers.pageInfo.endCursor,
				backward: this.next_cursor.backward,
			}
		} else if (direction === 'backward' && stargazers.pageInfo.hasPreviousPage) {
			this.next_cursor = {
				forward: this.next_cursor.forward,
				backward: stargazers.pageInfo.startCursor,
			}
		} else {
			this.next_cursor = null
		}

		this.total_count = Math.max(
			stargazers.totalCount,
			this.forward_star_times.size + this.backward_star_times.size,
		)

		return {
			error: undefined,
			stargazers: {
				direction,
				star_times_data: star_times,
			},
		}
	}
}
