<script lang="ts">
	import { fly, slide } from 'svelte/transition'
	import { errors, RepoStars } from './github'
	import { onMount, tick } from 'svelte'
	import '../app.sass'
	import Nav from './Nav.svelte'
	import ChartComponent from './Chart.svelte'
	import { get_next_color_index, new_chart, type Chart } from './chart'
	import type { UTCTimestamp } from 'lightweight-charts'
	import Tooltip from './Tooltip.svelte'
	import html2canvas from 'html2canvas'
	import { z } from 'zod'

	let [owner, repo] = ['', '']

	async function cached_fetch(owner: string, repo: string) {
		try {
			const full_api_request = await (
				await fetch(`https://emafuma.mywire.org:8090/allStars?repo=${owner}/${repo}`)
			).json()

			const schema = z.object({
				stars: z.array(z.tuple([z.string(), z.number().int(), z.int()])),
			})

			const result = schema.parse(full_api_request)
			let stars: { t: UTCTimestamp; v: number }[] = []
			let accumulated = 0
			for (const [t, _cached_amount, cached_accumulated] of result.stars) {
				if (!/\d{2}-\d{2}-\d{4}/.test(t)) {
					throw new Error('unexpected date: ' + t)
				}
				const date_components = t.split('-')
				const date = new Date(date_components.reverse().join('-'))
				while (accumulated < cached_accumulated) {
					accumulated++
					stars.push({
						t: (date.getTime() / 1000) as UTCTimestamp,
						v: accumulated,
					})
				}
			}
			return {
				stars: stars,
			}
		} catch (error) {
			console.error(error)
			return {
				stars: [] as { t: UTCTimestamp; v: number }[],
			}
		}
	}

	let chart: Chart | undefined
	async function get_stargazers(owner: string, repo: string) {
		if (!chart || !$chart) {
			errors.push('Chart not initialized')
			return
		}
		for (const line of $chart.lines) {
			if (line.name === `${owner}/${repo}`) {
				return // already added
			}
		}

		let count = 0
		const line_result = chart.addLine({
			name: `${owner}/${repo}`,
			color: get_next_color_index(),
			data: [],
		})
		if (!line_result.line) {
			errors.push(line_result.error)
			return
		}
		const line = line_result.line

		let cached_stars: Awaited<ReturnType<typeof cached_fetch>> | undefined
		cached_fetch(owner, repo).then((result) => {
			// cached_stars = result
		})

		const repo_stars = new RepoStars(owner, repo)
		const last_page_result = await repo_stars.get_last_page()
		if (!last_page_result.data) {
			errors.push(last_page_result.error)
			chart.deleteLine(line)
			return
		}
		const last_page = last_page_result.data.last_page

		for (let page = last_page; page >= 1; page--) {
			if (cached_stars && cached_stars.stars.length > 0) {
				line.data = []
				repo_stars.data_points = cached_stars.stars
				console.log('cached_stars', cached_stars.stars)
				chart.updateStargazers(line, repo_stars.data_points)
				chart.resetZoom()
				break
			}
			if (line.deleted) {
				return // abort
			}
			const star_history_result = await repo_stars.add_page(page)
			console.log('stargazers result', star_history_result)
			if (star_history_result.error) {
				errors.push(star_history_result.error)
				chart.deleteLine(line)
				return
			}

			console.log('data_points', repo_stars.data_points)
			console.log('count', repo_stars.total_count)
			chart.updateStargazers(line, repo_stars.data_points)
			if (page === last_page) {
				// for some reason doesn't work to begin with
				chart.resetZoom()
			}
		}
		console.log('add final', {
			t: Math.floor(new Date().getTime() / 1000) as UTCTimestamp,
			v: Math.max(repo_stars.total_count, count),
		})
		chart.addFinal(line, {
			t: Math.floor(new Date().getTime() / 1000) as UTCTimestamp,
			v: Math.max(repo_stars.total_count, count),
		})
		chart.save()
	}

	let width: number
	let height: number
	$: if (width) {
		height = Math.round(width * 0.6)
	}

	let container: HTMLDivElement
	onMount(() => {
		chart = new_chart(container, {
			width,
			height,
			layout: {
				attributionLogo: false,
			},
		})
	})
	$: $chart?.instance.applyOptions({
		width,
		height,
	})

	let main_el: HTMLElement
	let screenshot_mode = false

	async function download_image_of_element() {
		screenshot_mode = true
		await tick()
		const canvas_output = await html2canvas(main_el)
		const a = document.createElement('a')
		a.href = canvas_output.toDataURL('image/png')
		a.download = 'Starchart.png'
		a.click()
		screenshot_mode = false
	}
</script>

<Nav bind:owner bind:repo on_submit={() => get_stargazers(owner, repo)} />

<main bind:this={main_el}>
	{#each $errors as error, i (error.id)}
		<div class="error-container" transition:slide={{ duration: 200 }}>
			<div class="error" transition:fly={{ duration: 200, opacity: 0, y: -40 }}>
				{error.msg}
				<button
					type="button"
					aria-label="Dismiss error"
					on:click={() => {
						errors.remove_index(i)
					}}
				>
					<!-- Lucide download icon -->
					<svg
						fill="currentColor"
						width="18"
						height="18"
						clip-rule="evenodd"
						fill-rule="evenodd"
						stroke-linejoin="round"
						stroke-miterlimit="2"
						viewBox="0 0 24 24"
						xmlns="http://www.w3.org/2000/svg"
						><path
							d="m12 10.93 5.719-5.72c.146-.146.339-.219.531-.219.404 0 .75.324.75.749 0 .193-.073.385-.219.532l-5.72 5.719 5.719 5.719c.147.147.22.339.22.531 0 .427-.349.75-.75.75-.192 0-.385-.073-.531-.219l-5.719-5.719-5.719 5.719c-.146.146-.339.219-.531.219-.401 0-.75-.323-.75-.75 0-.192.073-.384.22-.531l5.719-5.719-5.72-5.719c-.146-.147-.219-.339-.219-.532 0-.425.346-.749.75-.749.192 0 .385.073.531.219z"
						/></svg
					>
				</button>
			</div>
		</div>
	{/each}

	{#if chart && $chart && $chart.lines.length > 0}
		<ChartComponent bind:chart {screenshot_mode} />
	{/if}
	<div class="chart" bind:clientWidth={width}>
		{#if chart && $chart && $chart.lines.length > 0}
			<div class="watermark">starchart.kasper.space</div>
		{/if}
		<div bind:this={container} class:hidden={!$chart || $chart.lines.length === 0}></div>
		{#if chart && $chart && $chart.lines.length > 0}
			<Tooltip {chart} />
		{/if}
	</div>
</main>

<div class="bottom-bar">
	{#if chart && $chart && $chart.lines.length > 0}
		<label>
			<input
				type="checkbox"
				checked={$chart.align}
				on:input={(e) => {
					if (!chart) {
						return
					} else if (e.currentTarget.checked) {
						chart.alignLines()
					} else {
						chart.unalignLines()
					}
					chart.save()
				}}
			/>
			Align
		</label>
		<label>
			<input
				type="checkbox"
				checked={$chart.logScale}
				on:input={(e) => {
					if (chart) {
						chart.setLogScale(e.currentTarget.checked)
						chart.save()
					}
				}}
			/>
			Logarithmic
		</label>
		<button
			type="button"
			class="bordered button download-button"
			on:click={download_image_of_element}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="lucide lucide-download-icon lucide-download"
				><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
					points="7 10 12 15 17 10"
				/><line x1="12" x2="12" y1="15" y2="3" /></svg
			>
			Download image
		</button>
	{/if}
</div>

<style lang="sass">
	main
		background-color: #111318
		padding: 30px
	.error-container
		padding-bottom: 1rem
	.error
		border: 2px solid hsla(0, 100%, 50%, 0.5)
		background-color: hsla(0, 100%, 50%, 0.25)
		border-radius: 8px
		padding: 0.75rem 1rem
		font-weight: 500
		margin: 0rem auto
		max-width: 650px
		font-size: 0.875rem
		position: relative
		text-align: initial
		button
			background: none
			border: none
			color: inherit
			position: relative
			position: absolute
			top: 0px
			right: 0px
			padding: 0.2rem 0.25rem
			&:hover
				opacity: 0.7
	.chart
		width: 100%
		position: relative // for tooltip
	.watermark
		position: absolute
		color: hsla(0, 0%, 100%, 0.1)
		top: 1.5rem
		left: 1.5rem
		z-index: 10
	.hidden
		display: none
	.bottom-bar
		padding-top: 10px
		padding-bottom: 50px
		display: flex
		gap: 12px
		margin-left: -6px
		flex-wrap: wrap
	label
		padding: 0.5rem
		font-size: 0.9375rem
		color: #FFFFFF
		display: inline-flex
		align-items: center
		user-select: none
	input[type='checkbox']
		appearance: none
		margin: 0px
		margin-right: 6px
		padding: 0px
		width: 1rem
		height: 1rem
		background-color: hsl(224, 9%, 20%)
		border-radius: 4px
		border: 1px solid hsl(228, 3%, 50%)
		transition: 120ms ease-out border-color
		&:checked
			background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")
		&:focus-visible
			border-color: #cbcaf7
			box-shadow: 0 0 1px #cbcaf7
			outline: 1px solid transparent
	.download-button
		margin-left: auto
		margin-right: 0.5rem
		border-radius: 8px
		display: flex
		align-items: center
		justify-content: center
		gap: 0.3rem
</style>
